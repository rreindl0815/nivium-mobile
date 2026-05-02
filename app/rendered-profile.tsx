import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, ImageBackground, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';

import { useAppAccess } from '@/context/app-access-context';
import { useSavedProfiles } from '@/context/saved-profiles-context';
import { parseFormattedProfile } from '@/utils/profile-document';

export default function RenderedProfileScreen() {
  const router = useRouter();
  const { isPaid, setTier } = useAppAccess();
  const params = useLocalSearchParams<{ profileId?: string; viewer?: string }>();
  const { profiles, selectedProfile } = useSavedProfiles();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerImageDataUri, setViewerImageDataUri] = useState<string | null>(null);
  const routeProfileId = Array.isArray(params.profileId) ? params.profileId[0] : params.profileId;
  const routeViewer = Array.isArray(params.viewer) ? params.viewer[0] : params.viewer;
  const explicitProfile = routeProfileId ? profiles.find((profile) => profile.id === routeProfileId) ?? null : null;
  const activeProfile = routeProfileId ? explicitProfile : selectedProfile;
  const shouldOpenViewer = routeViewer === '1';
  const basePreviewWidth = Math.max(300, screenWidth - 64);
  const basePreviewHeight = 220;
  const modalMaxWidth = screenWidth - 18;
  const modalMaxHeight = screenHeight - 120;
  const modalPreviewWidth = Math.min(modalMaxWidth, modalMaxHeight / 1.4286);
  const modalPreviewHeight = modalPreviewWidth * 1.4286;
  const parsedProfile = activeProfile?.formattedText ? parseFormattedProfile(activeProfile.formattedText) : null;
  const previewFileName = activeProfile?.previewImageUri?.split('/').pop() ?? 'missing';
  const createdStamp = activeProfile?.createdAt
    ? new Date(activeProfile.createdAt).toLocaleString()
    : 'missing';
  const rawStabilitySnippet = (() => {
    const raw = activeProfile?.rawNotes ?? '';
    if (!raw.trim()) {
      return 'missing';
    }
    const match = raw.match(/(stability test[\s\S]*?)(?:\d{1,3}[°º]?\s*\d{1,2}'\d{1,2}"?|$)/i);
    return (match?.[1] ?? raw.slice(Math.max(0, raw.toLowerCase().indexOf('stability')), raw.length))
      .replace(/\s+/g, ' ')
      .trim() || 'missing';
  })();

  const handlePaidAction = (label: string, route: '/archive' | '/print' | '/share') => {
    if (isPaid) {
      router.push(route);
      return;
    }
    router.push({
      pathname: '/upgrade',
      params: { feature: label, returnTo: route },
    });
  };
  useEffect(() => {
    let cancelled = false;

    async function loadViewerImage() {
      if (!activeProfile?.previewImageUri) {
        setViewerImageDataUri(null);
        return;
      }

      try {
        const base64 = await FileSystem.readAsStringAsync(activeProfile.previewImageUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        if (!cancelled) {
          setViewerImageDataUri(`data:image/png;base64,${base64}`);
        }
      } catch {
        if (!cancelled) {
          setViewerImageDataUri(null);
        }
      }
    }

    loadViewerImage();

    return () => {
      cancelled = true;
    };
  }, [activeProfile?.previewImageUri]);

  const viewerHtml = viewerImageDataUri
    ? `<!doctype html>
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=8.0, minimum-scale=1.0, user-scalable=yes" />
            <style>
              html, body {
                margin: 0;
                padding: 0;
                background: #020811;
                min-height: 100%;
              }
              body {
                display: flex;
                align-items: flex-start;
                justify-content: center;
              }
              img {
                display: block;
                width: 100%;
                height: auto;
                max-width: 100%;
              }
              .frame {
                width: 100%;
                padding: 8px 12px 12px;
                box-sizing: border-box;
              }
            </style>
          </head>
          <body>
            <div class="frame">
              <img src="${viewerImageDataUri}" />
            </div>
          </body>
        </html>`
    : null;

  if (routeProfileId && !explicitProfile) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.viewerBackdrop}>
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Opening saved profile...</Text>
            <Text style={styles.emptyCopy}>Nivium is loading the exact render you just created.</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (shouldOpenViewer && activeProfile?.previewImageUri && viewerHtml) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.viewerBackdrop}>
          <View style={styles.viewerTopBar}>
            <Text style={styles.viewerTitle}>{activeProfile?.title || 'Profile'}</Text>
            <View style={styles.viewerTopActions}>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/rendered-profile',
                    params: activeProfile ? { profileId: activeProfile.id } : undefined,
                  })
                }
                style={[styles.primaryActionShell, styles.viewerActionShell]}>
                <View style={styles.primaryActionHighlight} />
                <View style={styles.primaryActionFrame}>
                  <View style={styles.primaryAction}>
                    <Text style={styles.primaryActionText}>Back</Text>
                  </View>
                </View>
              </Pressable>
              <Pressable onPress={() => router.push('/archive')} style={[styles.primaryActionShell, styles.viewerActionShell]}>
                <View style={styles.primaryActionHighlight} />
                <View style={styles.primaryActionFrame}>
                  <View style={styles.primaryAction}>
                    <Text style={styles.primaryActionText}>Archive</Text>
                  </View>
                </View>
              </Pressable>
            </View>
          </View>
          <View style={styles.viewerStage}>
            <WebView
              source={{ html: viewerHtml }}
              originWhitelist={['*']}
              style={styles.viewerWebView}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              scrollEnabled
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.panel}>
        <ImageBackground source={require('../assets/images/nivium-hero-snow.png')} imageStyle={styles.heroImage} style={styles.hero}>
          <View style={styles.heroOverlay} />
          <Text style={styles.heroTitle}>Nivium</Text>
          <View style={styles.heroSubtitleStack}>
            <Text style={styles.heroSubtitle}>Profile</Text>
            <Image source={require('../assets/images/nivium-hero-swish.png')} style={styles.heroSubtitleSwish} resizeMode="stretch" />
          </View>
        </ImageBackground>

        <View style={styles.selectedShell}>
          <View style={styles.cardHighlight} />
          <View style={styles.selectedPanel}>
            <View style={styles.cardAccent} />
            <Text style={styles.sectionLabel}>Current Profile</Text>
            <Text style={styles.selectedTitle}>{activeProfile?.title || 'Rendered Profile'}</Text>
            <Text style={styles.selectedSubtitle}>
              {activeProfile?.documentKind === 'plot'
                ? 'Finished plotted Nivium profile'
                : 'Saved profile document'}
            </Text>
            <View style={styles.selectedActions}>
              <View style={styles.actionRow}>
                <Pressable onPress={() => handlePaidAction('Archive', '/archive')} style={[styles.primaryActionShell, styles.actionWide]}>
                  <View style={styles.primaryActionHighlight} />
                  <View style={styles.primaryActionFrame}>
                    <View style={styles.primaryAction}>
                      <Text style={styles.primaryActionText}>Archive</Text>
                    </View>
                  </View>
                </Pressable>
                <Pressable onPress={() => handlePaidAction('Print', '/print')} style={[styles.secondaryActionShell, styles.actionNarrow]}>
                  <View style={styles.secondaryActionFrame}>
                    <View style={styles.secondaryAction}>
                      <Text style={styles.secondaryActionText}>Print</Text>
                    </View>
                  </View>
                </Pressable>
              </View>
              <View style={styles.actionRow}>
                <Pressable onPress={() => handlePaidAction('Share', '/share')} style={[styles.secondaryActionShell, styles.actionNarrow]}>
                  <View style={styles.secondaryActionFrame}>
                    <View style={styles.secondaryAction}>
                      <Text style={styles.secondaryActionText}>Share</Text>
                    </View>
                  </View>
                </Pressable>
                <Pressable onPress={() => router.push('/')} style={[styles.primaryActionShell, styles.actionWide]}>
                  <View style={styles.primaryActionHighlight} />
                  <View style={styles.primaryActionFrame}>
                    <View style={styles.primaryAction}>
                      <Text style={styles.primaryActionText}>Home</Text>
                    </View>
                  </View>
                </Pressable>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.previewShell}>
          <View style={styles.cardHighlight} />
          <View style={styles.previewPanel}>
            <View style={styles.zoomRow}>
              <Text style={styles.zoomLabel}>Preview</Text>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/rendered-profile',
                    params: activeProfile ? { profileId: activeProfile.id, viewer: '1' } : undefined,
                  })
                }
                style={styles.previewHeaderButton}>
                <Text style={styles.previewZoomButtonText}>Open full profile</Text>
              </Pressable>
            </View>
            {activeProfile?.previewImageUri ? (
              <View style={styles.previewTapTarget}>
                <View
                  style={[
                    styles.previewStaticFrame,
                    {
                      width: basePreviewWidth,
                      height: basePreviewHeight,
                    },
                  ]}>
                  <Image
                    source={{ uri: activeProfile.previewImageUri }}
                    style={styles.previewImage}
                    resizeMode="contain"
                  />
                </View>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No rendered preview found</Text>
                <Text style={styles.emptyCopy}>
                  The plotted PDF exists, but the preview image was not available for this saved profile.
                </Text>
              </View>
            )}
            {activeProfile ? (
              <View style={styles.debugPanel}>
                <Text style={styles.debugTitle}>Debug</Text>
                <Text style={styles.debugLine}>ID: {activeProfile.id}</Text>
                <Text style={styles.debugLine}>Created: {createdStamp}</Text>
                <Text style={styles.debugLine}>Preview: {previewFileName}</Text>
                <Text style={styles.debugLine}>Source: {activeProfile.sourceKind ?? 'missing'}</Text>
                {activeProfile.renderError ? <Text style={styles.debugLine}>RenderError: {activeProfile.renderError}</Text> : null}
                <Text style={styles.debugLine}>Raw stability: {rawStabilitySnippet}</Text>
                <Text style={styles.debugLine}>Tests: {parsedProfile?.stabilityTests.length ?? 0}</Text>
                {parsedProfile?.stabilityTests.length ? (
                  parsedProfile.stabilityTests.map((line, index) => (
                    <Text key={`debug-stability-${index}`} style={styles.debugLine}>
                      {line}
                    </Text>
                  ))
                ) : (
                  <Text style={styles.debugLine}>No stability lines parsed from saved formattedText.</Text>
                )}
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
      <Modal visible={viewerOpen} animationType="fade" transparent onRequestClose={() => setViewerOpen(false)}>
        <View style={styles.viewerBackdrop}>
          <View style={styles.viewerTopBar}>
            <Text style={styles.viewerTitle}>Pinch To Zoom</Text>
            <Pressable
              onPress={() => {
                setViewerOpen(false);
              }}
              style={styles.viewerCloseButton}>
              <Text style={styles.viewerCloseText}>Back</Text>
            </Pressable>
          </View>
          <View style={styles.viewerStage}>
            {viewerHtml ? (
              <WebView
                source={{ html: viewerHtml }}
                originWhitelist={['*']}
                style={styles.viewerWebView}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                scrollEnabled
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#20384D',
  },
  panel: {
    padding: 20,
    paddingTop: 72,
    paddingBottom: 40,
    gap: 16,
  },
  hero: {
    overflow: 'hidden',
    borderRadius: 8,
    minHeight: 220,
    paddingHorizontal: 24,
    paddingVertical: 26,
    justifyContent: 'flex-end',
    backgroundColor: '#10253A',
    shadowColor: '#102433',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.26,
    shadowRadius: 24,
    elevation: 12,
  },
  heroImage: { borderRadius: 8 },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 20, 36, 0.54)',
  },
  heroTitle: {
    color: '#FFF8EE',
    fontSize: 42,
    lineHeight: 46,
    fontWeight: '800',
  },
  heroSubtitleStack: {
    marginTop: 'auto',
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  heroSubtitle: {
    color: '#E2EDF4',
    fontSize: 17,
    lineHeight: 24,
  },
  heroSubtitleSwish: {
    marginTop: 2,
    marginRight: -10,
    width: 136,
    height: 24,
    opacity: 0.96,
    alignSelf: 'flex-end',
  },
  selectedShell: {
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#06080B',
    shadowColor: '#091827',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 12,
  },
  previewShell: {
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#06080B',
    shadowColor: '#091827',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 12,
  },
  cardHighlight: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: 3,
    height: 8,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  cardAccent: {
    width: 68,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#20384D',
    marginBottom: 16,
  },
  selectedPanel: {
    borderRadius: 5,
    padding: 20,
    backgroundColor: '#173248',
  },
  previewPanel: {
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: '#0F2234',
    minHeight: 0,
  },
  zoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 2,
  },
  zoomLabel: {
    color: '#D4E1EA',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  debugPanel: {
    marginTop: 10,
    marginHorizontal: 12,
    marginBottom: 14,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(4, 14, 24, 0.82)',
    gap: 4,
  },
  debugTitle: {
    color: '#9FD0FF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  debugLine: {
    color: '#D8E6F0',
    fontSize: 11,
    lineHeight: 15,
  },
  sectionLabel: {
    color: '#B7CCD8',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  selectedTitle: {
    marginTop: 8,
    color: '#FFF8EE',
    fontSize: 24,
    fontWeight: '800',
  },
  selectedSubtitle: {
    marginTop: 8,
    color: '#D9E4EA',
    fontSize: 15,
    lineHeight: 22,
  },
  selectedActions: {
    marginTop: 18,
    gap: 10,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionWide: {
    flex: 1.6,
  },
  actionNarrow: {
    flex: 1,
  },
  primaryActionShell: {
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#06080B',
  },
  primaryActionHighlight: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: 3,
    height: 8,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  primaryActionFrame: {
    borderRadius: 5,
    padding: 2,
    backgroundColor: '#173248',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.28)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.18)',
    borderRightWidth: 2,
    borderRightColor: 'rgba(7,20,36,0.34)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(7,20,36,0.5)',
  },
  primaryAction: {
    borderRadius: 3,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#3B627D',
    alignItems: 'center',
  },
  primaryActionText: {
    color: '#FFF8EE',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryActionShell: {
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#06080B',
  },
  secondaryActionFrame: {
    borderRadius: 5,
    padding: 2,
    backgroundColor: '#20384D',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.22)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.14)',
    borderRightWidth: 2,
    borderRightColor: 'rgba(7,20,36,0.3)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(7,20,36,0.44)',
  },
  secondaryAction: {
    borderRadius: 3,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#A9B8C4',
    alignItems: 'center',
  },
  secondaryActionText: {
    color: '#173248',
    fontSize: 15,
    fontWeight: '700',
  },
  previewTapTarget: {
    width: '100%',
    position: 'relative',
    alignItems: 'center',
  },
  previewHeaderButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(23, 50, 72, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  previewZoomButtonText: {
    color: '#FFF8EE',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  previewStaticFrame: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F6F8',
    borderWidth: 1,
    borderColor: '#8EA2B0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F3F6F8',
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(3, 10, 18, 0.96)',
    paddingTop: 92,
    paddingBottom: 28,
  },
  viewerTopBar: {
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 20,
  },
  viewerTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    marginTop: 12,
  },
  viewerTitle: {
    color: '#F4F8FB',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  viewerActionShell: {
    flex: 1,
  },
  viewerCloseButton: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#173248',
  },
  viewerCloseText: {
    color: '#FFF8EE',
    fontSize: 14,
    fontWeight: '700',
  },
  viewerStage: {
    flex: 1,
    overflow: 'hidden',
  },
  viewerWebView: {
    flex: 1,
    backgroundColor: '#020811',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 10,
  },
  emptyTitle: {
    color: '#FFF8EE',
    fontSize: 22,
    fontWeight: '800',
  },
  emptyCopy: {
    color: '#C7D6E0',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});
