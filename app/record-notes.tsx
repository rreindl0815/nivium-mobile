import { memo, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { ActivityIndicator, Alert, Image, ImageBackground, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { CurrentLocationStatus } from '@/components/profile-editor/editor-types';
import { useAppAccess } from '@/context/app-access-context';
import { useSavedProfiles } from '@/context/saved-profiles-context';
import { useVoiceNoteSession } from '@/context/voice-note-session-context';
import { getCurrentLocationErrorMessage, resolveCurrentLocationValuesAsync } from '@/utils/current-location';
import { convertMetersToElevationUnit, formatElevationDisplay, normalizeElevationUnit } from '@/utils/profile-defaults';
import { transcribeAudioFromServiceAsync } from '@/utils/transcribe-service';
const metadataLines = [
  'Run Name / Location __________',
  'Observer(s) __________',
  'Organization __________',
  'Aspect __________',
  'Slope Angle _____ degrees',
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
  'Start from the top down:',
  '',
  'First layer from __0__ cm to ____ cm',
  'Hardness ______',
  '(F, F+, 4F, 4F+, 1F, 1F+, P, P+, K, K+, I)',
  '',
  'Hardness 2 __________________ (optional)',
  'Grain Form ___________________ (optional)',
  'Grain Size ___________________ (optional)',
  'Grain Form 2 _________________ (optional)',
  'Grain Size 2 _________________ (optional)',
  'Layer Comments ______________ (optional)',
  'Make this layer red. (optional)',
  '',
  'Next layer down to __________ cm',
  'Hardness ______',
  '(F, F+, 4F, 4F+, 1F, 1F+, P, P+, K, K+, I)',
  '',
  'Repeat for every layer below.',
];

const temperatureLines = [
  'Speak one line at a time, surface downward:',
  'surface ______',
  '10 cm ______',
  '20 cm ______',
  '30 cm ______',
  '40 cm ______',
  '50 cm ______',
  'Continue in the same pattern below.',
];

const stabilityBlocks = [
  ['Speak one full test line at a time.'],
  ['Example: ECTP14 at 41 cm'],
  ['Example: PST 40/100 ARR at 46 cm'],
  ['Compression Test', 'Taps _____', 'Result _____ (easy, moderate, hard)', 'Fracture Character _____ (SC, SP, PC, RP, BRK)', 'Depth _____ cm'],
  ['Shovel Shear Test', 'Result _____ (easy, moderate, hard)', 'Fracture Character _____ (SC, SP, PC, RP, BRK)', 'Depth _____ cm'],
  ['Hand Shear Test', 'Result _____ (easy, moderate, hard)', 'Fracture Character _____ (SC, SP, PC, RP, BRK)', 'Depth _____ cm'],
  ['Ext. Col. Test', 'Result _____ (ECTN, ECTP, ECTX)', 'Taps _____', 'Fracture Character _____ (SC, SP, PC, RP, BRK)', 'Depth _____ cm'],
  ['Propagation Saw Test', 'Cut Length _____', 'Column Length _____', 'Result _____ (End, Arr, SF)', 'Depth _____ cm'],
  ['Rutschblock Test', 'Result _____ (RB1-RB7)', 'Fracture Character _____ (SC, SP, PC, RP, BRK)', 'Depth _____ cm'],
];

const extraNotesLines = ['____________________'];

function getFieldcardSectionTitle(sectionId: 'metadata' | 'layers' | 'temperature' | 'stability' | 'notes') {
  switch (sectionId) {
    case 'metadata':
      return 'Observation Details';
    default:
      return '';
  }
}

function buildVoiceNoteSeedValues(values: Record<string, string>) {
  const next: Record<string, string> = {};
  const date = values.date?.trim() ?? '';
  const time = values.time?.trim() ?? '';
  const observer = values.observer?.trim() ?? '';
  const organization = values.organization?.trim() ?? '';
  const elevationUnit = values.elevation_unit?.trim() ?? '';
  const latLong = values.lat_long?.trim() ?? '';
  const elevation = values.elevation?.trim() ?? '';
  if (date) {
    next.date = date;
  }
  if (time) {
    next.time = time;
  }
  if (observer) {
    next.observer = observer;
  }
  if (organization) {
    next.organization = organization;
  }
  if (elevationUnit) {
    next.elevation_unit = elevationUnit;
  }
  if (latLong) {
    next.lat_long = latLong;
  }
  if (elevation) {
    next.elevation = elevation;
  }
  return next;
}

export default function RecordNotesScreen() {
  const router = useRouter();
  const { isPaid } = useAppAccess();
  const { session, clearSession, setFromFormatterResult, replaceReviewValues } = useVoiceNoteSession();
  const { queueVoiceNoteRecording, finalizePendingVoiceNoteProcessing } = useSavedProfiles();
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [isSavingFieldLocation, setIsSavingFieldLocation] = useState(false);
  const [fieldLocationStatus, setFieldLocationStatus] = useState<CurrentLocationStatus | null>(null);
  const compact = true;
  const hasSavedFieldLocation = Boolean(session.reviewValues.lat_long?.trim() || session.reviewValues.elevation?.trim());
  const hasCapturedVoiceNotes = session.transcriptRaw.trim().length > 0;
  const hasReviewReady = hasCapturedVoiceNotes || Boolean(session.profileId && session.engineTextCurrent.trim().length > 0);
  const canOpenReview = !recording && !isProcessingAudio && hasReviewReady;

  useEffect(() => {
    if (!isPaid) {
      router.replace({ pathname: '/upgrade', params: { feature: 'Voice Notes', returnTo: '/record-notes' } });
    }
  }, [isPaid, router]);

  if (!isPaid) {
    return null;
  }

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone Permission Needed', 'Allow microphone access to record voice notes.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      const nextRecording = new Audio.Recording();
      await nextRecording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await nextRecording.startAsync();
      setRecording(nextRecording);
      setIsRecording(true);
      setIsPaused(false);
    } catch {
      Alert.alert('Record Audio', 'Unable to start recording.');
    }
  };

  const pauseRecording = async () => {
    if (!recording) {
      return;
    }
    try {
      await recording.pauseAsync();
      setIsPaused(true);
      setIsRecording(false);
    } catch {
      Alert.alert('Pause Recording', 'Unable to pause recording.');
    }
  };

  const resumeRecording = async () => {
    if (!recording) {
      return;
    }
    try {
      await recording.startAsync();
      setIsPaused(false);
      setIsRecording(true);
    } catch {
      Alert.alert('Resume Recording', 'Unable to resume recording.');
    }
  };

  const stopRecording = async () => {
    if (!recording) {
      return;
    }

    let queuedProfileId: string | null = null;
    let queuedAudioUri: string | null = null;
    const preservedSeedValues = buildVoiceNoteSeedValues(session.reviewValues);

    try {
      setIsProcessingAudio(true);
      await recording.stopAndUnloadAsync();
      const audioUri = recording.getURI();
      setRecording(null);
      setIsRecording(false);
      setIsPaused(false);

      if (!audioUri) {
        throw new Error('No audio URI was generated.');
      }

      await clearSession();
      const queuedProfile = await queueVoiceNoteRecording(audioUri, preservedSeedValues);
      if (!queuedProfile?.audioUri) {
        throw new Error('Voice notes could not be saved locally.');
      }
      queuedProfileId = queuedProfile.id;
      queuedAudioUri = queuedProfile.audioUri;

      const response = await transcribeAudioFromServiceAsync({
        audioUri: queuedProfile.audioUri,
        source: 'raw-notes-audio',
        formatterVersion: 'nivium-ai-v1',
      });
      const finalizedProfile = await finalizePendingVoiceNoteProcessing(queuedProfile.id, {
        transcriptRaw: response.transcript,
        engineText: response.formattedText,
        resolvedValues: response.resolvedValues,
        warnings: response.warnings,
        audioUri: queuedProfile.audioUri,
      });
      setFromFormatterResult({
        profileId: finalizedProfile?.id ?? queuedProfile.id,
        audioUri: queuedProfile.audioUri,
        transcriptRaw: response.transcript,
        engineText: response.formattedText,
        resolvedValues: finalizedProfile?.sourceValues ?? response.resolvedValues,
        warnings: response.warnings,
        formatterVersion: response.formatterVersion,
      });
      router.push('/voice-review');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transcription failed.';
      if (queuedProfileId && queuedAudioUri) {
        Alert.alert(
          'Voice Notes Saved',
          `${message} Your recording was saved in Archive and can be retried once you have service again.`,
          [
            {
              text: 'Open Saved Voice Notes',
              onPress: () =>
                router.replace({
                  pathname: '/raw-notes-pending',
                  params: { profileId: queuedProfileId },
                }),
            },
          ]
        );
      } else {
        Alert.alert('Transcription Failed', message);
      }
    } finally {
      setIsProcessingAudio(false);
    }
  };

  const saveFieldLocation = () => {
    void (async () => {
      if (isSavingFieldLocation || hasSavedFieldLocation) {
        return;
      }

      setIsSavingFieldLocation(true);
      try {
        const currentLocation = await resolveCurrentLocationValuesAsync();
        const elevationUnit = normalizeElevationUnit(session.reviewValues.elevation_unit);
        replaceReviewValues({
          ...session.reviewValues,
          elevation: convertMetersToElevationUnit(currentLocation.elevationMeters, elevationUnit),
          lat_long: currentLocation.latLong,
        });
        setFieldLocationStatus({
          tone: 'success',
          message: currentLocation.hasElevation
            ? 'Saved Lat / Long and Elevation for this voice note.'
            : 'Saved Lat / Long for this voice note. Elevation was unavailable and can be entered manually later.',
        });
      } catch (error) {
        setFieldLocationStatus({
          tone: 'error',
          message: getCurrentLocationErrorMessage(error),
        });
      } finally {
        setIsSavingFieldLocation(false);
      }
    })();
  };

  const onRecordPress = () => {
    if (canOpenReview) {
      router.push('/voice-review');
      return;
    }
    if (isProcessingAudio) {
      return;
    }
    if (!recording) {
      void startRecording();
      return;
    }
    if (isRecording) {
      void pauseRecording();
      return;
    }
    if (isPaused) {
      void resumeRecording();
    }
  };

  const recordButtonLabel = isProcessingAudio
    ? 'Processing recording...'
    : recording
      ? isRecording
        ? 'Pause Recording'
        : 'Resume Recording'
      : canOpenReview
        ? 'Review Profile'
        : 'Record Audio';

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
            <View style={styles.captureHeaderRow}>
              <View>
                <Text style={styles.cardEyebrow}>Capture</Text>
                <Text style={styles.cardTitle}>Voice Notes</Text>
              </View>
              <Pressable
                onPress={() => {
                  setFieldLocationStatus(null);
                  void clearSession();
                }}
                style={({ pressed }) => [styles.clearButton, pressed ? styles.pressed : null]}>
                <Text style={styles.clearButtonText}>Clear Voice Notes</Text>
              </Pressable>
            </View>
            <View style={styles.instructionsBox}>
              <View style={styles.bulletRow}>
                <Text style={styles.bulletGlyph}>•</Text>
                <Text style={styles.instructionsLine}>Press <Text style={styles.instructionsBold}>Record Audio</Text></Text>
              </View>
              <View style={styles.bulletRow}>
                <Text style={styles.bulletGlyph}>•</Text>
                <Text style={styles.instructionsLine}>Follow steps in the <Text style={styles.instructionsBold}>Fieldcard</Text>{'\n'}below</Text>
              </View>
              {hasCapturedVoiceNotes && session.engineTextCurrent.trim() ? (
                <Text style={styles.liveNotesText}>{session.engineTextCurrent}</Text>
              ) : hasCapturedVoiceNotes ? (
                <Text style={styles.liveNotesText}>{session.transcriptRaw}</Text>
              ) : null}
            </View>
            <View style={styles.fieldLocationShell}>
              {hasSavedFieldLocation ? (
                <View style={styles.fieldLocationSavedCard}>
                  <Text style={styles.fieldLocationSavedLabel}>Saved for this voice note</Text>
                  {session.reviewValues.lat_long?.trim() ? (
                    <Text style={styles.fieldLocationSavedValue}>Lat / Long: {session.reviewValues.lat_long.trim()}</Text>
                  ) : null}
                  {session.reviewValues.elevation?.trim() ? (
                    <Text style={styles.fieldLocationSavedValue}>
                      Elevation: {formatElevationDisplay(session.reviewValues.elevation, session.reviewValues.elevation_unit)}
                    </Text>
                  ) : null}
                  {fieldLocationStatus ? (
                    <Text
                      style={[
                        styles.fieldLocationStatus,
                        fieldLocationStatus.tone === 'error' ? styles.fieldLocationStatusError : styles.fieldLocationStatusSuccess,
                      ]}>
                      {fieldLocationStatus.message}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <Pressable
                  onPress={saveFieldLocation}
                  disabled={isSavingFieldLocation}
                  style={({ pressed }) => [
                    styles.recordButtonShell,
                    styles.fieldLocationButtonShell,
                    isSavingFieldLocation ? styles.fieldLocationButtonDisabled : null,
                    pressed && !isSavingFieldLocation ? styles.pressed : null,
                  ]}>
                  <View style={styles.recordButtonFrame}>
                    <View style={styles.recordButton}>
                      {isSavingFieldLocation ? (
                        <View style={styles.loadingRow}>
                          <ActivityIndicator size="small" color="#FFF8EE" />
                          <Text style={styles.recordButtonText}>Save Current Coordinates and Elevation</Text>
                        </View>
                      ) : (
                        <Text style={styles.recordButtonText}>Save Current Coordinates and Elevation</Text>
                      )}
                    </View>
                  </View>
                </Pressable>
              )}
            </View>
            <Pressable
              onPress={onRecordPress}
              style={({ pressed }) => [styles.recordButtonShell, pressed ? styles.pressed : null]}>
              <View style={styles.recordButtonFrame}>
                <View style={styles.recordButton}>
                  {isProcessingAudio ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator size="small" color="#FFF8EE" />
                      <Text style={styles.recordButtonText}>{recordButtonLabel}</Text>
                    </View>
                  ) : (
                    <Text style={styles.recordButtonText}>{recordButtonLabel}</Text>
                  )}
                </View>
              </View>
            </Pressable>
            {recording ? (
              <Pressable
                onPress={() => {
                  void stopRecording();
                }}
                style={({ pressed }) => [styles.stopButtonShell, pressed ? styles.pressed : null]}>
                <View style={styles.stopButtonFrame}>
                  <View style={styles.stopButton}>
                    <Text style={styles.stopButtonText}>Stop Recording</Text>
                  </View>
                </View>
              </Pressable>
            ) : null}
          </View>
        </View>

        <FieldcardGuidePanel compact={compact} />

        {hasReviewReady ? (
          <Pressable
            onPress={() => {
              router.push('/voice-review');
            }}
            style={({ pressed }) => [styles.recordButtonShell, pressed ? styles.pressed : null]}>
            <View style={styles.recordButtonFrame}>
              <View style={styles.recordButton}>
                <Text style={styles.recordButtonText}>Review Profile</Text>
              </View>
            </View>
          </Pressable>
        ) : null}

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
        {compact ? (
          <Text style={styles.compactFieldcardTitle}>Fieldcard</Text>
        ) : (
          <>
            <View style={styles.cardAccent} />
            <Text style={styles.cardEyebrow}>Field Card</Text>
            <Text style={styles.cardTitle}>Follow Field Card for Voice Notes</Text>
            <Text style={styles.cardCopy}>Read through the field card aloud and fill in the blanks.</Text>
          </>
        )}
        <ScrollView
          style={[styles.guideViewport, compact ? styles.guideViewportFocused : null]}
          contentContainerStyle={styles.guideStack}
          showsVerticalScrollIndicator
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled">
          <View style={styles.guideSection}>
            <Text style={styles.guideSectionTitle}>{getFieldcardSectionTitle('metadata')}</Text>
            {metadataLines.map((line) => (
              <Text key={line} style={styles.fieldLine}>
                {line}
              </Text>
            ))}
          </View>

          <View style={styles.guideSection}>
            <Text style={styles.guideSectionTitle}>Snowpack Layers</Text>
            {layerLines.map((line, index) => (
              <Text
                key={`layer-line-${index}`}
                style={[
                  styles.fieldLine,
                  (index >= 2 && index <= 4) || (index >= 14 && index <= 18) ? styles.fieldLineEmphasis : null,
                ]}>
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
            {stabilityBlocks.map((block) =>
              block.length === 1 ? (
                <Text key={block[0]} style={styles.stabilitySampleLine}>
                  {block[0]}
                </Text>
              ) : (
                <View key={block[0]} style={styles.testBlock}>
                  <Text style={styles.testBlockTitle}>{block[0]}</Text>
                  {block.slice(1).map((line) => (
                    <Text key={`${block[0]}-${line}`} style={styles.fieldLine}>
                      {line}
                    </Text>
                  ))}
                </View>
              )
            )}
          </View>
          <View style={styles.guideSection}>
            <Text style={styles.guideSectionTitle}>Extra Notes</Text>
            {extraNotesLines.map((line, index) => (
              <Text key={`extra-notes-line-${index}`} style={styles.fieldLine}>
                {line}
              </Text>
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
  captureHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  clearButton: {
    borderRadius: 7,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#97A8B7',
    borderWidth: 1,
    borderColor: '#4D667A',
  },
  clearButtonText: {
    color: '#E7EEF4',
    fontSize: 13,
    fontWeight: '800',
  },
  instructionsBox: {
    marginTop: 12,
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#D7E0E8',
    borderWidth: 1,
    borderColor: '#31495C',
    gap: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bulletGlyph: {
    color: '#1F3443',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  instructionsLine: {
    color: '#1F3443',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  instructionsBold: {
    fontWeight: '800',
  },
  liveNotesText: {
    marginTop: 6,
    color: '#20384D',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  compactFieldcardTitle: {
    marginBottom: 12,
    color: '#1F3443',
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '800',
  },
  fieldLocationShell: {
    marginTop: 14,
    gap: 10,
  },
  fieldLocationButtonShell: {
    marginTop: 0,
  },
  fieldLocationButtonDisabled: {
    opacity: 0.72,
  },
  fieldLocationSavedCard: {
    gap: 8,
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#D9E4EB',
  },
  fieldLocationSavedLabel: {
    color: '#2F5D45',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  fieldLocationSavedValue: {
    color: '#173248',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  fieldLocationStatus: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  fieldLocationStatusSuccess: {
    color: '#2F5D45',
  },
  fieldLocationStatusError: {
    color: '#9B332A',
  },
  recordButtonShell: {
    marginTop: 12,
    borderRadius: 8,
    padding: 2,
    backgroundColor: '#06080B',
    alignSelf: 'flex-start',
  },
  recordButtonFrame: {
    borderRadius: 6,
    padding: 2,
    backgroundColor: '#173248',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.22)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.14)',
    borderRightWidth: 2,
    borderRightColor: 'rgba(7,20,36,0.38)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(7,20,36,0.52)',
  },
  recordButton: {
    borderRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#3B627D',
    alignItems: 'center',
  },
  recordButtonText: {
    color: '#FFF8EE',
    fontSize: 16,
    fontWeight: '800',
  },
  stopButtonShell: {
    marginTop: 10,
    borderRadius: 8,
    padding: 2,
    backgroundColor: '#06080B',
  },
  stopButtonFrame: {
    borderRadius: 6,
    padding: 2,
    backgroundColor: '#3A1B1B',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.22)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.14)',
    borderRightWidth: 2,
    borderRightColor: 'rgba(7,20,36,0.38)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(7,20,36,0.52)',
  },
  stopButton: {
    borderRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#9C3A3A',
    alignItems: 'center',
  },
  stopButtonText: {
    color: '#FFF8EE',
    fontSize: 18,
    fontWeight: '800',
  },
  input: {
    minHeight: 180,
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
    minHeight: 110,
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
  stabilitySampleLine: {
    color: '#20384D',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
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
  fieldLineEmphasis: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
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
