import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, ImageBackground, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useSavedProfiles } from '@/context/saved-profiles-context';

export default function RawNotesPendingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ profileId?: string }>();
  const { profiles, selectedProfile, ensureProfilePdf, retryPendingVoiceProcessing } = useSavedProfiles();
  const [isRetrying, setIsRetrying] = useState(false);
  const explicitProfile = params.profileId ? profiles.find((profile) => profile.id === params.profileId) ?? null : null;
  const activeProfile = explicitProfile ?? selectedProfile;
  const isPendingVoiceProcessing = activeProfile?.pendingAction === 'process-voice-audio';
  const isPendingRender = activeProfile?.pendingAction === 'render-profile';
  const notePreview =
    activeProfile?.transcriptRaw?.trim() ||
    activeProfile?.rawNotes?.trim() ||
    (isPendingVoiceProcessing
      ? 'Audio recording saved locally. Retry processing when network or service is available again.'
      : 'No voice notes were saved on this profile.');
  const sectionLabel = isPendingVoiceProcessing ? 'Waiting To Process Voice Notes' : isPendingRender ? 'Waiting To Render' : 'Waiting To Format';
  const statusCopy = isPendingVoiceProcessing
    ? 'Your voice recording is saved in Archive on this device. Once the app has a working connection and backend service, retry processing to continue into Profile Review. If you leave the app now, reopen Nivium and go to Archive to find this saved recording.'
    : isPendingRender
      ? 'Your structured profile data is already saved in Archive on this device. Once the app has a working connection and backend service, retry render to create the final plotted profile. If you leave the app now, reopen Nivium and go to Archive to find this saved profile.'
      : 'Your voice notes are saved on the device. The final plotted profile can be formatted and rendered when the app has a working connection and backend service again.';
  const primaryActionLabel = isPendingVoiceProcessing ? 'Retry Processing' : isPendingRender ? 'Retry Render' : 'Try Again';
  const statusDetail = activeProfile?.pendingMessage?.trim() || activeProfile?.renderError?.trim() || '';

  const handleRetry = () => {
    if (!activeProfile) {
      return;
    }

    void (async () => {
      try {
        setIsRetrying(true);
        if (activeProfile.pendingAction === 'process-voice-audio') {
          const retryResult = await retryPendingVoiceProcessing(activeProfile.id);
          if (retryResult.profile && !retryResult.error) {
            router.replace('/voice-review');
            return;
          }

          Alert.alert(
            'Still Waiting On Connection',
            retryResult.error || 'Your recording is still saved locally and can be retried once network and service are available again.'
          );
          return;
        }

        const renderResult = await ensureProfilePdf(activeProfile.id);
        if (renderResult.uri) {
          router.replace({
            pathname: '/rendered-profile',
            params: { profileId: activeProfile.id },
          });
          return;
        }

        Alert.alert(
          'Still Waiting On Connection',
          renderResult.error ||
            'Voice notes were saved, but formatting and rendering still need a connection before the final plotted profile can be created.'
        );
      } finally {
        setIsRetrying(false);
      }
    })();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.panel} showsVerticalScrollIndicator={false}>
        <ImageBackground source={require('../assets/images/nivium-hero-snow.png')} imageStyle={styles.heroImage} style={styles.hero}>
          <View style={styles.heroOverlay} />
          <Text style={styles.heroTitle}>Nivium</Text>
          <View style={styles.heroSubtitleStack}>
            <Text style={styles.heroSubtitle}>Voice Notes Saved</Text>
            <Image source={require('../assets/images/nivium-hero-swish.png')} style={styles.heroSubtitleSwish} resizeMode="stretch" />
          </View>
        </ImageBackground>

        <View style={styles.statusShell}>
          <View style={styles.cardHighlight} />
          <View style={styles.statusPanel}>
            <View style={styles.cardAccent} />
            <Text style={styles.sectionLabel}>{sectionLabel}</Text>
            <Text style={styles.statusTitle}>{activeProfile?.title || 'Voice notes saved'}</Text>
            <Text style={styles.statusCopy}>{statusCopy}</Text>
            {statusDetail ? <Text style={styles.errorCopy}>Current status: {statusDetail}</Text> : null}
          </View>
        </View>

        <View style={styles.notesShell}>
          <View style={styles.cardHighlight} />
          <View style={styles.notesPanel}>
            <View style={styles.cardAccent} />
            <Text style={styles.sectionLabel}>Saved Voice Notes</Text>
            <Text style={styles.notesText}>{notePreview}</Text>
          </View>
        </View>

        <View style={styles.actionsShell}>
          <View style={styles.cardHighlight} />
          <View style={styles.actionsPanel}>
            <View style={styles.cardAccent} />
            <Text style={styles.sectionLabel}>Next Step</Text>
            <View style={styles.actionStack}>
              <Pressable disabled={!activeProfile || isRetrying} onPress={handleRetry} style={[styles.primaryActionShell, !activeProfile || isRetrying ? styles.primaryActionDisabled : null]}>
                <View style={styles.primaryActionHighlight} />
                  <View style={styles.primaryActionFrame}>
                    <View style={styles.primaryAction}>
                      {isRetrying ? (
                        <View style={styles.loadingRow}>
                          <ActivityIndicator size="small" color="#FFF8EE" />
                          <Text style={styles.primaryActionText}>{primaryActionLabel}</Text>
                        </View>
                      ) : (
                        <Text style={styles.primaryActionText}>{primaryActionLabel}</Text>
                      )}
                    </View>
                  </View>
                </Pressable>

              <View style={styles.actionRow}>
                <Pressable onPress={() => router.push('/archive')} style={styles.secondaryActionShell}>
                  <View style={styles.secondaryActionFrame}>
                    <View style={styles.secondaryAction}>
                      <Text style={styles.secondaryActionText}>Archive</Text>
                    </View>
                  </View>
                </Pressable>
              </View>

              <Pressable onPress={() => router.push('/')} style={styles.secondaryActionShell}>
                <View style={styles.secondaryActionFrame}>
                  <View style={styles.secondaryAction}>
                    <Text style={styles.secondaryActionText}>Home</Text>
                  </View>
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#20384D' },
  panel: { padding: 20, paddingTop: 72, paddingBottom: 40, gap: 16 },
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
    letterSpacing: 0.6,
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
    width: 194,
    height: 24,
    opacity: 0.96,
    alignSelf: 'flex-end',
  },
  statusShell: {
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#06080B',
    shadowColor: '#091827',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 12,
  },
  notesShell: {
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#06080B',
    shadowColor: '#091827',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 12,
  },
  actionsShell: {
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
  statusPanel: {
    borderRadius: 5,
    padding: 20,
    backgroundColor: '#173248',
  },
  notesPanel: {
    borderRadius: 5,
    padding: 20,
    backgroundColor: '#BECEDA',
  },
  actionsPanel: {
    borderRadius: 5,
    padding: 20,
    backgroundColor: '#173248',
  },
  cardAccent: {
    width: 68,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#20384D',
    marginBottom: 16,
  },
  sectionLabel: {
    color: '#B7CCD8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statusTitle: {
    marginTop: 8,
    color: '#FFF8EE',
    fontSize: 24,
    fontWeight: '800',
  },
  statusCopy: {
    marginTop: 10,
    color: '#D9E4EA',
    fontSize: 15,
    lineHeight: 22,
  },
  errorCopy: {
    marginTop: 10,
    color: '#AFC3CE',
    fontSize: 13,
    lineHeight: 18,
  },
  notesText: {
    marginTop: 8,
    color: '#20384D',
    fontSize: 15,
    lineHeight: 22,
  },
  actionStack: {
    marginTop: 6,
    gap: 10,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryActionShell: {
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#06080B',
  },
  primaryActionDisabled: {
    opacity: 0.72,
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
    borderTopColor: 'rgba(255,255,255,0.22)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.14)',
    borderRightWidth: 2,
    borderRightColor: 'rgba(7,20,36,0.34)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(7,20,36,0.5)',
  },
  primaryAction: {
    minHeight: 60,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2C5273',
  },
  primaryActionText: {
    color: '#FFF8EE',
    fontSize: 17,
    fontWeight: '800',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  secondaryActionShell: {
    flex: 1,
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#06080B',
  },
  secondaryActionFrame: {
    borderRadius: 5,
    padding: 2,
    backgroundColor: '#173248',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.18)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.12)',
    borderRightWidth: 2,
    borderRightColor: 'rgba(7,20,36,0.28)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(7,20,36,0.42)',
  },
  secondaryAction: {
    minHeight: 56,
    borderRadius: 3,
    backgroundColor: '#D6E0E7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    color: '#20384D',
    fontSize: 16,
    fontWeight: '700',
  },
});
