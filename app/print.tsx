import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Image, ImageBackground, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppAccess } from '@/context/app-access-context';
import { useSavedProfiles } from '@/context/saved-profiles-context';
import { getProfileHighlights, parseFormattedProfile } from '@/utils/profile-document';

export default function PrintScreen() {
  const router = useRouter();
  const { isPaid } = useAppAccess();
  const { selectedProfile, ensureProfilePdf } = useSavedProfiles();
  const highlights = selectedProfile ? getProfileHighlights(parseFormattedProfile(selectedProfile.formattedText)) : null;

  useEffect(() => {
    if (!isPaid) {
      router.replace({ pathname: '/upgrade', params: { feature: 'Print', returnTo: '/print' } });
    }
  }, [isPaid, router]);

  if (!isPaid) {
    return null;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.panel}>
        <ImageBackground source={require('../assets/images/nivium-hero-snow.png')} imageStyle={styles.heroImage} style={styles.hero}>
          <View style={styles.heroOverlay} />
          <Text style={styles.heroTitle}>Nivium</Text>
          <View style={styles.heroSubtitleStack}>
            <Text style={styles.heroSubtitle}>Print Profile</Text>
            <Image source={require('../assets/images/nivium-hero-swish.png')} style={styles.heroSubtitleSwish} resizeMode="stretch" />
          </View>
        </ImageBackground>

        <View style={styles.selectedShell}>
          <View style={styles.cardHighlight} />
          <View style={styles.selectedPanel}>
            <View style={styles.cardAccent} />
            <Text style={styles.sectionLabel}>Selected Profile</Text>
            <Text style={styles.selectedTitle}>{selectedProfile?.title || 'No saved profile selected'}</Text>
            <Text style={styles.selectedSubtitle}>
              {selectedProfile?.subtitle || 'Choose a saved profile from Archive first.'}
            </Text>
            <Text style={styles.selectedMeta}>
              {selectedProfile
                ? `${highlights?.layerCount ?? 0} layers · ${highlights?.temperatureCount ?? 0} temps · ${highlights?.stabilityCount ?? 0} tests · ${selectedProfile.documentKind === 'plot' ? 'Plotted PDF' : 'Report PDF'}`
                : 'Print works from the currently selected saved profile.'}
            </Text>

            <View style={styles.selectedActions}>
              <Pressable
                disabled={!selectedProfile}
                onPress={() => {
                  if (!selectedProfile) {
                    return;
                  }
                  void (async () => {
                    const renderResult = await ensureProfilePdf(selectedProfile.id);
                    if (!renderResult.uri) {
                      Alert.alert('Print Unavailable', renderResult.error || 'The plotted renderer did not complete for this profile yet.');
                      return;
                    }
                    await Print.printAsync({
                      uri: renderResult.uri,
                    });
                  })();
                }}
                style={[styles.primaryActionShell, !selectedProfile ? styles.actionDisabled : null]}>
                <View style={styles.primaryActionHighlight} />
                <View style={styles.primaryActionFrame}>
                  <View style={styles.primaryAction}>
                    <Text style={styles.primaryActionText}>Print Profile</Text>
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
        </View>

        <View style={styles.infoShell}>
          <View style={styles.cardHighlight} />
          <View style={styles.infoPanel}>
            <View style={styles.cardAccent} />
            <Text style={styles.sectionLabel}>Rendered Preview</Text>
            {selectedProfile?.previewImageUri ? (
              <Image source={{ uri: selectedProfile.previewImageUri }} style={styles.previewImage} resizeMode="contain" />
            ) : (
              <Text style={styles.infoCopy}>No rendered preview available for this saved profile yet.</Text>
            )}

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
    width: 164,
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
  infoShell: {
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
  infoPanel: {
    borderRadius: 5,
    padding: 20,
    backgroundColor: '#BECEDA',
    gap: 12,
  },
  previewImage: {
    width: '100%',
    height: 520,
    borderRadius: 8,
    backgroundColor: '#F3F6F8',
  },
  sectionLabel: {
    color: '#B7CCD8',
    fontSize: 12,
    fontWeight: '700',
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
  selectedMeta: {
    marginTop: 8,
    color: '#AFC3CE',
    fontSize: 13,
    lineHeight: 18,
  },
  selectedActions: {
    marginTop: 18,
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
    flex: 1,
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
  actionDisabled: { opacity: 0.45 },
  infoGrid: {
    gap: 12,
  },
  infoCard: {
    borderRadius: 8,
    padding: 16,
    backgroundColor: '#D7E0E8',
    borderWidth: 1,
    borderColor: '#31495C',
  },
  infoLabel: {
    color: '#4E6272',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  infoValue: {
    marginTop: 8,
    color: '#173248',
    fontSize: 20,
    fontWeight: '800',
  },
  infoCopy: {
    marginTop: 6,
    color: '#5D6971',
    fontSize: 14,
    lineHeight: 20,
  },
});
