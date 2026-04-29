import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { useRouter } from 'expo-router';
import { memo, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, ImageBackground, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAppAccess } from '@/context/app-access-context';
import { useProfileDraft } from '@/context/profile-draft-context';
import { useSavedProfiles } from '@/context/saved-profiles-context';
import { isTranscribeServiceConfigured, transcribeAudioFromServiceAsync } from '@/utils/transcribe-service';
import { formatVoiceNotesForEditing } from '@/utils/voice-notes-format';
const metadataLines = [
  'Speak in order:',
  'Date __________',
  'Time __________',
  'Run Name / Location __________',
  'Observer(s) __________',
  'Organization __________',
  'Elevation _____ m',
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
  'Lat / Long __________',
];

const layerLines = [
  'Start from the top down:',
  '',
  'First layer from __0__cm to____cm',
  'Hardness ______',
  '(F, F+, 4F, 4F+, 1F, 1F+, P, P+, K, K+, I)',
  '',
  'Hardness 2___________________(optional)',
  'Grain Form___________________(optional)',
  'Grain Form 2__________________(optional)',
  'Grain Size____________________(optional)',
  'Grain Size 2___________________(optional)',
  'Layer Comments______________(optional)',
  'Make this layer red. (optional)',
  '',
  'Next layer down to________cm',
  'Hardness ______',
  '(F, F+, 4F, 4F+, 1F, 1F+, P, P+, K, K+, I)',
  '',
  'Repeat for every layer below.',
];
const emphasizedLayerLines = new Set([
  'First layer from __0__cm to____cm',
  'Hardness ______',
  '(F, F+, 4F, 4F+, 1F, 1F+, P, P+, K, K+, I)',
  'Next layer down to________cm',
  'Repeat for every layer below.',
]);

const temperatureLines = [
  'Speak one line at a time, surface downward:',
  'surface ______',
  '10 cm ______',
  '20 cm ______',
  '30 cm ______',
  '40 cm ______',
  '50 cm ______',
  'Continue downward in order.',
];

const stabilityBlocks = [
  ['Speak one full test line at a time', 'Example: ECTP14 at 41 cm', 'Example: PST 40/100 ARR at 46 cm'],
  ['Compression Test', 'Result _____ (easy, moderate, hard)', 'Taps _____', 'Fracture Character _____ (SC, SP, PC, RP, BRK)', 'Depth _____ cm'],
  ['Shovel Shear Test', 'Result _____ (easy, moderate, hard)', 'Fracture Character _____ (SC, SP, PC, RP, BRK)', 'Depth _____ cm'],
  ['Hand Shear Test', 'Result _____ (easy, moderate, hard)', 'Fracture Character _____ (SC, SP, PC, RP, BRK)', 'Depth _____ cm'],
  ['Ext. Col. Test', 'Result _____ (ECTN, ECTP, ECTX)', 'Taps _____', 'Depth _____ cm'],
  ['Propagation Saw Test', 'Cut Length _____', 'Column Length _____', 'Result _____ (End, Arr, SF)', 'Depth _____ cm'],
  ['Rutschblock Test', 'Result _____ (RB1-RB7)', 'Depth _____ cm'],
];
const extraNotesLines = ['____________________'];

const PENDING_AUDIO_QUEUE_KEY = 'nivium-pending-audio-transcription-v1';

type PendingAudioJob = {
  id: string;
  uri: string;
  createdAt: string;
};

export default function RecordNotesScreen() {
  const router = useRouter();
  const { isPaid } = useAppAccess();
  const hasVoiceAccess = __DEV__ || isPaid;
  const { draft, setRawNotesFromVoiceInput, finalizeVoiceNotesFormatting } = useProfileDraft();
  const { createProfileFromDraft } = useSavedProfiles();
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [queuedJobs, setQueuedJobs] = useState<PendingAudioJob[]>([]);
  const [voiceStatusMessage, setVoiceStatusMessage] = useState<string | null>(null);
  const compact = true;
  const recordingRef = useRef<Audio.Recording | null>(null);
  const isFlushingQueueRef = useRef(false);
  const flushQueuedAudioJobsRef = useRef<() => Promise<void>>(async () => undefined);

  const loadQueuedJobs = async () => {
    try {
      const stored = await AsyncStorage.getItem(PENDING_AUDIO_QUEUE_KEY);
      if (!stored) {
        setQueuedJobs([]);
        return [];
      }
      const parsed = JSON.parse(stored) as PendingAudioJob[];
      const safeParsed = Array.isArray(parsed) ? parsed : [];
      setQueuedJobs(safeParsed);
      return safeParsed;
    } catch {
      setQueuedJobs([]);
      return [];
    }
  };

  const saveQueuedJobs = async (next: PendingAudioJob[]) => {
    setQueuedJobs(next);
    await AsyncStorage.setItem(PENDING_AUDIO_QUEUE_KEY, JSON.stringify(next));
  };

  const queueAudioForLater = async (uri: string) => {
    const nextJob: PendingAudioJob = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      uri,
      createdAt: new Date().toISOString(),
    };
    const current = await loadQueuedJobs();
    const next = [nextJob, ...current];
    await saveQueuedJobs(next);
    setVoiceStatusMessage('Queued for transcription. Waiting for reception or Wi-Fi.');
  };

  const transcribeAndApply = async (uri: string) => {
    const response = await transcribeAudioFromServiceAsync({
      audioUri: uri,
      source: 'raw-notes-audio',
      formatterVersion: 'nivium-ai-v1',
    });
    const serverFormattedText = response.formattedText?.trim() ?? '';
    const hasServerFormattedText = serverFormattedText.length > 0;
    const nextNotes = hasServerFormattedText ? serverFormattedText : formatVoiceNotesForEditing(response.transcript);
    setRawNotesFromVoiceInput(nextNotes);
    if (!hasServerFormattedText) {
      finalizeVoiceNotesFormatting();
    }
    setVoiceStatusMessage('Voice notes processed.');
  };

  const isLikelyConnectivityIssue = (error: unknown) => {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    return (
      message.includes('network request failed') ||
      message.includes('timed out') ||
      message.includes('timeout') ||
      message.includes('failed to fetch') ||
      message.includes('offline')
    );
  };

  const processAudioWithOfflineQueue = async (uri: string, options?: { queuedJobId?: string }) => {
    setIsTranscribing(true);
    try {
      await transcribeAndApply(uri);
      if (options?.queuedJobId) {
        const current = await loadQueuedJobs();
        await saveQueuedJobs(current.filter((job) => job.id !== options.queuedJobId));
      }
    } catch (error) {
      if (options?.queuedJobId) {
        setVoiceStatusMessage('Still waiting for reception or Wi-Fi to process queued recording.');
      } else if (isLikelyConnectivityIssue(error)) {
        await queueAudioForLater(uri);
        Alert.alert(
          'No Connection',
          'We saved your recording. Processing will continue when you are back in reception or Wi-Fi.',
          [{ text: 'OK' }]
        );
      } else {
        const message = error instanceof Error ? error.message : 'Unknown transcription error.';
        setVoiceStatusMessage('Transcription failed. You can retry when ready.');
        Alert.alert('Transcription Failed', message);
      }
      return false;
    } finally {
      setIsTranscribing(false);
    }
    return true;
  };

  const flushQueuedAudioJobs = async () => {
    if (isFlushingQueueRef.current || isRecording || isRecordingPaused || isTranscribing) {
      return;
    }

    isFlushingQueueRef.current = true;
    try {
      const current = await loadQueuedJobs();
      if (current.length === 0) {
        return;
      }

      for (const job of current) {
        const succeeded = await processAudioWithOfflineQueue(job.uri, { queuedJobId: job.id });
        if (!succeeded) {
          break;
        }
      }
    } finally {
      isFlushingQueueRef.current = false;
    }
  };

  useEffect(() => {
    flushQueuedAudioJobsRef.current = flushQueuedAudioJobs;
  });

  const handleStartRecording = async () => {
    if (isRecording || isRecordingPaused || isTranscribing || recordingRef.current) {
      return;
    }

    if (!isTranscribeServiceConfigured()) {
      Alert.alert(
        'Transcription Unavailable',
        'Audio transcription is not configured in this build yet. You can type or paste notes and continue.'
      );
      return;
    }

    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone Permission Needed', 'Allow microphone access to record voice notes.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
      setIsRecordingPaused(false);
      setVoiceStatusMessage('Recording in progress...');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start recording.';
      Alert.alert('Recording Unavailable', message);
    }
  };

  const handlePauseRecording = async () => {
    const recording = recordingRef.current;
    if (!recording || !isRecording) {
      return;
    }

    try {
      await recording.pauseAsync();
      setIsRecording(false);
      setIsRecordingPaused(true);
      setVoiceStatusMessage('Recording paused.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not pause recording.';
      Alert.alert('Recording Error', message);
    }
  };

  const handleResumeRecording = async () => {
    const recording = recordingRef.current;
    if (!recording || !isRecordingPaused || isTranscribing) {
      return;
    }

    try {
      await recording.startAsync();
      setIsRecording(true);
      setIsRecordingPaused(false);
      setVoiceStatusMessage('Recording in progress...');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not resume recording.';
      Alert.alert('Recording Error', message);
    }
  };

  const handleStopRecording = async () => {
    const recording = recordingRef.current;
    if (!recording || (!isRecording && !isRecordingPaused)) {
      return;
    }

    try {
      setIsRecording(false);
      setIsRecordingPaused(false);
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });
      const uri = recording.getURI();
      recordingRef.current = null;
      if (uri) {
        setVoiceStatusMessage('Processing recording...');
        await processAudioWithOfflineQueue(uri);
      }
    } catch (error) {
      setIsRecording(false);
      setIsRecordingPaused(false);
      const message = error instanceof Error ? error.message : 'Could not stop recording.';
      Alert.alert('Recording Error', message);
    }
  };

  useEffect(() => {
    if (!hasVoiceAccess) {
      router.replace({ pathname: '/upgrade', params: { feature: 'Voice Notes', returnTo: '/record-notes' } });
    }
  }, [hasVoiceAccess, router]);

  useEffect(() => {
    void loadQueuedJobs();
  }, []);

  useEffect(() => {
    void flushQueuedAudioJobsRef.current();
  }, [isRecording, isRecordingPaused, isTranscribing]);

  useEffect(() => {
    const interval = setInterval(() => {
      void flushQueuedAudioJobsRef.current();
    }, 15000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  useEffect(
    () => () => {
      const recording = recordingRef.current;
      if (!recording) {
        return;
      }
      void recording.stopAndUnloadAsync().catch(() => undefined);
      recordingRef.current = null;
      void Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => undefined);
    },
    []
  );

  if (!hasVoiceAccess) {
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
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>Voice Notes</Text>
              <Pressable
                onPress={() => {
                  setRawNotesFromVoiceInput('');
                }}
                disabled={!draft.rawNotes.trim()}
                style={({ pressed }) => [
                  styles.inlineActionShell,
                  !draft.rawNotes.trim() ? styles.inlineActionShellDisabled : null,
                  pressed && draft.rawNotes.trim() ? styles.pressed : null,
                ]}>
                <View style={styles.inlineActionHighlight} />
                <View style={styles.inlineActionFrame}>
                  <View style={[styles.inlineActionButton, !draft.rawNotes.trim() ? styles.inlineActionButtonDisabled : null]}>
                    <Text style={styles.inlineActionButtonText}>Clear Voice Notes</Text>
                  </View>
                </View>
              </Pressable>
            </View>
            <View style={styles.inputShell}>
              <TextInput
                multiline
                value={draft.rawNotes}
                onChangeText={(value) => {
                  setRawNotesFromVoiceInput(value);
                }}
                placeholder=""
                placeholderTextColor="#546878"
                style={[styles.input, compact ? styles.inputFocused : null]}
                textAlignVertical="top"
              />
              {!draft.rawNotes.trim() ? (
                <View pointerEvents="none" style={styles.inputTipsOverlay}>
                  <Text style={styles.inputTipLine}>
                    {'\u2022'} Press <Text style={styles.inputTipBold}>Record Audio</Text>
                  </Text>
                  <Text style={styles.inputTipLine}>
                    {'\u2022'} Follow steps in the <Text style={styles.inputTipBold}>Fieldcard</Text>
                  </Text>
                  <Text style={styles.inputTipContinuation}>below</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.audioActionRow}>
              <Pressable
                onPress={() => {
                  if (isRecording) {
                    void handlePauseRecording();
                    return;
                  }
                  if (isRecordingPaused) {
                    void handleResumeRecording();
                    return;
                  }
                  void handleStartRecording();
                }}
                style={({ pressed }) => [styles.voiceActionShell, pressed ? styles.pressed : null]}>
                <View style={styles.voiceActionHighlight} />
                <View style={styles.voiceActionFrame}>
                  <View style={styles.voiceActionButton}>
                    <Text style={styles.voiceActionButtonText}>
                      {isRecording ? 'Pause Recording' : isRecordingPaused ? 'Resume Recording' : 'Record Audio'}
                    </Text>
                  </View>
                </View>
              </Pressable>
              {isRecording || isRecordingPaused ? (
                <Pressable onPress={() => void handleStopRecording()} style={({ pressed }) => [styles.voiceActionShell, pressed ? styles.pressed : null]}>
                  <View style={styles.voiceActionHighlight} />
                  <View style={styles.voiceActionFrame}>
                    <View style={[styles.voiceActionButton, styles.stopRecordingButton]}>
                      <Text style={styles.voiceActionButtonText}>Stop Recording</Text>
                    </View>
                  </View>
                </Pressable>
              ) : null}
              {queuedJobs.length > 0 ? (
                <Pressable
                  onPress={() => {
                    void flushQueuedAudioJobs();
                  }}
                  style={styles.secondaryOutlineButton}>
                  <Text style={styles.secondaryOutlineButtonText}>Retry Queued ({queuedJobs.length})</Text>
                </Pressable>
              ) : null}
            </View>
            {voiceStatusMessage ? <Text style={styles.voiceStatus}>{voiceStatusMessage}</Text> : null}
          </View>
        </View>

        <FieldcardGuidePanel compact={compact} />

        <Pressable
          onPress={() => {
            void (async () => {
              if (isCreatingProfile || isTranscribing || isRecording || isRecordingPaused || !draft.rawNotes.trim()) {
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
            !draft.rawNotes.trim() || isTranscribing || isRecording || isRecordingPaused ? styles.disabled : null,
            pressed && draft.rawNotes.trim() && !isCreatingProfile && !isTranscribing && !isRecording && !isRecordingPaused ? styles.pressed : null,
          ]}
          disabled={!draft.rawNotes.trim() || isCreatingProfile || isTranscribing || isRecording || isRecordingPaused}>
          <View style={styles.createHighlight} />
          <View style={styles.createButtonFrame}>
            <View style={[styles.createButton, !draft.rawNotes.trim() || isTranscribing || isRecording || isRecordingPaused ? styles.createButtonDisabled : null]}>
              {isCreatingProfile ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color="#F4EFE6" />
                  <Text style={styles.createButtonText}>Creating Profile...</Text>
                </View>
              ) : isTranscribing ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color="#F4EFE6" />
                  <Text style={styles.createButtonText}>Transcribing Recording...</Text>
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
            <Text style={styles.guideSectionTitle}>Metadata</Text>
            {metadataLines.map((line, index) => (
              <Text key={`metadata-line-${index}`} style={styles.fieldLine}>
                {line}
              </Text>
            ))}
          </View>

          <View style={styles.guideSection}>
            <Text style={styles.guideSectionTitle}>Snowpack Layers</Text>
            {layerLines.map((line, index) => (
              <Text
                key={`layer-line-${index}`}
                style={[styles.fieldLine, emphasizedLayerLines.has(line) ? styles.fieldLineEmphasis : null]}>
                {line}
              </Text>
            ))}
          </View>

          <View style={styles.guideSection}>
            <Text style={styles.guideSectionTitle}>Temperature</Text>
            {temperatureLines.map((line, index) => (
              <Text key={`temperature-line-${index}`} style={styles.fieldLine}>
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
  cardTitleRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  inlineActionShell: {
    minWidth: 136,
    borderRadius: 8,
    padding: 2,
    backgroundColor: '#1B3349',
  },
  inlineActionHighlight: {
    position: 'absolute',
    top: 2,
    left: 2,
    right: 2,
    height: 6,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.26)',
  },
  inlineActionFrame: {
    borderRadius: 6,
    padding: 1,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.28)',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.16)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(8,22,39,0.44)',
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(8,22,39,0.62)',
    backgroundColor: '#173248',
  },
  inlineActionButton: {
    borderRadius: 5,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    backgroundColor: '#5A7891',
  },
  inlineActionShellDisabled: {
    opacity: 0.5,
  },
  inlineActionButtonDisabled: {
    backgroundColor: '#6E7D8A',
  },
  inlineActionButtonText: {
    color: '#F4EFE6',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  cardCopy: {
    marginTop: 10,
    color: '#55626A',
    fontSize: 16,
    lineHeight: 23,
  },
  inputShell: {
    position: 'relative',
    marginTop: 14,
  },
  input: {
    minHeight: 244,
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
  inputTipsOverlay: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    gap: 6,
  },
  inputTipLine: {
    color: '#405463',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
  inputTipBold: {
    color: '#1F3443',
    fontWeight: '800',
  },
  inputTipContinuation: {
    marginLeft: 14,
    color: '#405463',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
  audioActionRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  voiceActionShell: {
    borderRadius: 8,
    padding: 2,
    backgroundColor: '#1B3349',
  },
  voiceActionHighlight: {
    position: 'absolute',
    top: 2,
    left: 2,
    right: 2,
    height: 8,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.26)',
  },
  voiceActionFrame: {
    borderRadius: 6,
    padding: 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.3)',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.2)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(7,20,36,0.44)',
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(7,20,36,0.62)',
    backgroundColor: '#173248',
  },
  voiceActionButton: {
    borderRadius: 5,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#5A7891',
    alignItems: 'center',
  },
  stopRecordingButton: {
    backgroundColor: '#A94C2A',
  },
  voiceActionButtonText: {
    color: '#F4EFE6',
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryOutlineButton: {
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#A94C2A',
    alignItems: 'center',
  },
  secondaryOutlineButtonText: {
    color: '#A94C2A',
    fontSize: 14,
    fontWeight: '700',
  },
  voiceStatus: {
    marginTop: 10,
    color: '#2A4A61',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
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
  fieldLineEmphasis: {
    fontWeight: '900',
    fontSize: 13,
    lineHeight: 16,
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
  createButtonDisabled: {
    backgroundColor: '#6E7D8A',
  },
  createButtonText: {
    color: '#FFF8EE',
    fontSize: 18,
    fontWeight: '800',
  },
  waitingCopy: {
    marginTop: -10,
    color: '#D8E1E7',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
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
