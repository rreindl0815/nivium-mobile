import { memo, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Image, ImageBackground, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAppAccess } from '@/context/app-access-context';
import { useProfileDraft } from '@/context/profile-draft-context';
import { useSavedProfiles } from '@/context/saved-profiles-context';
const metadataLines = [
  'Date __________',
  'Time __________',
  'Run Name / Location __________',
  'Observer(s) __________',
  'Organization __________',
  'Elevation _____ m',
  'Aspect __________',
  'Slope Angle _____ degrees',
  'Lat / Long __________',
  'Air Temperature _____ C',
  'Sky __________ (clr, few, sct, bkn, ovc)',
  'Precip _____ (nil, S-1, S1, S2, S3, R, mixed)',
  'Wind Speed __________ (clm, lgt, mod, str)',
  'Wind Direction __________',
  'Total Hs _____ cm',
  'Surface Grain __________',
  'Foot Pen _____ cm',
  'Ski Pen _____ cm',
];

const layerLines = [
  'Top of layer _____ cm',
  'Bottom of layer _____ cm',
  'Hardness 1 _____',
  'Hardness 2 _____ (optional)',
  'Grain Form 1 _____',
  'Grain Form 2 _____ (optional)',
  'Grain Size 1 _____',
  'Grain Size 2 _____ (optional)',
  'Comments ____________________',
  'Layer of concern / red? Yes or no',
  'Repeat for every layer.',
];

const temperatureLines = [
  '0 cm ______',
  '10 cm ______',
  '20 cm ______',
  '30 cm ______',
  '40 cm ______',
  '50 cm ______',
  'Continue in the same pattern below.',
];

const stabilityBlocks = [
  ['Compression Test', 'Taps _____', 'Result _____ (easy, moderate, hard)', 'Fracture Character _____ (SC, SP, PC, RP, BRK)', 'Depth _____ cm'],
  ['Shovel Shear Test', 'Result _____ (easy, moderate, hard)', 'Fracture Character _____ (SC, SP, PC, RP, BRK)', 'Depth _____ cm'],
  ['Hand Shear Test', 'Result _____ (easy, moderate, hard)', 'Fracture Character _____ (SC, SP, PC, RP, BRK)', 'Depth _____ cm'],
  ['Ext. Col. Test', 'Result _____ (ECTN, ECTP, ECTX)', 'Taps _____', 'Fracture Character _____ (SC, SP, PC, RP, BRK)', 'Depth _____ cm'],
  ['Propagation Saw Test', 'Cut Length _____', 'Column Length _____', 'Result _____ (End, Arr, SF)', 'Depth _____ cm'],
  ['Rutschblock Test', 'Result _____ (RB1-RB7)', 'Fracture Character _____ (SC, SP, PC, RP, BRK)', 'Depth _____ cm'],
  ['Extra Notes', '____________________'],
];

export default function RecordNotesScreen() {
  const router = useRouter();
  const { isPaid } = useAppAccess();
  const { draft, setRawNotes } = useProfileDraft();
  const { createProfileFromDraft } = useSavedProfiles();
  const [isDictationView, setIsDictationView] = useState(true);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const compact = isDictationView;

  useEffect(() => {
    if (!isPaid) {
      router.replace({ pathname: '/upgrade', params: { feature: 'Record Notes', returnTo: '/record-notes' } });
    }
  }, [isPaid, router]);

  if (!isPaid) {
    return null;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.panel} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <ImageBackground source={require('../assets/images/nivium-hero-snow.png')} imageStyle={styles.heroImage} style={styles.hero}>
          <View style={styles.heroOverlay} />
          <Text style={styles.title}>Nivium</Text>
          <View style={styles.subtitleStack}>
            <Text style={styles.subtitle}>Voice Notes</Text>
            <Image source={require('../assets/images/nivium-hero-swish.png')} style={styles.subtitleSwish} resizeMode="stretch" />
          </View>
        </ImageBackground>

        <View style={styles.cardShell}>
          <View style={styles.cardHighlight} />
          <View style={styles.card}>
            <View style={styles.cardAccent} />
            <Text style={styles.cardEyebrow}>Capture</Text>
            <Text style={styles.cardTitle}>Voice Notes</Text>
            <View style={styles.modeRow}>
              <Pressable
                onPress={() => setIsDictationView(true)}
                style={[styles.modeChip, isDictationView ? styles.modeChipActive : null]}>
                <Text style={[styles.modeChipText, isDictationView ? styles.modeChipTextActive : null]}>Voice View</Text>
              </Pressable>
              <Pressable
                onPress={() => setIsDictationView(false)}
                style={[styles.modeChip, !isDictationView ? styles.modeChipActive : null]}>
                <Text style={[styles.modeChipText, !isDictationView ? styles.modeChipTextActive : null]}>Edit View</Text>
              </Pressable>
            </View>
            <TextInput
              multiline
              value={draft.rawNotes}
              onChangeText={setRawNotes}
              placeholder="🎙 activate your phone mic and speak your voice notes by reading aloud through the fieldcard below."
              placeholderTextColor="#546878"
              style={[styles.input, compact ? styles.inputFocused : null]}
              textAlignVertical="top"
            />
          </View>
        </View>

        <FieldcardGuidePanel compact={compact} />

        <Pressable
          onPress={() => {
            void (async () => {
              if (isCreatingProfile) {
                return;
              }
              setIsCreatingProfile(true);
              try {
                const created = await createProfileFromDraft('raw-notes');
                if (created) {
                  if (created.renderError) {
                    router.push({
                      pathname: '/raw-notes-pending',
                      params: { profileId: created.id },
                    });
                    return;
                  }
                  router.push({
                    pathname: created.documentKind === 'plot' ? '/rendered-profile' : '/profile-preview',
                    params: { profileId: created.id },
                  });
                }
              } finally {
                setIsCreatingProfile(false);
              }
            })();
          }}
          style={({ pressed }) => [
            styles.createShell,
            pressed && draft.rawNotes.trim() && !isCreatingProfile ? styles.pressed : null,
          ]}
          disabled={!draft.rawNotes.trim() || isCreatingProfile}>
          <View style={styles.createHighlight} />
          <View style={styles.createButtonFrame}>
            <View style={styles.createButton}>
              {isCreatingProfile ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color="#F4EFE6" />
                  <Text style={styles.createButtonText}>Rendering Profile...</Text>
                </View>
              ) : (
                <Text style={styles.createButtonText}>Create Profile</Text>
              )}
            </View>
          </View>
        </Pressable>

        <Pressable onPress={() => router.push('/')} style={({ pressed }) => [styles.homeShell, pressed ? styles.pressed : null]}>
          <View style={styles.homeHighlight} />
          <View style={styles.homeButtonFrame}>
            <View style={styles.homeButton}>
              <Text style={styles.homeButtonText}>Home</Text>
            </View>
          </View>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const FieldcardGuidePanel = memo(function FieldcardGuidePanel({ compact }: { compact: boolean }) {
  return (
    <View style={styles.cardShell}>
      <View style={styles.cardHighlight} />
      <View style={styles.card}>
        {compact ? null : (
          <>
            <View style={styles.cardAccent} />
            <Text style={styles.cardEyebrow}>Fieldcard</Text>
            <Text style={styles.cardTitle}>Follow Fieldcard For Voice Notes</Text>
            <Text style={styles.cardCopy}>Read through the fieldcard aloud and fill in the blanks.</Text>
          </>
        )}
        <ScrollView
          style={[styles.guideViewport, compact ? styles.guideViewportFocused : null]}
          contentContainerStyle={styles.guideStack}
          showsVerticalScrollIndicator
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled">
          <View style={styles.guideSection}>
            <Text style={styles.guideSectionTitle}>Metadata</Text>
            {metadataLines.map((line) => (
              <Text key={line} style={styles.fieldLine}>
                {line}
              </Text>
            ))}
          </View>

          <View style={styles.guideSection}>
            <Text style={styles.guideSectionTitle}>Snowpack Layers</Text>
            {layerLines.map((line) => (
              <Text key={line} style={styles.fieldLine}>
                {line}
              </Text>
            ))}
          </View>

          <View style={styles.guideSection}>
            <Text style={styles.guideSectionTitle}>Temperature</Text>
            {temperatureLines.map((line) => (
              <Text key={line} style={styles.fieldLine}>
                {line}
              </Text>
            ))}
          </View>

          <View style={styles.guideSection}>
            <Text style={styles.guideSectionTitle}>Stability Test</Text>
            {stabilityBlocks.map((block) => (
              <View key={block[0]} style={styles.testBlock}>
                <Text style={styles.testBlockTitle}>{block[0]}</Text>
                {block.slice(1).map((line) => (
                  <Text key={`${block[0]}-${line}`} style={styles.fieldLine}>
                    {line}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#20384D',
  },
  panel: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 40,
    gap: 20,
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
  heroImage: {
    borderRadius: 8,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 20, 36, 0.54)',
  },
  title: {
    color: '#FFF8EE',
    fontSize: 42,
    lineHeight: 46,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  subtitleStack: {
    marginTop: 'auto',
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  subtitle: {
    color: '#E2EDF4',
    fontSize: 17,
    lineHeight: 24,
  },
  subtitleSwish: {
    marginTop: 2,
    marginRight: -10,
    width: 176,
    height: 24,
    opacity: 0.96,
    alignSelf: 'flex-end',
  },
  cardShell: {
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#06080B',
    shadowColor: '#091827',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.34,
    shadowRadius: 18,
    elevation: 14,
  },
  cardHighlight: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: 3,
    height: 8,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  card: {
    borderRadius: 5,
    padding: 18,
    backgroundColor: '#BECEDA',
  },
  cardAccent: {
    width: 48,
    height: 6,
    borderRadius: 999,
    marginBottom: 16,
    backgroundColor: '#20384D',
  },
  cardEyebrow: {
    color: '#876A46',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  cardTitle: {
    marginTop: 8,
    color: '#1F3443',
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '800',
  },
  cardCopy: {
    marginTop: 10,
    color: '#55626A',
    fontSize: 16,
    lineHeight: 23,
  },
  modeRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  modeChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#D7E0E8',
    borderWidth: 1,
    borderColor: '#31495C',
  },
  modeChipActive: {
    backgroundColor: '#20384D',
    borderColor: '#20384D',
  },
  modeChipText: {
    color: '#20384D',
    fontSize: 13,
    fontWeight: '700',
  },
  modeChipTextActive: {
    color: '#FFF8EE',
  },
  input: {
    minHeight: 244,
    marginTop: 14,
    borderRadius: 8,
    padding: 16,
    backgroundColor: '#D7E0E8',
    color: '#1F3443',
    fontSize: 16,
    lineHeight: 24,
    borderWidth: 1,
    borderColor: '#31495C',
  },
  inputFocused: {
    minHeight: 152,
  },
  guideStack: {
    marginTop: 14,
    gap: 12,
    paddingBottom: 4,
  },
  guideViewport: {
    marginTop: 14,
    maxHeight: 420,
    minHeight: 280,
  },
  guideViewportFocused: {
    marginTop: 0,
    minHeight: 500,
    maxHeight: 600,
  },
  guideSection: {
    borderRadius: 8,
    padding: 14,
    backgroundColor: '#D7E0E8',
    borderWidth: 1,
    borderColor: '#31495C',
    gap: 6,
  },
  guideSectionTitle: {
    color: '#1F3443',
    fontSize: 18,
    fontWeight: '800',
  },
  testBlock: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#7F95A6',
    gap: 4,
  },
  testBlockTitle: {
    color: '#1F3443',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  fieldLine: {
    color: '#20384D',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
  createShell: {
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#06080B',
    shadowColor: '#091827',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.42,
    shadowRadius: 22,
    elevation: 18,
  },
  createHighlight: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: 3,
    height: 10,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  createButtonFrame: {
    borderRadius: 5,
    padding: 2,
    backgroundColor: '#173248',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.32)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.2)',
    borderRightWidth: 2,
    borderRightColor: 'rgba(7,20,36,0.42)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(7,20,36,0.58)',
  },
  createButton: {
    borderRadius: 3,
    paddingVertical: 16,
    paddingHorizontal: 18,
    backgroundColor: '#3B627D',
    alignItems: 'center',
  },
  createButtonText: {
    color: '#FFF8EE',
    fontSize: 18,
    fontWeight: '800',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  homeShell: {
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#06080B',
    shadowColor: '#091827',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 12,
  },
  homeHighlight: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: 3,
    height: 8,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  homeButtonFrame: {
    borderRadius: 5,
    padding: 2,
    backgroundColor: '#20384D',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.22)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.14)',
    borderRightWidth: 2,
    borderRightColor: 'rgba(7,20,36,0.38)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(7,20,36,0.52)',
  },
  homeButton: {
    borderRadius: 3,
    paddingVertical: 16,
    paddingHorizontal: 18,
    backgroundColor: '#94A8B8',
    alignItems: 'center',
  },
  homeButtonText: {
    color: '#173248',
    fontSize: 18,
    fontWeight: '800',
  },
  pressed: {
    transform: [{ scale: 0.985 }, { translateY: 2 }],
  },
  disabled: {
    opacity: 0.86,
  },
});
