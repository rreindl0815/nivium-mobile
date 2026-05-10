import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AccordionSection } from '@/components/accordion-section';
import { LayerEditor as ReviewStyleLayerEditor } from '@/components/profile-editor/layer-editor';
import { NotesEditor as ReviewStyleNotesEditor } from '@/components/profile-editor/notes-editor';
import { ObservationDetailsEditor } from '@/components/profile-editor/observation-details-editor';
import { StabilityEditor as ReviewStyleStabilityEditor } from '@/components/profile-editor/stability-editor';
import { TemperatureEditor as ReviewStyleTemperatureEditor } from '@/components/profile-editor/temperature-editor';
import type { CurrentLocationStatus } from '@/components/profile-editor/editor-types';
import { useProfileDraft } from '@/context/profile-draft-context';
import { useSavedProfiles } from '@/context/saved-profiles-context';
import { demoManualEntryProfiles, demoManualEntryValues, demoRawNotes } from '@/data/demo-profile';
import { fieldCardSections, requiredFieldIds } from '@/data/field-card';
import type { SavedProfile } from '@/types/profile';
import { getCurrentLocationErrorMessage, resolveCurrentLocationValuesAsync } from '@/utils/current-location';
import { extractDraftValuesFromRawNotes } from '@/utils/raw-note-parser';

const SAMPLE_LIBRARY_KEY = 'nivium-sample-library-v2';
const SAMPLE_TITLES = ['Test Profile 1', 'Test Profile 2', 'Test Profile 3'] as const;
const SAMPLE_FALLBACK_KEY = 'nivium-sample-library-fallback-v1';
const SAMPLE_VAULT_KEY = 'nivium-sample-library-vault-v1';
const SAMPLE_SLOT_KEYS: Record<(typeof SAMPLE_TITLES)[number], string> = {
  'Test Profile 1': 'nivium-sample-slot-1',
  'Test Profile 2': 'nivium-sample-slot-2',
  'Test Profile 3': 'nivium-sample-slot-3',
};

type SampleLibraryEntry = {
  title: string;
  rawNotes: string;
  values: Record<string, string>;
};

function orderSampleEntries(entries: SampleLibraryEntry[]) {
  const byTitle = new Map<string, SampleLibraryEntry>();
  entries.forEach((entry) => {
    const sampleNumber = extractSampleNumber(entry.title);
    if (sampleNumber === null) {
      return;
    }

    byTitle.set(`test profile ${sampleNumber}`, {
      title: `Test Profile ${sampleNumber}`,
      rawNotes: entry.rawNotes,
      values: entry.values,
    });
  });

  return SAMPLE_TITLES.map((title) => byTitle.get(title.toLowerCase())).filter(
    (entry): entry is SampleLibraryEntry => Boolean(entry)
  );
}

function extractSampleNumber(title: string) {
  const match = title.trim().match(/^test profile\s+([1-3])$/i);
  return match ? Number(match[1]) : null;
}

function buildSampleEntry(profile: SavedProfile): SampleLibraryEntry | null {
  const sampleNumber = extractSampleNumber(profile.title);
  if (sampleNumber === null) {
    return null;
  }

  return {
    title: `Test Profile ${sampleNumber}`,
    rawNotes: profile.rawNotes,
    values: profile.sourceValues ?? {},
  };
}

async function persistSampleVault(entries: SampleLibraryEntry[]) {
  const ordered = orderSampleEntries(entries);
  const orderedJson = JSON.stringify(ordered);
  const existingSlots = await Promise.all(
    SAMPLE_TITLES.map(async (title) => {
      try {
        const raw = await AsyncStorage.getItem(SAMPLE_SLOT_KEYS[title]);
        if (!raw) {
          return null;
        }
        const parsed = JSON.parse(raw) as SampleLibraryEntry | null;
        return parsed;
      } catch {
        return null;
      }
    })
  );
  const slotWrites = SAMPLE_TITLES.map((title, index) => {
    const entry = ordered.find((sample) => sample.title === title) ?? existingSlots[index];
    return AsyncStorage.setItem(SAMPLE_SLOT_KEYS[title], JSON.stringify(entry ?? null));
  });

  await Promise.all([
    AsyncStorage.setItem(SAMPLE_LIBRARY_KEY, orderedJson),
    AsyncStorage.setItem(SAMPLE_FALLBACK_KEY, orderedJson),
    AsyncStorage.setItem(SAMPLE_VAULT_KEY, orderedJson),
    ...slotWrites,
  ]);
}

export function DictationScreenContent({ mode }: { mode?: 'record' | 'manual' }) {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; editProfileId?: string }>();
  const entryMode = mode ?? (params.mode === 'manual' ? 'manual' : 'record');
  const isManualMode = entryMode === 'manual';
  const routeEditProfileId = Array.isArray(params.editProfileId) ? params.editProfileId[0] : params.editProfileId;
  const [openSectionId, setOpenSectionId] = useState<string | null>(isManualMode ? null : 'metadata');
  const [sampleLibrary, setSampleLibrary] = useState<SampleLibraryEntry[]>([]);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const hasHandledInitialSectionRef = useRef(false);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const sectionOffsetsRef = useRef<Record<string, number>>({});
  const sectionsOffsetRef = useRef(0);
  const layerBuilderOffsetRef = useRef(0);
  const layerCardOffsetsRef = useRef<Record<number, number>>({});
  const {
    draft,
    setRawNotes,
    mergeFieldValues,
    replaceFieldValues,
    loadFreshRawNotes,
    loadFreshDraft,
    resetDraft,
    setFieldValue,
    completedFields,
    totalFields,
  } = useProfileDraft();
  const { createProfileFromDraft, profiles } = useSavedProfiles();
  const [saveMessage, setSaveMessage] = useState('');
  const [isApplyingCurrentLocation, setIsApplyingCurrentLocation] = useState(false);
  const [currentLocationStatus, setCurrentLocationStatus] = useState<CurrentLocationStatus | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadSampleLibrary() {
      try {
        const [storedPrimary, storedFallback, storedVault, slot1, slot2, slot3] = await Promise.all([
          AsyncStorage.getItem(SAMPLE_LIBRARY_KEY),
          AsyncStorage.getItem(SAMPLE_FALLBACK_KEY),
          AsyncStorage.getItem(SAMPLE_VAULT_KEY),
          AsyncStorage.getItem(SAMPLE_SLOT_KEYS['Test Profile 1']),
          AsyncStorage.getItem(SAMPLE_SLOT_KEYS['Test Profile 2']),
          AsyncStorage.getItem(SAMPLE_SLOT_KEYS['Test Profile 3']),
        ]);
        const parsedEntries = [storedPrimary, storedFallback, storedVault]
          .filter((value): value is string => Boolean(value))
          .flatMap((value) => {
            try {
              const parsed = JSON.parse(value) as SampleLibraryEntry[];
              return Array.isArray(parsed) ? parsed : [];
            } catch {
              return [];
            }
          });
        const parsedSlots = [slot1, slot2, slot3]
          .filter((value): value is string => Boolean(value))
          .flatMap((value) => {
            try {
              const parsed = JSON.parse(value) as SampleLibraryEntry | null;
              return parsed ? [parsed] : [];
            } catch {
              return [];
            }
          });

        if (isMounted) {
          setSampleLibrary(orderSampleEntries([...parsedEntries, ...parsedSlots]));
        }
      } catch {
        if (isMounted) {
          setSampleLibrary([]);
        }
      }
    }

    void loadSampleLibrary();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const archiveSamples = profiles
      .map(buildSampleEntry)
      .filter((entry): entry is SampleLibraryEntry => Boolean(entry))
      .sort((a, b) => (extractSampleNumber(a.title) ?? 99) - (extractSampleNumber(b.title) ?? 99));

    if (archiveSamples.length === 0 && sampleLibrary.length === 0) {
      return;
    }

    const ordered = orderSampleEntries([...sampleLibrary, ...archiveSamples]);
    const currentJson = JSON.stringify(sampleLibrary);
    const nextJson = JSON.stringify(ordered);
    if (currentJson === nextJson) {
      return;
    }

    setSampleLibrary(ordered);
    void persistSampleVault(ordered);
  }, [profiles, sampleLibrary]);

  const rotatingManualSamples = demoManualEntryProfiles;

  const extractedValues = useMemo(() => extractDraftValuesFromRawNotes(draft.rawNotes), [draft.rawNotes]);
  const extractedEntries = Object.entries(extractedValues);
  const missingCriticalFields = requiredFieldIds.filter((fieldId) => !(draft.values[fieldId] ?? '').trim());
  const sectionSummaries = fieldCardSections.map((section) => {
    const completedCount =
      section.id === 'layers'
        ? getLayerCardCount(draft.values)
        : section.id === 'temperatures'
          ? getTemperaturePointCount(draft.values)
          : section.id === 'tests'
            ? getStabilityTestCount(draft.values)
        : section.fields.filter((field) => (draft.values[field.id] ?? '').trim().length > 0).length;
    const recognizedCount =
      section.id === 'layers'
        ? getLegacyLayerCount(extractedValues)
        : section.id === 'temperatures'
          ? getStructuredTemperaturePointCount(extractedValues)
          : section.id === 'tests'
            ? getLegacyStabilityCount(extractedValues)
        : section.fields.filter((field) => (extractedValues[field.id] ?? '').trim().length > 0).length;
    const visibleLayerCount = section.id === 'layers' ? getVisibleLayerCardCount(draft.values, extractedValues) : section.fields.length;
    const visibleTemperatureCount =
      section.id === 'temperatures' ? getVisibleTemperatureRowCount(draft.values, extractedValues) : section.fields.length;
    const visibleTestCount =
      section.id === 'tests' ? getVisibleStabilityTestCount(draft.values, extractedValues) : section.fields.length;
    return {
      ...section,
      completedCount,
      recognizedCount,
      totalCount:
        section.id === 'layers'
          ? visibleLayerCount
          : section.id === 'temperatures'
            ? visibleTemperatureCount
            : section.id === 'tests'
              ? visibleTestCount
            : section.fields.length,
    };
  });
  const nextSection =
    sectionSummaries.find((section) => section.completedCount < section.fields.length) ?? sectionSummaries[0];

  const applyCurrentLocation = () => {
    void (async () => {
      if (isApplyingCurrentLocation) {
        return;
      }

      setIsApplyingCurrentLocation(true);
      try {
        const currentLocation = await resolveCurrentLocationValuesAsync();
        setSaveMessage('');
        mergeFieldValues({
          elevation: currentLocation.elevation,
          lat_long: currentLocation.latLong,
        });
        setCurrentLocationStatus({
          tone: 'success',
          message: currentLocation.hasElevation
            ? 'Filled Lat / Long and Elevation from your current position.'
            : 'Filled Lat / Long from your current position. Elevation was unavailable and can be entered manually.',
        });
      } catch (error) {
        setCurrentLocationStatus({
          tone: 'error',
          message: getCurrentLocationErrorMessage(error),
        });
      } finally {
        setIsApplyingCurrentLocation(false);
      }
    })();
  };

  useEffect(() => {
    if (!openSectionId) {
      return;
    }

    if (!hasHandledInitialSectionRef.current) {
      hasHandledInitialSectionRef.current = true;
      return;
    }

    const scrollToSectionTop = () => {
      const targetY = Math.max(
        sectionsOffsetRef.current + (sectionOffsetsRef.current[openSectionId] ?? 0) - 12,
        0
      );
      scrollViewRef.current?.scrollTo({ y: targetY, animated: true });
    };

    const first = setTimeout(scrollToSectionTop, 40);
    const second = setTimeout(scrollToSectionTop, 180);

    return () => {
      clearTimeout(first);
      clearTimeout(second);
    };
  }, [openSectionId]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 110 : 0}>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={[styles.panel, isManualMode ? styles.manualPanel : null]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {isManualMode ? (
          <ImageBackground
            source={require('../assets/images/nivium-hero-snow.png')}
            imageStyle={styles.heroImage}
            style={[styles.hero, styles.manualHero]}>
            <View style={styles.heroOverlay} />
            <Text style={styles.heroTitle}>Nivium</Text>
            <View style={styles.heroSubtitleStack}>
              <Text style={styles.heroSubtitle}>Manually Enter Data</Text>
              <Image source={require('../assets/images/nivium-hero-swish.png')} style={styles.heroSubtitleSwish} resizeMode="stretch" />
            </View>
          </ImageBackground>
        ) : (
          <View>
            <Text style={styles.eyebrow}>Voice Notes</Text>
            <Text style={styles.title}>Type, paste, or speak your voice notes.</Text>
            <Text style={styles.copy}>
              Keep the voice notes at the top, follow along in the field card below, and create the
              profile from this same screen when the notes are ready.
            </Text>
          </View>
        )}

        {isManualMode ? null : (
          <View style={styles.stickyShell}>
            <View style={styles.stickyPanel}>
              <Text style={styles.stickyLabel}>Voice Notes</Text>
              <TextInput
                multiline
                placeholder="Type, paste, or speak your voice notes..."
                placeholderTextColor="#8C8A84"
                style={styles.input}
                value={draft.rawNotes}
                onChangeText={(value) => {
                  setSaveMessage('');
                  setRawNotes(value);
                }}
                textAlignVertical="top"
              />

              <View style={styles.actionRow}>
                <Pressable
                  onPress={() => {
                    setSaveMessage('');
                    replaceFieldValues(extractedValues);
                  }}
                  style={[styles.primaryButton, extractedEntries.length === 0 ? styles.buttonDisabled : null]}
                  disabled={extractedEntries.length === 0}>
                  <Text style={styles.primaryButtonText}>Fill Field Card From Voice Notes</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setSaveMessage('');
                    loadFreshRawNotes(demoRawNotes);
                  }}
                  style={styles.secondaryStrongButton}>
                  <Text style={styles.secondaryStrongButtonText}>Load Sample</Text>
                </Pressable>
              </View>

              <View style={styles.actionRow}>
                <Pressable
                  onPress={() => {
                    Alert.alert('Start Fresh', 'Clear the current voice notes and field-card values?', [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Clear Draft',
                        style: 'destructive',
                        onPress: () => {
                          setSaveMessage('');
                          void resetDraft();
                          if (routeEditProfileId) {
                            router.replace('/manual-entry');
                          }
                        },
                      },
                    ]);
                  }}
                  style={styles.secondaryOutlineButton}>
                  <Text style={styles.secondaryOutlineButtonText}>Start Fresh</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    void (async () => {
                      if (isCreatingProfile) {
                        return;
                      }
                      setIsCreatingProfile(true);
                      try {
                        const created = await createProfileFromDraft(
                          isManualMode ? 'manual' : 'raw-notes',
                          isManualMode ? routeEditProfileId : undefined
                        );
                        if (created) {
                          if (created.renderError) {
                            setSaveMessage(`${created.title} was saved to Archive, but the plotted renderer failed.`);
                            router.push('/archive');
                            return Alert.alert(
                              'Plot Render Failed',
                              'Your profile data was saved to Archive, but the plotted renderer did not complete. Open the saved card in Archive to edit or retry once the renderer is available.'
                            );
                          }
                          setSaveMessage(`${created.title} saved to device. Opening the rendered preview now.`);
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
                  style={[styles.createButton, !draft.rawNotes.trim() || isCreatingProfile ? styles.buttonDisabled : null]}
                  disabled={!draft.rawNotes.trim() || isCreatingProfile}>
                  {isCreatingProfile ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator size="small" color="#FFF8EE" />
                      <Text style={styles.createButtonText}>Building Profile...</Text>
                    </View>
                  ) : (
                    <Text style={styles.createButtonText}>Create Profile</Text>
                  )}
                </Pressable>
              </View>

              <Text style={styles.stickySubcopy}>
                {isCreatingProfile
                  ? 'Rendering can take around 10 seconds. Please wait while Nivium builds the plotted profile.'
                  : extractedEntries.length > 0
                  ? `${extractedEntries.length} fields recognized from the voice notes`
                  : 'Paste or type voice notes, then fill the field card below.'}
              </Text>
              {saveMessage ? <Text style={styles.savedMessage}>{saveMessage}</Text> : null}
            </View>
          </View>
        )}

        {isManualMode ? (
          <>
            <View style={styles.manualQuickActions}>
              <Pressable
                onPress={() => {
                  setSaveMessage('');
                  const currentRunName = (draft.values.run_name ?? '').trim().toLowerCase();
                  const currentIndex = rotatingManualSamples.findIndex(
                    (sample) => (sample.values.run_name ?? '').trim().toLowerCase() === currentRunName
                  );
                  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % rotatingManualSamples.length : 0;
                  const sample = rotatingManualSamples[nextIndex];
                  loadFreshDraft({
                    rawNotes: sample?.rawNotes ?? demoRawNotes,
                    values: sample?.values ?? demoManualEntryValues,
                  });
                  if (routeEditProfileId) {
                    router.replace('/manual-entry');
                  }
                }}
                style={({ pressed }) => [styles.manualQuickPrimaryShell, styles.actionWide, pressed ? styles.pressed : null]}>
                <View style={styles.manualQuickPrimaryHighlight} />
                <View style={styles.manualQuickPrimaryFrame}>
                  <View style={styles.manualQuickPrimaryAction}>
                    <Text numberOfLines={1} style={styles.manualQuickPrimaryText}>
                      Load Sample Profile
                    </Text>
                  </View>
                </View>
              </Pressable>
              <Pressable onPress={() => router.push('/')} style={({ pressed }) => [styles.manualQuickActionShell, styles.actionNarrow, pressed ? styles.pressed : null]}>
                <View style={styles.manualQuickActionFrame}>
                  <View style={styles.manualQuickAction}>
                    <Text numberOfLines={1} style={styles.manualQuickActionText}>Home</Text>
                  </View>
                </View>
              </Pressable>
            </View>
            {saveMessage ? <Text style={styles.savedMessage}>{saveMessage}</Text> : null}
          </>
        ) : (
          <View style={styles.progressCard}>
            <Text style={styles.progressLabel}>Field Card Progress</Text>
            <Text style={styles.progressValue}>
              {completedFields}/{totalFields} fields filled
            </Text>
            <Text style={styles.progressCopy}>
              {missingCriticalFields.length === 0
                ? 'All critical fields are present.'
                : `Still missing: ${missingCriticalFields.map((fieldId) => fieldId.replaceAll('_', ' ')).join(', ')}`}
            </Text>
            <Text style={styles.progressHint}>
              Next section: {nextSection?.title || 'Metadata'} · {nextSection?.description || ''}
            </Text>
          </View>
        )}

        <View
          style={[styles.sections, isManualMode ? styles.manualSections : null]}
          onLayout={(event) => {
            sectionsOffsetRef.current = event.nativeEvent.layout.y;
          }}>
          {sectionSummaries.map((section) => (
            <View
              key={section.id}
              onLayout={(event) => {
                sectionOffsetsRef.current[section.id] = event.nativeEvent.layout.y;
              }}>
              <AccordionSection
                title={
                  isManualMode && section.id === 'metadata'
                    ? 'Observation Details'
                    : isManualMode && section.id === 'temperatures'
                      ? 'Temperatures'
                      : section.title
                }
                description={
                  isManualMode && section.id === 'metadata'
                    ? 'General, location, weather, and snow conditions'
                    : section.description
                }
                accent={section.accent}
                compact={isManualMode}
                isOpen={openSectionId === section.id}
                onToggle={() => {
                  setOpenSectionId((current) => (current === section.id ? null : section.id));
                }}>
                {section.id === 'layers' && isManualMode ? (
                  <ManualLayerEditor
                    values={draft.values}
                    onChange={(fieldId, value) => {
                      setSaveMessage('');
                      setFieldValue(fieldId, value);
                    }}
                    onReplace={(nextValues) => {
                      setSaveMessage('');
                      mergeFieldValues(nextValues);
                    }}
                    onBuilderLayout={(offsetY) => {
                      layerBuilderOffsetRef.current = offsetY;
                    }}
                    onLayerLayout={(index, offsetY) => {
                      layerCardOffsetsRef.current[index] = offsetY;
                    }}
                    onFocusLayer={(index) => {
                      const scrollToLayer = () => {
                        const targetY = Math.max(
                          sectionsOffsetRef.current +
                            (sectionOffsetsRef.current.layers ?? 0) +
                            layerBuilderOffsetRef.current +
                            (layerCardOffsetsRef.current[index] ?? 0) -
                            12,
                          0
                        );
                        scrollViewRef.current?.scrollTo({ y: targetY, animated: true });
                      };

                      setTimeout(scrollToLayer, 60);
                      setTimeout(scrollToLayer, 180);
                    }}
                  />
                ) : section.id === 'layers' ? (
                  <LayerBuilder
                    values={draft.values}
                    onChange={(fieldId, value) => {
                      setSaveMessage('');
                      setFieldValue(fieldId, value);
                    }}
                    onBuilderLayout={(offsetY) => {
                      layerBuilderOffsetRef.current = offsetY;
                    }}
                    onLayerLayout={(index, offsetY) => {
                      layerCardOffsetsRef.current[index] = offsetY;
                    }}
                    onFocusLayer={(index) => {
                      const scrollToLayer = () => {
                        const targetY = Math.max(
                          sectionsOffsetRef.current +
                            (sectionOffsetsRef.current.layers ?? 0) +
                            layerBuilderOffsetRef.current +
                            (layerCardOffsetsRef.current[index] ?? 0) -
                            12,
                          0
                        );
                        scrollViewRef.current?.scrollTo({ y: targetY, animated: true });
                      };

                      setTimeout(scrollToLayer, 60);
                      setTimeout(scrollToLayer, 180);
                    }}
                  />
                ) : section.id === 'temperatures' ? (
                  isManualMode ? (
                    <ReviewStyleTemperatureEditor
                      values={draft.values}
                      onChange={(fieldId, value) => {
                        setSaveMessage('');
                        setFieldValue(fieldId, value);
                      }}
                      onReplace={(nextValues) => {
                        setSaveMessage('');
                        mergeFieldValues(nextValues);
                      }}
                    />
                  ) : (
                  <TemperatureBuilder
                    values={draft.values}
                    onChange={(fieldId, value) => {
                      setSaveMessage('');
                      setFieldValue(fieldId, value);
                    }}
                  />
                  )
                ) : section.id === 'tests' ? (
                  isManualMode ? (
                    <ReviewStyleStabilityEditor
                      values={draft.values}
                      onChange={(fieldId, value) => {
                        setSaveMessage('');
                        setFieldValue(fieldId, value);
                      }}
                      onReplace={(nextValues) => {
                        setSaveMessage('');
                        mergeFieldValues(nextValues);
                      }}
                    />
                  ) : (
                  <StabilityTestBuilder
                    values={draft.values}
                    onChange={(fieldId, value) => {
                      setSaveMessage('');
                      setFieldValue(fieldId, value);
                    }}
                  />
                  )
                ) : section.id === 'metadata' && isManualMode ? (
                  <ObservationDetailsEditor
                    values={draft.values}
                    onChange={(fieldId, value) => {
                      setSaveMessage('');
                      setFieldValue(fieldId, value);
                    }}
                    onUseCurrentLocation={applyCurrentLocation}
                    isApplyingCurrentLocation={isApplyingCurrentLocation}
                    currentLocationStatus={currentLocationStatus}
                  />
                ) : section.id === 'notes' && isManualMode ? (
                  <ReviewStyleNotesEditor
                    value={draft.values.comments ?? ''}
                    onChange={(value) => {
                      setSaveMessage('');
                      setFieldValue('comments', value);
                    }}
                  />
                ) : (
                  section.fields.map((field) => (
                    <View key={field.id} style={styles.field}>
                      <Text style={styles.fieldLabel}>{field.label}</Text>
                      {field.id === 'date' ? (
                        <DateField
                          value={draft.values[field.id] ?? ''}
                          onChange={(value) => {
                            setSaveMessage('');
                            setFieldValue(field.id, value);
                          }}
                        />
                      ) : field.id === 'time' ? (
                        <SelectorField
                          label="Time"
                          value={draft.values[field.id] ?? ''}
                          placeholder="Choose time"
                          options={timeOptions}
                          onSelect={(value) => {
                            setSaveMessage('');
                            setFieldValue(field.id, value);
                          }}
                        />
                      ) : field.id === 'wind' ? (
                        <WindField
                          value={draft.values[field.id] ?? ''}
                          onChange={(value) => {
                            setSaveMessage('');
                            setFieldValue(field.id, value);
                          }}
                        />
                      ) : field.options ? (
                        <View style={styles.optionList}>
                          {field.options.map((option) => {
                            const selected = (draft.values[field.id] ?? '') === option;
                            return (
                              <Pressable
                                key={option}
                                onPress={() => {
                                  setSaveMessage('');
                                  setFieldValue(field.id, option);
                                }}
                                style={[styles.optionChip, selected ? styles.optionChipSelected : null]}>
                                <Text style={[styles.optionChipText, selected ? styles.optionChipTextSelected : null]}>
                                  {option}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : (
                        <TextInput
                          value={draft.values[field.id] ?? ''}
                          onChangeText={(value) => {
                            setSaveMessage('');
                            setFieldValue(field.id, value);
                          }}
                          onFocus={() => {
                            if (!isManualMode || field.id !== 'comments') {
                              return;
                            }
                            const targetY = Math.max(sectionsOffsetRef.current + (sectionOffsetsRef.current.notes ?? 0) - 40, 0);
                            setTimeout(() => {
                              scrollViewRef.current?.scrollTo({ y: targetY, animated: true });
                            }, 120);
                            setTimeout(() => {
                              scrollViewRef.current?.scrollTo({ y: targetY, animated: true });
                            }, 260);
                            setTimeout(() => {
                              scrollViewRef.current?.scrollTo({ y: targetY + 80, animated: true });
                            }, 420);
                          }}
                          placeholder={field.placeholder}
                          placeholderTextColor="#8C8A84"
                          multiline={field.multiline}
                          keyboardType={field.keyboardType}
                          style={[styles.fieldInput, field.multiline ? styles.multilineInput : null]}
                          textAlignVertical={field.multiline ? 'top' : 'center'}
                        />
                      )}
                    </View>
                  ))
                )}
              </AccordionSection>
            </View>
          ))}
        </View>

        {isManualMode ? (
          <View style={[styles.bottomActions, styles.manualBottomActions]}>
            <Pressable
              onPress={() => {
                void (async () => {
                  if (isCreatingProfile) {
                    return;
                  }
                  setIsCreatingProfile(true);
                  try {
                    const created = await createProfileFromDraft(
                      isManualMode ? 'manual' : 'raw-notes',
                      isManualMode ? routeEditProfileId : undefined
                    );
                    if (created) {
                      if (created.renderError) {
                        setSaveMessage(`${created.title} was saved to Archive, but the plotted renderer failed.`);
                        router.push('/archive');
                        return Alert.alert(
                          'Plot Render Failed',
                          'Your profile data was saved to Archive, but the plotted renderer did not complete. Open the saved card in Archive to edit or retry once the renderer is available.'
                        );
                      }
                      setSaveMessage(`${created.title} saved to device. Opening the rendered preview now.`);
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
              style={({ pressed }) => [styles.bottomCreateShell, pressed && !isCreatingProfile ? styles.pressed : null]}
              disabled={isCreatingProfile}>
              <View style={styles.bottomCreateHighlight} />
              <View style={styles.bottomCreateFrame}>
                <View style={styles.bottomCreateButton}>
                  {isCreatingProfile ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator size="small" color="#FFF8EE" />
                      <Text style={styles.bottomCreateButtonText}>Building Profile...</Text>
                    </View>
                  ) : (
                    <Text style={styles.bottomCreateButtonText}>Generate Profile</Text>
                  )}
                </View>
              </View>
            </Pressable>
          </View>
        ) : (
          <View style={styles.bottomActions}>
            <Pressable
              onPress={() => {
                void (async () => {
                  if (isCreatingProfile) {
                    return;
                  }
                  setIsCreatingProfile(true);
                  try {
                    const created = await createProfileFromDraft(
                      isManualMode ? 'manual' : 'raw-notes',
                      isManualMode ? routeEditProfileId : undefined
                    );
                    if (created) {
                      if (created.renderError) {
                        setSaveMessage(`${created.title} was saved to Archive, but the plotted renderer failed.`);
                        router.push('/archive');
                        return Alert.alert(
                          'Plot Render Failed',
                          'Your profile data was saved to Archive, but the plotted renderer did not complete. Open the saved card in Archive to edit or retry once the renderer is available.'
                        );
                      }
                      setSaveMessage(`${created.title} saved to device. Opening the rendered preview now.`);
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
              style={[styles.bottomCreateButton, !draft.rawNotes.trim() || isCreatingProfile ? styles.buttonDisabled : null]}
              disabled={!draft.rawNotes.trim() || isCreatingProfile}>
              {isCreatingProfile ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color="#FFF8EE" />
                  <Text style={styles.bottomCreateButtonText}>Building Profile...</Text>
                </View>
              ) : (
                <Text style={styles.bottomCreateButtonText}>Create Profile</Text>
              )}
            </Pressable>
            <Link href="/profile-preview" style={styles.link}>
              Open Preview
            </Link>
            <Link href="/archive" style={styles.link}>
              Open Archive
            </Link>
            <Link href="/" style={styles.link}>
              Back Home
            </Link>
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function DictationScreen() {
  return <DictationScreenContent />;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#20384D' },
  panel: { padding: 20, gap: 16, paddingBottom: 40, paddingTop: 40 },
  manualPanel: { paddingTop: 54, gap: 8, paddingBottom: 320 },
  manualQuickActions: {
    marginTop: 8,
    marginBottom: 4,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-start',
  },
  actionWide: {
    flex: 1.9,
  },
  actionNarrow: {
    flex: 0.75,
  },
  manualQuickActionShell: {
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#06080B',
  },
  manualQuickActionFrame: {
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
  manualQuickAction: {
    borderRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#A9B8C4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualQuickActionText: {
    color: '#173248',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  manualQuickPrimaryShell: {
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#06080B',
  },
  manualQuickPrimaryHighlight: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: 3,
    height: 8,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  manualQuickPrimaryFrame: {
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
  manualQuickPrimaryAction: {
    borderRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#3B627D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualQuickPrimaryText: {
    color: '#FFF8EE',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
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
  manualHero: {
    minHeight: 166,
    paddingVertical: 16,
  },
  heroImage: {
    borderRadius: 8,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 20, 36, 0.54)',
  },
  heroTitle: {
    color: '#FFF8EE',
    fontSize: 38,
    lineHeight: 42,
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
    fontSize: 16,
    lineHeight: 22,
  },
  heroSubtitleSwish: {
    marginTop: 2,
    marginRight: -10,
    width: 236,
    height: 24,
    opacity: 0.96,
    alignSelf: 'flex-end',
  },
  eyebrow: { color: '#D1A062', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  title: { marginTop: 10, color: '#F7F2EA', fontSize: 34, lineHeight: 38, fontWeight: '800' },
  copy: { marginTop: 12, color: '#C3D0DA', fontSize: 16, lineHeight: 24 },
  stickyShell: {
    paddingTop: 4,
    paddingBottom: 4,
  },
  stickyPanel: {
    borderRadius: 10,
    padding: 18,
    backgroundColor: '#BECEDA',
    borderWidth: 3,
    borderColor: '#06080B',
    shadowColor: '#091827',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    elevation: 14,
  },
  stickyLabel: {
    color: '#876A46',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    minHeight: 120,
    marginTop: 12,
    borderRadius: 8,
    padding: 16,
    backgroundColor: '#D7E0E8',
    color: '#1F3443',
    fontSize: 16,
    lineHeight: 24,
    borderWidth: 1,
    borderColor: '#31495C',
  },
  actionRow: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  primaryButton: {
    flexGrow: 1,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#A94C2A',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFF8EE',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryStrongButton: {
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#3D6B5A',
    alignItems: 'center',
  },
  secondaryStrongButtonText: {
    color: '#FFF8EE',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryOutlineButton: {
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#A94C2A',
    alignItems: 'center',
  },
  secondaryOutlineButtonText: {
    color: '#A94C2A',
    fontSize: 15,
    fontWeight: '700',
  },
  createButton: {
    flexGrow: 1,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#3B627D',
    alignItems: 'center',
  },
  createButtonText: {
    color: '#FFF8EE',
    fontSize: 15,
    fontWeight: '800',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  stickySubcopy: {
    marginTop: 12,
    color: '#5D6971',
    fontSize: 14,
    lineHeight: 20,
  },
  savedMessage: {
    marginTop: 8,
    color: '#3D6B5A',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  progressCard: {
    borderRadius: 10,
    padding: 18,
    backgroundColor: '#94A8B8',
    borderWidth: 3,
    borderColor: '#06080B',
  },
  progressLabel: {
    color: '#20384D',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  progressValue: {
    marginTop: 8,
    color: '#0F2233',
    fontSize: 22,
    fontWeight: '800',
  },
  progressCopy: {
    marginTop: 8,
    color: '#20384D',
    fontSize: 14,
    lineHeight: 20,
  },
  progressHint: {
    marginTop: 8,
    color: '#0F2233',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  sections: {
    gap: 14,
  },
  manualSections: {
    gap: 8,
  },
  field: {
    gap: 8,
  },
  layerBuilder: {
    gap: 16,
  },
  layerCard: {
    borderRadius: 8,
    padding: 16,
    backgroundColor: '#B5C6D2',
    gap: 12,
    borderWidth: 1,
    borderColor: '#31495C',
  },
  layerHeaderStack: {
    flex: 1,
    gap: 4,
  },
  layerCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  layerChevron: {
    color: '#173248',
    fontSize: 26,
    lineHeight: 26,
    fontWeight: '500',
  },
  layerCardTitle: {
    color: '#173248',
    fontSize: 18,
    fontWeight: '800',
  },
  layerPreview: {
    color: '#5D6971',
    fontSize: 13,
    lineHeight: 18,
  },
  layerPreviewBadge: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#30516A',
    alignSelf: 'flex-start',
  },
  layerPreviewBadgeConcern: {
    backgroundColor: '#30516A',
  },
  layerPreviewBadgeText: {
    color: '#FFF8EE',
    fontSize: 12,
    fontWeight: '800',
  },
  layerPreviewBadgeTextConcern: {
    color: '#FFF8EE',
  },
  layerDivider: {
    height: 2,
    backgroundColor: '#93A9B8',
  },
  layerGroup: {
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#A9BBC8',
    gap: 10,
  },
  layerGroupLabel: {
    color: '#173248',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  layerRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  layerCol: {
    flex: 1,
    minWidth: 132,
    gap: 8,
  },
  depthValue: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#A9B8C4',
    color: '#173248',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
  },
  depthValuePlaceholder: {
    lineHeight: 18,
    paddingTop: 10,
    paddingBottom: 14,
  },
  depthHint: {
    color: '#4E6272',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  toggleChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#A9B8C4',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.28)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.18)',
    borderRightWidth: 2,
    borderRightColor: 'rgba(7,20,36,0.24)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(7,20,36,0.38)',
    shadowColor: '#091827',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  toggleChipDanger: {
    backgroundColor: '#C94A57',
    borderTopColor: 'rgba(255,255,255,0.22)',
    borderLeftColor: 'rgba(255,255,255,0.14)',
    borderRightColor: 'rgba(82,8,18,0.36)',
    borderBottomColor: 'rgba(82,8,18,0.48)',
  },
  toggleChipSelected: {
    backgroundColor: '#30516A',
  },
  toggleChipSelectedDanger: {
    backgroundColor: '#C62839',
    borderTopColor: 'rgba(255,255,255,0.18)',
    borderLeftColor: 'rgba(255,255,255,0.1)',
    borderRightColor: 'rgba(82,8,18,0.5)',
    borderBottomColor: 'rgba(82,8,18,0.72)',
    shadowColor: '#6E0A18',
  },
  toggleChipDangerText: {
    color: '#FFF8EE',
  },
  toggleChipText: {
    color: '#173248',
    fontSize: 14,
    fontWeight: '800',
  },
  toggleChipDangerTextIdle: {
    color: '#4C0C15',
  },
  toggleChipTextSelected: {
    color: '#FFF8EE',
  },
  layerActionRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  insertLayerPanel: {
    borderRadius: 8,
    padding: 14,
    backgroundColor: '#B5C6D2',
    borderWidth: 1,
    borderColor: '#31495C',
    gap: 12,
  },
  insertLayerPanelTitle: {
    color: '#173248',
    fontSize: 16,
    fontWeight: '800',
  },
  insertLayerPanelHint: {
    color: '#30516A',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  insertLayerPanelError: {
    color: '#7B1824',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  layerInlineActionRow: {
    marginBottom: 14,
    flexDirection: 'row',
  },
  insertLayerButton: {
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#A94C2A',
    alignItems: 'center',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.22)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.14)',
    borderRightWidth: 2,
    borderRightColor: 'rgba(7,20,36,0.26)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(7,20,36,0.42)',
    shadowColor: '#091827',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 7,
  },
  insertLayerButtonText: {
    color: '#FFF8EE',
    fontSize: 14,
    fontWeight: '800',
  },
  temperatureBuilder: {
    gap: 14,
  },
  temperatureRowCard: {
    borderRadius: 8,
    padding: 14,
    backgroundColor: '#B5C6D2',
    borderWidth: 1,
    borderColor: '#31495C',
    gap: 12,
  },
  temperatureRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  temperatureRowTitle: {
    color: '#173248',
    fontSize: 17,
    fontWeight: '800',
  },
  temperatureRowPreview: {
    flex: 1,
    color: '#30516A',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'right',
  },
  temperatureHint: {
    color: '#5D6971',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  temperatureActionRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  temperatureAddButton: {
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#30516A',
    alignItems: 'center',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.28)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.18)',
    borderRightWidth: 2,
    borderRightColor: 'rgba(7,20,36,0.26)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(7,20,36,0.42)',
    shadowColor: '#091827',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 7,
  },
  temperatureAddButtonText: {
    color: '#FFF8EE',
    fontSize: 15,
    fontWeight: '800',
  },
  testBuilder: {
    gap: 14,
  },
  testCard: {
    borderRadius: 8,
    padding: 14,
    backgroundColor: '#B5C6D2',
    borderWidth: 1,
    borderColor: '#31495C',
    gap: 12,
  },
  testHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  testHeaderStack: {
    flex: 1,
    gap: 4,
  },
  testTitle: {
    color: '#173248',
    fontSize: 17,
    fontWeight: '800',
  },
  testPreview: {
    color: '#30516A',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  testChevron: {
    color: '#173248',
    fontSize: 26,
    lineHeight: 26,
    fontWeight: '500',
  },
  testActionRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  testAddButton: {
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#30516A',
    alignItems: 'center',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.28)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.18)',
    borderRightWidth: 2,
    borderRightColor: 'rgba(7,20,36,0.26)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(7,20,36,0.42)',
    shadowColor: '#091827',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 7,
  },
  testAddButtonText: {
    color: '#FFF8EE',
    fontSize: 15,
    fontWeight: '800',
  },
  addLayerButton: {
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#30516A',
    alignItems: 'center',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.28)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.18)',
    borderRightWidth: 2,
    borderRightColor: 'rgba(7,20,36,0.26)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(7,20,36,0.42)',
    shadowColor: '#091827',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 7,
  },
  addLayerButtonText: {
    color: '#FFF8EE',
    fontSize: 15,
    fontWeight: '800',
  },
  removeLayerButton: {
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#A9B8C4',
    alignItems: 'center',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.3)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.22)',
    borderRightWidth: 2,
    borderRightColor: 'rgba(7,20,36,0.2)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(7,20,36,0.34)',
    shadowColor: '#091827',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 6,
  },
  removeLayerButtonText: {
    color: '#173248',
    fontSize: 15,
    fontWeight: '800',
  },
  deleteLayerButton: {
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#FFF8F6',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C97C72',
  },
  deleteLayerButtonText: {
    color: '#9B332A',
    fontSize: 15,
    fontWeight: '800',
  },
  fieldLabel: {
    color: '#20384D',
    fontSize: 14,
    fontWeight: '700',
  },
  fieldInput: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#D7E0E8',
    color: '#1F3443',
    fontSize: 16,
    lineHeight: 22,
    borderWidth: 1,
    borderColor: '#31495C',
  },
  multilineInput: {
    minHeight: 88,
    paddingTop: 14,
  },
  dateRow: {
    gap: 12,
  },
  dateBlock: {
    gap: 8,
  },
  selectorField: {
    gap: 8,
    minWidth: 0,
  },
  selectorTrigger: {
    borderRadius: 8,
    backgroundColor: '#D7E0E8',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#31495C',
  },
  selectorTriggerSelected: {
    backgroundColor: '#A9B8C4',
  },
  selectorTriggerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  selectorValue: {
    flex: 1,
    color: '#173248',
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '800',
  },
  selectorPlaceholder: {
    color: '#6F746E',
  },
  selectorChevron: {
    color: '#30516A',
    fontSize: 16,
    fontWeight: '800',
  },
  selectorOptions: {
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: '#D7E0E8',
    borderWidth: 1,
    borderColor: '#31495C',
    overflow: 'hidden',
  },
  selectorOption: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#9EB0BD',
  },
  selectorOptionFirst: {
    borderTopWidth: 0,
  },
  selectorOptionSelected: {
    backgroundColor: '#173248',
  },
  selectorOptionText: {
    color: '#173248',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '800',
  },
  selectorOptionTextSelected: {
    color: '#FFF8EE',
  },
  windField: {
    gap: 12,
  },
  subFieldLabel: {
    color: '#173248',
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    flexShrink: 1,
  },
  subFieldLabelSpacing: {
    marginTop: 4,
  },
  optionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#D7E0E8',
    borderWidth: 1,
    borderColor: '#31495C',
  },
  optionChipSelected: {
    backgroundColor: '#173248',
  },
  optionChipText: {
    color: '#173248',
    fontSize: 13,
    fontWeight: '700',
  },
  optionChipTextSelected: {
    color: '#FFF8EE',
  },
  bottomActions: {
    gap: 10,
    marginTop: 6,
  },
  manualBottomActions: {
    gap: 6,
    marginTop: 0,
    marginBottom: 56,
  },
  bottomCreateShell: {
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#06080B',
    shadowColor: '#091827',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.42,
    shadowRadius: 22,
    elevation: 18,
  },
  bottomCreateHighlight: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: 3,
    height: 10,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  bottomCreateFrame: {
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
  bottomCreateButton: {
    borderRadius: 3,
    paddingVertical: 16,
    paddingHorizontal: 18,
    backgroundColor: '#3B627D',
    alignItems: 'center',
  },
  bottomCreateButtonText: {
    color: '#FFF8EE',
    fontSize: 18,
    fontWeight: '800',
  },
  bottomHomeShell: {
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#06080B',
    shadowColor: '#091827',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 12,
  },
  bottomHomeFrame: {
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
  bottomHomeButton: {
    borderRadius: 3,
    paddingVertical: 13,
    paddingHorizontal: 18,
    backgroundColor: '#94A8B8',
    alignItems: 'center',
  },
  bottomHomeButtonText: {
    color: '#173248',
    fontSize: 18,
    fontWeight: '800',
  },
  bottomPressed: {
    transform: [{ scale: 0.985 }, { translateY: 2 }],
  },
  pressed: {
    transform: [{ scale: 0.985 }, { translateY: 2 }],
  },
  link: { color: '#173248', fontSize: 16, fontWeight: '700' },
  keyboardAvoiding: {
    flex: 1,
  },
});

const windSpeedOptions = ['calm', 'light', 'moderate', 'strong'];
const windDirectionOptions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const hardnessOptions = ['F', 'F+', '4F', '4F+', '1F', '1F+', 'P', 'P+', 'K', 'K+', 'I'];
const grainOptions = ['PP', 'DF', 'RG', 'FC', 'SH', 'DH', 'MF', 'IFrc', 'MFcr'];
const sizeOptions = [
  '0.5 mm',
  '1 mm',
  '1.5 mm',
  '2 mm',
  '2.5 mm',
  '3 mm',
  '4 mm',
  '5 mm',
  '6 mm',
  '7 mm',
  '8 mm',
  '9 mm',
  '10 mm',
  '11 mm',
  '12 mm',
  '13 mm',
  '14 mm',
  '15 mm',
  '16 mm',
  '17 mm',
  '18 mm',
  '19 mm',
  '20 mm',
  '21 mm',
  '22 mm',
  '23 mm',
  '24 mm',
  '25 mm',
  '3 cm',
  '4 cm',
  '5 cm',
  '6 cm',
  '7 cm',
  '8 cm',
  '9 cm',
  '10 cm',
];
const stabilityTestTypeOptions = [
  { label: 'Compression Test', value: 'CT' },
  { label: 'Shovel Shear Test', value: 'SS' },
  { label: 'Hand Shear Test', value: 'HS' },
  { label: 'Ext. Col. Test', value: 'ECT' },
  { label: 'Propagation Saw Test', value: 'PST' },
  { label: 'Rutschblock Test', value: 'RB' },
] as const;
const stabilityResultOptions = ['easy', 'moderate', 'hard'];
const ectResultOptions = ['ECTN', 'ECTP', 'ECTX'];
const pstResultOptions = ['End', 'Arr', 'SF'];
const rbScoreOptions = ['RB1', 'RB2', 'RB3', 'RB4', 'RB5', 'RB6', 'RB7'];
const stabilityCharacterOptions = ['SC', 'SP', 'PC', 'RP', 'BRK'];
const temperatureDepthOptions = ['surface', '0', ...Array.from({ length: 40 }, (_, index) => `${(index + 1) * 10}`)];
const timeOptions = buildTimeOptions(8, 18, 15);
const monthOptions = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const dayOptions = Array.from({ length: 31 }, (_, index) => `${index + 1}`);
const yearOptions = ['2025', '2026', '2027'];
const layerIndexes = Array.from({ length: 12 }, (_, index) => index + 1);
const layerFieldSuffixes = [
  'top',
  'bottom',
  'hardness_1',
  'hardness_2',
  'grain_1',
  'grain_2',
  'size_1',
  'size_2',
  'comment',
  'concern',
] as const;
const temperatureIndexes = Array.from({ length: 20 }, (_, index) => index + 1);
const stabilityTestIndexes = Array.from({ length: 12 }, (_, index) => index + 1);

function DateField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const parts = parseDateParts(value);
  const update = (nextMonth: string, nextDay: string, nextYear: string) => onChange(composeDate(nextMonth, nextDay, nextYear));

  return (
    <View style={styles.dateRow}>
      <View style={styles.dateBlock}>
        <SelectorField
          label="Month"
          value={parts.month}
          placeholder="Select month"
          options={monthOptions}
          onSelect={(nextMonth) => update(nextMonth, parts.day || '1', parts.year || yearOptions[1] || yearOptions[0])}
        />
      </View>
      <View style={styles.dateBlock}>
        <SelectorField
          label="Day"
          value={parts.day}
          placeholder="Select day"
          options={dayOptions}
          onSelect={(nextDay) => update(parts.month || 'January', nextDay, parts.year || yearOptions[1] || yearOptions[0])}
        />
      </View>
      <View style={styles.dateBlock}>
        <SelectorField
          label="Year"
          value={parts.year}
          placeholder="Select year"
          options={yearOptions}
          onSelect={(nextYear) => update(parts.month || 'January', parts.day || '1', nextYear)}
        />
      </View>
    </View>
  );
}

function WindField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { speed, direction } = parseWindValue(value);
  const setSpeed = (nextSpeed: string) => onChange(buildWindValue(nextSpeed, nextSpeed === 'calm' ? '' : direction));
  const setDirection = (nextDirection: string) => onChange(buildWindValue(speed, nextDirection));

  return (
    <View style={styles.windField}>
      <SelectorField
        label="Speed"
        value={speed}
        placeholder="Select wind speed"
        options={windSpeedOptions}
        onSelect={setSpeed}
      />
      {speed !== 'calm' ? (
        <SelectorField
          label="Direction"
          value={direction}
          placeholder="Select wind direction"
          options={windDirectionOptions}
          onSelect={setDirection}
        />
      ) : null}
    </View>
  );
}

function ManualLayerEditor({
  values,
  onChange,
  onReplace,
  onBuilderLayout,
  onLayerLayout,
  onFocusLayer,
}: {
  values: Record<string, string>;
  onChange: (fieldId: string, value: string) => void;
  onReplace: (values: Record<string, string>) => void;
  onBuilderLayout: (offsetY: number) => void;
  onLayerLayout: (index: number, offsetY: number) => void;
  onFocusLayer: (index: number) => void;
}) {
  const [openLayerIndex, setOpenLayerIndex] = useState(0);
  const showInsertLayerAction = getVisibleLayerCardCount(values) > 1;

  return (
    <ReviewStyleLayerEditor
      values={values}
      onChange={onChange}
      onReplace={onReplace}
      openLayerIndex={openLayerIndex}
      onOpenLayerIndexChange={setOpenLayerIndex}
      onEditorLayout={onBuilderLayout}
      onLayerLayout={onLayerLayout}
      onFocusLayer={onFocusLayer}
      showInsertLayerAction={showInsertLayerAction}
    />
  );
}

function LayerBuilder({
  values,
  onChange,
  onBuilderLayout,
  onLayerLayout,
  onFocusLayer,
}: {
  values: Record<string, string>;
  onChange: (fieldId: string, value: string) => void;
  onBuilderLayout: (offsetY: number) => void;
  onLayerLayout: (index: number, offsetY: number) => void;
  onFocusLayer: (index: number) => void;
}) {
  const [openLayerIndex, setOpenLayerIndex] = useState(0);
  const resolvedActiveCount = getVisibleLayerCardCount(values);
  const activeCount = Math.max(resolvedActiveCount, openLayerIndex || 0);
  const canAddLayer = activeCount < layerIndexes.length;
  const canRemoveLayer = activeCount > 1;
  const [showInsertPanel, setShowInsertPanel] = useState(false);
  const [insertTop, setInsertTop] = useState('');
  const [insertBottom, setInsertBottom] = useState('');
  const [insertError, setInsertError] = useState('');

  return (
    <View
      style={styles.layerBuilder}
      onLayout={(event) => {
        onBuilderLayout(event.nativeEvent.layout.y);
      }}>
      {layerIndexes.slice(0, activeCount).map((index) => {
        const previousBottom = index === 1 ? '' : values[`layer_${index - 1}_bottom`] ?? '';
        const topValue = index === 1 ? values[`layer_${index}_top`] ?? '0' : previousBottom;
        const bottomValue = values[`layer_${index}_bottom`] ?? '';
        const preview = buildLayerPreview(values, index, topValue, bottomValue);
        const isOpen = openLayerIndex === index;

        return (
          <View
            key={index}
            style={styles.layerCard}
            onLayout={(event) => {
              onLayerLayout(index, event.nativeEvent.layout.y);
            }}>
            <Pressable style={styles.layerCardHeader} onPress={() => setOpenLayerIndex((current) => (current === index ? 0 : index))}>
              <View style={styles.layerHeaderStack}>
                <Text style={styles.layerCardTitle}>Layer {index}</Text>
                {!preview ? <Text style={styles.layerPreview}>Depth, grains, hardness, size, and notes</Text> : null}
                {preview ? (
                  <View
                    style={[
                      styles.layerPreviewBadge,
                      values[`layer_${index}_concern`] === 'yes' ? styles.layerPreviewBadgeConcern : null,
                    ]}>
                    <Text
                      style={[
                        styles.layerPreviewBadgeText,
                        values[`layer_${index}_concern`] === 'yes' ? styles.layerPreviewBadgeTextConcern : null,
                      ]}>
                      {preview}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.layerChevron}>{isOpen ? '−' : '+'}</Text>
            </Pressable>

            {isOpen ? (
              <>
            <View style={styles.layerGroup}>
              <Text style={styles.layerGroupLabel}>Depth</Text>
              <View style={styles.layerRow}>
                <View style={styles.layerCol}>
                  <Text style={styles.subFieldLabel}>Top Depth (cm)</Text>
                  {index === 1 ? (
                  <TextInput
                      value={values[`layer_${index}_top`] ?? '0'}
                    onChangeText={(value) => onChange(`layer_${index}_top`, value)}
                      placeholder="Top"
                      placeholderTextColor="#8C8A84"
                      keyboardType="numeric"
                      style={styles.fieldInput}
                    />
                  ) : (
                    <Text style={styles.depthValue}>{topValue || 'Carry from layer above'}</Text>
                  )}
                </View>
                <View style={styles.layerCol}>
                  <Text style={styles.subFieldLabel}>Bottom Depth (cm)</Text>
                  <TextInput
                    value={bottomValue}
                    onChangeText={(value) => {
                      onChange(`layer_${index}_bottom`, normalizeBottomDepthDraftValue(value));
                    }}
                    onEndEditing={() => {
                      onChange(`layer_${index}_bottom`, enforceMinimumBottomDepth(bottomValue, topValue));
                    }}
                    placeholder="Bottom"
                    placeholderTextColor="#8C8A84"
                    keyboardType="numeric"
                    style={styles.fieldInput}
                  />
                  {getMinimumBottomDepth(topValue) ? (
                    <Text style={styles.depthHint}>Must be {getMinimumBottomDepth(topValue)} cm or deeper</Text>
                  ) : null}
                </View>
              </View>
            </View>
            <View style={styles.layerDivider} />

            <View style={styles.layerGroup}>
              <Text style={styles.layerGroupLabel}>Hardness</Text>
              <View style={styles.layerRow}>
                <View style={styles.layerCol}>
                  <SelectorField
                    label="Hardness 1"
                    value={values[`layer_${index}_hardness_1`] ?? ''}
                    placeholder="Choose"
                    options={hardnessOptions}
                    clearOptionLabel="None"
                    onSelect={(value) => onChange(`layer_${index}_hardness_1`, value)}
                  />
                </View>
                <View style={styles.layerCol}>
                  <SelectorField
                    label="Hardness 2"
                    value={values[`layer_${index}_hardness_2`] ?? ''}
                    placeholder="Optional"
                    options={hardnessOptions}
                    clearOptionLabel="None"
                    onSelect={(value) => onChange(`layer_${index}_hardness_2`, value)}
                  />
                </View>
              </View>
            </View>
            <View style={styles.layerDivider} />

            <View style={styles.layerGroup}>
              <Text style={styles.layerGroupLabel}>Grain Form</Text>
              <View style={styles.layerRow}>
                <View style={styles.layerCol}>
                  <SelectorField
                    label="Grain Form 1"
                    value={values[`layer_${index}_grain_1`] ?? ''}
                    placeholder="Choose"
                    options={grainOptions}
                    clearOptionLabel="None"
                    onSelect={(value) => onChange(`layer_${index}_grain_1`, value)}
                  />
                </View>
                <View style={styles.layerCol}>
                  <SelectorField
                    label="Grain Form 2"
                    value={values[`layer_${index}_grain_2`] ?? ''}
                    placeholder="Optional"
                    options={grainOptions}
                    clearOptionLabel="None"
                    onSelect={(value) => onChange(`layer_${index}_grain_2`, value)}
                  />
                </View>
              </View>
            </View>
            <View style={styles.layerDivider} />

            <View style={styles.layerGroup}>
              <Text style={styles.layerGroupLabel}>Grain Size</Text>
              <View style={styles.layerRow}>
                <View style={styles.layerCol}>
                  <SelectorField
                    label="Grain Size 1"
                    value={values[`layer_${index}_size_1`] ?? ''}
                    placeholder="Optional"
                    options={sizeOptions}
                    clearOptionLabel="None"
                    onSelect={(value) => onChange(`layer_${index}_size_1`, value)}
                  />
                </View>
                <View style={styles.layerCol}>
                  <SelectorField
                    label="Grain Size 2"
                    value={values[`layer_${index}_size_2`] ?? ''}
                    placeholder="Optional"
                    options={sizeOptions}
                    clearOptionLabel="None"
                    onSelect={(value) => onChange(`layer_${index}_size_2`, value)}
                  />
                </View>
              </View>
            </View>
            <View style={styles.layerDivider} />

            <View style={styles.layerGroup}>
              <Text style={styles.layerGroupLabel}>Comment</Text>
              <View style={styles.field}>
                <Text style={styles.subFieldLabel}>Layer Note</Text>
                <TextInput
                  value={values[`layer_${index}_comment`] ?? ''}
                  onChangeText={(value) => onChange(`layer_${index}_comment`, value)}
                  placeholder="Optional comment for this layer"
                  placeholderTextColor="#8C8A84"
                  multiline
                  style={[styles.fieldInput, styles.multilineInput]}
                  textAlignVertical="top"
                />
              </View>
            </View>
            <View style={styles.layerDivider} />

            <View style={styles.layerGroup}>
              <Text style={styles.layerGroupLabel}>Concern</Text>
              <View style={styles.field}>
                <Text style={styles.subFieldLabel}>Layer Of Concern</Text>
                <View style={styles.toggleRow}>
                  <Pressable
                    onPress={() => onChange(`layer_${index}_concern`, '')}
                    style={[
                      styles.toggleChip,
                      (values[`layer_${index}_concern`] ?? '') !== 'yes' ? styles.toggleChipSelected : null,
                    ]}>
                    <Text
                      style={[
                        styles.toggleChipText,
                        (values[`layer_${index}_concern`] ?? '') !== 'yes' ? styles.toggleChipTextSelected : null,
                      ]}>
                      No
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onChange(`layer_${index}_concern`, 'yes')}
                    style={[
                      styles.toggleChip,
                      styles.toggleChipDanger,
                      (values[`layer_${index}_concern`] ?? '') === 'yes' ? styles.toggleChipSelectedDanger : null,
                    ]}>
                    <Text
                      style={[
                        styles.toggleChipText,
                        styles.toggleChipDangerTextIdle,
                        (values[`layer_${index}_concern`] ?? '') === 'yes' ? styles.toggleChipDangerText : null,
                      ]}>
                      Yes, mark red
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
            <View style={styles.layerActionRow}>
              <Pressable
                onPress={() => {
                  if (!canRemoveLayer) {
                    return;
                  }
                  const nextValues = buildValuesWithRemovedLayerAtIndex(values, index);
                  replaceLayerValues(nextValues, onChange);
                  const nextOpenIndex = Math.min(index, activeCount - 1);
                  setOpenLayerIndex(nextOpenIndex);
                  onFocusLayer(nextOpenIndex);
                }}
                style={[styles.deleteLayerButton, !canRemoveLayer ? styles.buttonDisabled : null]}
                disabled={!canRemoveLayer}>
                <Text style={styles.deleteLayerButtonText}>Delete Layer</Text>
              </Pressable>
            </View>
              </>
            ) : null}
          </View>
        );
      })}

      <View style={styles.layerActionRow}>
        <Pressable
          onPress={() => {
            if (!canAddLayer) {
              return;
            }
            setShowInsertPanel((current) => !current);
            setInsertError('');
          }}
          style={[styles.insertLayerButton, !canAddLayer ? styles.buttonDisabled : null]}
          disabled={!canAddLayer}>
          <Text style={styles.insertLayerButtonText}>Insert Layer</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (!canAddLayer) {
              return;
            }
            onChange('layer_count', `${activeCount + 1}`);
            setShowInsertPanel(false);
            setInsertTop('');
            setInsertBottom('');
            setInsertError('');
            setOpenLayerIndex(activeCount + 1);
            onFocusLayer(activeCount + 1);
          }}
          style={[styles.addLayerButton, !canAddLayer ? styles.buttonDisabled : null]}
          disabled={!canAddLayer}>
          <Text style={styles.addLayerButtonText}>Add Layer</Text>
        </Pressable>
      </View>

      {showInsertPanel ? (
        <View style={styles.insertLayerPanel}>
          <Text style={styles.insertLayerPanelTitle}>Insert Missing Layer</Text>
          <Text style={styles.insertLayerPanelHint}>
            Enter the missing layer depths. Nivium will place it in the snowpack and open it for details.
          </Text>
          <View style={styles.layerRow}>
            <View style={styles.layerCol}>
              <Text style={styles.subFieldLabel}>Top Depth (cm)</Text>
              <TextInput
                value={insertTop}
                onChangeText={(value) => {
                  setInsertTop(normalizeBottomDepthDraftValue(value));
                  if (insertError) {
                    setInsertError('');
                  }
                }}
                placeholder="Top"
                placeholderTextColor="#8C8A84"
                keyboardType="numeric"
                style={styles.fieldInput}
              />
            </View>
            <View style={styles.layerCol}>
              <Text style={styles.subFieldLabel}>Bottom Depth (cm)</Text>
              <TextInput
                value={insertBottom}
                onChangeText={(value) => {
                  setInsertBottom(normalizeBottomDepthDraftValue(value));
                  if (insertError) {
                    setInsertError('');
                  }
                }}
                placeholder="Bottom"
                placeholderTextColor="#8C8A84"
                keyboardType="numeric"
                style={styles.fieldInput}
              />
            </View>
          </View>
          {insertError ? <Text style={styles.insertLayerPanelError}>{insertError}</Text> : null}
          <View style={styles.layerActionRow}>
            <Pressable
              onPress={() => {
                const result = buildValuesWithInsertedLayerRange(values, insertTop, insertBottom);
                if ('error' in result) {
                  setInsertError(result.error);
                  return;
                }
                replaceLayerValues(result.nextValues, onChange);
                setOpenLayerIndex(result.insertedIndex);
                onFocusLayer(result.insertedIndex);
                setShowInsertPanel(false);
                setInsertTop('');
                setInsertBottom('');
                setInsertError('');
              }}
              style={styles.addLayerButton}>
              <Text style={styles.addLayerButtonText}>Place Layer</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setShowInsertPanel(false);
                setInsertTop('');
                setInsertBottom('');
                setInsertError('');
              }}
              style={styles.removeLayerButton}>
              <Text style={styles.removeLayerButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function SelectorField({
  label,
  value,
  placeholder,
  options,
  clearOptionLabel,
  onSelect,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: readonly (string | { label: string; value: string })[];
  clearOptionLabel?: string;
  onSelect: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const renderedOptions: (string | { label: string; value: string })[] = clearOptionLabel
    ? [clearOptionLabel, ...options]
    : [...options];

  return (
    <View style={styles.selectorField}>
      <Text style={styles.subFieldLabel}>{label}</Text>
      <Pressable
        onPress={() => setIsOpen((current) => !current)}
        style={[styles.selectorTrigger, isOpen ? styles.selectorTriggerSelected : null]}>
        <View style={styles.selectorTriggerRow}>
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[styles.selectorValue, !value ? styles.selectorPlaceholder : null]}>
            {value || placeholder}
          </Text>
          <Text style={styles.selectorChevron}>{isOpen ? '▲' : '▼'}</Text>
        </View>
      </Pressable>
      {isOpen ? (
        <View style={styles.selectorOptions}>
          {renderedOptions.map((option, index) => {
            const optionValue = typeof option === 'string' ? option : option.value;
            const optionLabel = typeof option === 'string' ? option : option.label;
            const isClearOption = clearOptionLabel && optionValue === clearOptionLabel;
            const selected = isClearOption ? !value : value === optionValue;
            return (
              <Pressable
                key={optionValue}
                onPress={() => {
                  onSelect(isClearOption ? '' : optionValue);
                  setIsOpen(false);
                }}
                style={[
                  styles.selectorOption,
                  index === 0 ? styles.selectorOptionFirst : null,
                  selected ? styles.selectorOptionSelected : null,
                ]}>
                <Text
                  style={[
                    styles.selectorOptionText,
                    selected ? styles.selectorOptionTextSelected : null,
                  ]}>
                  {optionLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function TemperatureBuilder({
  values,
  onChange,
}: {
  values: Record<string, string>;
  onChange: (fieldId: string, value: string) => void;
}) {
  const activeCount = getVisibleTemperatureRowCount(values);
  const canAddRow = activeCount < temperatureIndexes.length;
  const canRemoveRow = activeCount > 1;

  return (
    <View style={styles.temperatureBuilder}>
      {temperatureIndexes.slice(0, activeCount).map((index) => {
        const depth = values[`temp_${index}_depth`] ?? '';
        const temperature = values[`temp_${index}_value`] ?? '';
        const preview = buildTemperaturePreview(depth, temperature);

        return (
          <View key={index} style={styles.temperatureRowCard}>
            <View style={styles.temperatureRowHeader}>
              <Text style={styles.temperatureRowTitle}>Reading {index}</Text>
              <Text style={styles.temperatureRowPreview}>{preview || 'Choose depth and enter temperature'}</Text>
            </View>

            <View style={styles.layerRow}>
              <View style={styles.layerCol}>
                <SelectorField
                  label="Depth"
                  value={depth}
                  placeholder="Choose"
                  options={temperatureDepthOptions}
                  onSelect={(value) => onChange(`temp_${index}_depth`, value)}
                />
              </View>
              <View style={styles.layerCol}>
                <Text style={styles.subFieldLabel}>Temperature (°C)</Text>
                <TextInput
                  value={temperature}
                  onChangeText={(value) =>
                    onChange(`temp_${index}_value`, normalizeTemperatureDraftValue(value, depth))
                  }
                  placeholder="-5"
                  placeholderTextColor="#8C8A84"
                  keyboardType="numeric"
                  style={styles.fieldInput}
                />
              </View>
            </View>

            <Text style={styles.temperatureHint}>
              Pick the measurement depth, then type the temperature beside it.
            </Text>
          </View>
        );
      })}

      <View style={styles.temperatureActionRow}>
        <Pressable
          onPress={() => {
            if (!canAddRow) {
              return;
            }
            onChange('temp_count', `${activeCount + 1}`);
          }}
          style={[styles.temperatureAddButton, !canAddRow ? styles.buttonDisabled : null]}
          disabled={!canAddRow}>
          <Text style={styles.temperatureAddButtonText}>Add Temperature</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (!canRemoveRow) {
              return;
            }
            clearTemperatureRow(activeCount, onChange);
            onChange('temp_count', `${Math.max(activeCount - 1, 1)}`);
          }}
          style={[styles.removeLayerButton, !canRemoveRow ? styles.buttonDisabled : null]}
          disabled={!canRemoveRow}>
          <Text style={styles.removeLayerButtonText}>Remove Last Reading</Text>
        </Pressable>
      </View>
    </View>
  );
}

function StabilityTestBuilder({
  values,
  onChange,
}: {
  values: Record<string, string>;
  onChange: (fieldId: string, value: string) => void;
}) {
  const activeCount = getVisibleStabilityTestCount(values);
  const canAddTest = activeCount < stabilityTestIndexes.length;
  const canRemoveTest = activeCount > 1;
  const [openTestIndex, setOpenTestIndex] = useState(activeCount);

  useEffect(() => {
    if (openTestIndex > activeCount) {
      setOpenTestIndex(activeCount);
    }
  }, [activeCount, openTestIndex]);

  return (
    <View style={styles.testBuilder}>
      {stabilityTestIndexes.slice(0, activeCount).map((index) => {
        const type = values[`test_${index}_type`] ?? '';
        const storedResult = values[`test_${index}_result`] ?? '';
        const taps = values[`test_${index}_taps`] ?? '';
        const character = values[`test_${index}_character`] ?? '';
        const depth = values[`test_${index}_depth`] ?? '';
        const pstCut = values[`test_${index}_pst_cut`] ?? '';
        const pstColumn = values[`test_${index}_pst_column`] ?? '';
        const result = type === 'CT' ? resolveCtResultLabel(taps, storedResult) : storedResult;
        const preview = buildStabilityPreview(type, result, taps, character, depth);
        const isOpen = openTestIndex === index;

        return (
          <View key={index} style={styles.testCard}>
            <Pressable style={styles.testHeader} onPress={() => setOpenTestIndex((current) => (current === index ? 0 : index))}>
              <View style={styles.testHeaderStack}>
                <Text style={styles.testTitle}>Test {index}</Text>
                <Text style={styles.testPreview}>{preview || 'Choose test type, result, and depth'}</Text>
              </View>
              <Text style={styles.testChevron}>{isOpen ? '−' : '+'}</Text>
            </Pressable>

            {isOpen ? (
              <>
                <View style={styles.layerGroup}>
                  <Text style={styles.layerGroupLabel}>Test Setup</Text>
                  <View style={styles.layerRow}>
                    <View style={styles.layerCol}>
                      <SelectorField
                        label="Test Type"
                        value={type}
                        placeholder="Choose"
                        options={stabilityTestTypeOptions}
                        onSelect={(value) => {
                          onChange(`test_${index}_type`, value);
                          if (value === 'CT') {
                            onChange(`test_${index}_result`, 'auto');
                          } else if (value === 'RB') {
                            onChange(`test_${index}_result`, values[`test_${index}_result`] || 'RB1');
                          } else {
                            onChange(`test_${index}_result`, '');
                          }
                        }}
                      />
                    </View>
                    {type !== 'CT' ? (
                      <View style={styles.layerCol}>
                        <SelectorField
                          label="Result"
                          value={result}
                          placeholder="Choose"
                          options={
                            type === 'ECT'
                              ? ectResultOptions
                              : type === 'PST'
                                ? pstResultOptions
                                : type === 'RB'
                                  ? rbScoreOptions
                                  : stabilityResultOptions
                          }
                          onSelect={(value) => onChange(`test_${index}_result`, value)}
                        />
                      </View>
                    ) : null}
                  </View>
                </View>
                <View style={styles.layerDivider} />

                <View style={styles.layerGroup}>
                  <Text style={styles.layerGroupLabel}>Details</Text>
                  <View style={styles.layerRow}>
                    <View style={styles.layerCol}>
                      <Text style={styles.subFieldLabel}>Taps</Text>
                      <TextInput
                        value={taps}
                        onChangeText={(value) => {
                          const cleaned = value.replace(/[^0-9]/g, '');
                          onChange(`test_${index}_taps`, cleaned);
                          if (type === 'CT') {
                            onChange(`test_${index}_result`, 'auto');
                          }
                        }}
                        placeholder=""
                        placeholderTextColor="#8C8A84"
                        keyboardType="numeric"
                        editable={type === 'CT' || type === 'ECT'}
                        style={[styles.fieldInput, !(type === 'CT' || type === 'ECT') ? styles.buttonDisabled : null]}
                      />
                    </View>
                    {type === 'CT' ? (
                      <View style={styles.layerCol}>
                        <Text style={styles.subFieldLabel}>Result</Text>
                        <Text style={[styles.depthValue, !result ? styles.depthValuePlaceholder : null]}>
                          {result || 'Enter taps to classify'}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.layerRow}>
                    <View style={styles.layerCol}>
                      <SelectorField
                        label="Fracture Character"
                        value={character}
                        placeholder="Optional"
                        options={stabilityCharacterOptions}
                        onSelect={(value) => onChange(`test_${index}_character`, value)}
                      />
                    </View>
                  </View>
                  {type === 'PST' ? (
                    <View style={styles.layerRow}>
                      <View style={styles.layerCol}>
                        <Text style={styles.subFieldLabel}>Cut Length</Text>
                        <TextInput
                          value={pstCut}
                          onChangeText={(value) => onChange(`test_${index}_pst_cut`, value.replace(/[^0-9]/g, ''))}
                          placeholder="e.g. 30"
                          placeholderTextColor="#8C8A84"
                          keyboardType="numeric"
                          style={styles.fieldInput}
                        />
                      </View>
                      <View style={styles.layerCol}>
                        <Text style={styles.subFieldLabel}>Column Length</Text>
                        <TextInput
                          value={pstColumn}
                          onChangeText={(value) => onChange(`test_${index}_pst_column`, value.replace(/[^0-9]/g, ''))}
                          placeholder="e.g. 100"
                          placeholderTextColor="#8C8A84"
                          keyboardType="numeric"
                          style={styles.fieldInput}
                        />
                      </View>
                    </View>
                  ) : null}
                  <View style={styles.layerRow}>
                    <View style={styles.layerCol}>
                      <Text style={styles.subFieldLabel}>Depth (cm)</Text>
                      <TextInput
                        value={depth}
                        onChangeText={(value) => onChange(`test_${index}_depth`, value.replace(/[^0-9.]/g, ''))}
                        placeholder="Enter depth"
                        placeholderTextColor="#8C8A84"
                        keyboardType="numeric"
                        style={styles.fieldInput}
                      />
                    </View>
                  </View>
                </View>
              </>
            ) : null}
          </View>
        );
      })}

      <View style={styles.testActionRow}>
        <Pressable
          onPress={() => {
            if (!canAddTest) {
              return;
            }
            onChange('test_count', `${activeCount + 1}`);
            setOpenTestIndex(activeCount + 1);
          }}
          style={[styles.testAddButton, !canAddTest ? styles.buttonDisabled : null]}
          disabled={!canAddTest}>
          <Text style={styles.testAddButtonText}>Add Test</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (!canRemoveTest) {
              return;
            }
            clearStabilityTest(activeCount, onChange);
            onChange('test_count', `${Math.max(activeCount - 1, 1)}`);
            setOpenTestIndex(Math.max(activeCount - 1, 1));
          }}
          style={[styles.removeLayerButton, !canRemoveTest ? styles.buttonDisabled : null]}
          disabled={!canRemoveTest}>
          <Text style={styles.removeLayerButtonText}>Remove Last Test</Text>
        </Pressable>
      </View>
    </View>
  );
}

function parseDateParts(value: string) {
  const match = value.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  return {
    month: match?.[1] ?? '',
    day: match?.[2] ?? '',
    year: match?.[3] ?? '',
  };
}

function composeDate(month: string, day: string, year: string) {
  const cleanMonth = month.trim();
  const cleanDay = day.trim();
  const cleanYear = year.trim();
  if (!cleanMonth && !cleanDay && !cleanYear) {
    return '';
  }
  if (!cleanMonth || !cleanDay || !cleanYear) {
    return [cleanMonth, cleanDay, cleanYear].filter(Boolean).join(' ').trim();
  }
  return `${cleanMonth} ${cleanDay}, ${cleanYear}`;
}

function parseWindValue(value: string) {
  const clean = value.trim();
  if (!clean) {
    return { speed: '', direction: '' };
  }
  if (clean === 'calm') {
    return { speed: 'calm', direction: '' };
  }
  if (windSpeedOptions.includes(clean)) {
    return { speed: clean, direction: '' };
  }
  const match = clean.match(/^(light|moderate|strong)\s+(N|NE|E|SE|S|SW|W|NW)$/);
  return {
    speed: match?.[1] ?? '',
    direction: match?.[2] ?? '',
  };
}

function buildWindValue(speed: string, direction: string) {
  if (!speed) {
    return '';
  }
  if (speed === 'calm') {
    return 'calm';
  }
  return direction ? `${speed} ${direction}` : speed;
}

function getLayerCardCount(values: Record<string, string>) {
  let highestIndex = 0;
  for (const index of layerIndexes) {
    const keys = [
      `layer_${index}_top`,
      `layer_${index}_bottom`,
      `layer_${index}_hardness_1`,
      `layer_${index}_hardness_2`,
      `layer_${index}_grain_1`,
      `layer_${index}_grain_2`,
      `layer_${index}_size_1`,
      `layer_${index}_size_2`,
      `layer_${index}_comment`,
      `layer_${index}_concern`,
    ];
    if (keys.some((key) => (values[key] ?? '').trim().length > 0)) {
      highestIndex = index;
    }
  }
  return highestIndex;
}

function getVisibleLayerCardCount(values: Record<string, string>, extractedValues?: Record<string, string>) {
  const explicitCount = Number(values.layer_count ?? '');
  if (Number.isFinite(explicitCount) && explicitCount > 0) {
    return Math.min(Math.max(Math.trunc(explicitCount), 1), layerIndexes.length);
  }
  const structuredCount = getLayerCardCount(values);
  const legacyCount = getLegacyLayerCount(extractedValues ?? values);
  return Math.max(structuredCount, legacyCount, 1);
}

function getLegacyLayerCount(values: Record<string, string>) {
  let count = 0;
  for (const index of layerIndexes) {
    if ((values[`layer_${index}`] ?? '').trim()) {
      count += 1;
    }
  }
  return count;
}

function buildLayerPreview(values: Record<string, string>, index: number, top: string, bottom: string) {
  const grain = [values[`layer_${index}_grain_1`] ?? '', values[`layer_${index}_grain_2`] ?? ''].filter(Boolean).join(' / ');
  const hardness = [values[`layer_${index}_hardness_1`] ?? '', values[`layer_${index}_hardness_2`] ?? ''].filter(Boolean).join(' to ');
  const size = [values[`layer_${index}_size_1`] ?? '', values[`layer_${index}_size_2`] ?? '']
    .filter(Boolean)
    .map((value) => normalizeStructuredSizeLabel(value))
    .join(' to ');
  const concern = values[`layer_${index}_concern`] === 'yes' ? 'Layer of concern' : '';

  return [
    top && bottom ? `${top}-${bottom} cm` : '',
    grain ? `grain ${grain}` : '',
    hardness ? `hardness ${hardness}` : '',
    size ? `size ${size}` : '',
    concern,
  ]
    .filter(Boolean)
    .join(' · ');
}

function normalizeStructuredSizeLabel(value: string) {
  const clean = value.trim();
  if (!clean) {
    return '';
  }
  if (/\b(?:mm|cm)\b$/i.test(clean)) {
    return clean;
  }
  return `${clean} mm`;
}

function clearLayerCard(index: number, onChange: (fieldId: string, value: string) => void) {
  getLayerFieldIds(index).forEach((fieldId) => onChange(fieldId, ''));
}

function getLayerFieldIds(index: number) {
  return layerFieldSuffixes.map((suffix) => `layer_${index}_${suffix}`);
}

function snapshotLayerValues(values: Record<string, string>, index: number) {
  return Object.fromEntries(
    layerFieldSuffixes.map((suffix) => [suffix, values[`layer_${index}_${suffix}`] ?? ''])
  );
}

function writeLayerSnapshot(
  snapshot: Record<string, string>,
  targetIndex: number,
  onChange: (fieldId: string, value: string) => void
) {
  layerFieldSuffixes.forEach((suffix) => {
    onChange(`layer_${targetIndex}_${suffix}`, snapshot[suffix] ?? '');
  });
}

function formatLayerDepthValue(value: number) {
  if (Number.isInteger(value)) {
    return `${value}`;
  }
  return value.toFixed(2).replace(/\.?0+$/, '');
}

function buildValuesWithInsertedLayerRange(
  values: Record<string, string>,
  topDraft: string,
  bottomDraft: string
): { nextValues: Record<string, string>; insertedIndex: number } | { error: string } {
  const activeCount = getVisibleLayerCardCount(values);
  if (activeCount >= layerIndexes.length) {
    return { error: 'Maximum layers reached.' };
  }

  const numericTop = Number(topDraft.trim());
  const numericBottom = Number(bottomDraft.trim());
  if (!Number.isFinite(numericTop) || !Number.isFinite(numericBottom)) {
    return { error: 'Enter both depths before inserting a layer.' };
  }
  if (numericBottom <= numericTop) {
    return { error: 'Bottom depth must be deeper than top depth.' };
  }

  const segments: { top: number; bottom: number; snapshot: Record<string, string> }[] = [];
  for (let slot = 1; slot <= activeCount; slot += 1) {
    const topValue = slot === 1 ? (values[`layer_${slot}_top`] ?? '0').trim() || '0' : (values[`layer_${slot - 1}_bottom`] ?? '').trim();
    const bottomValue = (values[`layer_${slot}_bottom`] ?? '').trim();
    const top = Number(topValue);
    const bottom = Number(bottomValue);
    if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= top) {
      return { error: 'Fill valid layer depths before inserting a missing layer.' };
    }
    segments.push({ top, bottom, snapshot: snapshotLayerValues(values, slot) });
  }

  const firstTop = segments[0]?.top ?? 0;
  const packBottom = segments[segments.length - 1]?.bottom ?? 0;
  if (numericTop < firstTop) {
    return { error: 'Top depth must stay within the current snowpack.' };
  }
  if (numericBottom > packBottom && numericTop !== packBottom) {
    return { error: 'Bottom depth must stay within the current snowpack.' };
  }

  const blankSnapshot = Object.fromEntries(layerFieldSuffixes.map((suffix) => [suffix, '']));
  const nextSegments: { top: number; bottom: number; snapshot: Record<string, string> }[] = [];
  let insertedIndex = 0;

  for (const segment of segments) {
    if (segment.bottom <= numericTop) {
      nextSegments.push({ ...segment, snapshot: { ...segment.snapshot } });
      continue;
    }

    if (segment.top >= numericBottom) {
      if (!insertedIndex) {
        nextSegments.push({ top: numericTop, bottom: numericBottom, snapshot: { ...blankSnapshot } });
        insertedIndex = nextSegments.length;
      }
      nextSegments.push({ ...segment, snapshot: { ...segment.snapshot } });
      continue;
    }

    if (segment.top < numericTop) {
      nextSegments.push({
        top: segment.top,
        bottom: numericTop,
        snapshot: { ...segment.snapshot, bottom: formatLayerDepthValue(numericTop) },
      });
    }

    if (!insertedIndex) {
      nextSegments.push({ top: numericTop, bottom: numericBottom, snapshot: { ...blankSnapshot } });
      insertedIndex = nextSegments.length;
    }

    if (segment.bottom > numericBottom) {
      nextSegments.push({
        top: numericBottom,
        bottom: segment.bottom,
        snapshot: { ...segment.snapshot, top: formatLayerDepthValue(numericBottom) },
      });
    }
  }

  if (!insertedIndex) {
    if (numericTop !== packBottom) {
      return { error: 'Choose a layer range that fits inside the current snowpack.' };
    }
    nextSegments.push({ top: numericTop, bottom: numericBottom, snapshot: { ...blankSnapshot } });
    insertedIndex = nextSegments.length;
  }

  if (nextSegments.length > layerIndexes.length) {
    return { error: `This insert needs more than ${layerIndexes.length} layers.` };
  }

  const nextValues = { ...values };
  for (const slot of layerIndexes) {
    getLayerFieldIds(slot).forEach((fieldId) => {
      nextValues[fieldId] = '';
    });
  }

  nextSegments.forEach((segment, slotIndex) => {
    const targetIndex = slotIndex + 1;
    const rewritten = { ...segment.snapshot };
    if (targetIndex === 1) {
      rewritten.top = formatLayerDepthValue(segment.top);
    } else {
      rewritten.top = formatLayerDepthValue(nextSegments[targetIndex - 2]?.bottom ?? numericTop);
    }
    rewritten.bottom = formatLayerDepthValue(segment.bottom);
    layerFieldSuffixes.forEach((suffix) => {
      nextValues[`layer_${targetIndex}_${suffix}`] = rewritten[suffix] ?? '';
    });
  });
  nextValues.layer_count = `${nextSegments.length}`;
  return { nextValues, insertedIndex };
}

function replaceLayerValues(nextValues: Record<string, string>, onChange: (fieldId: string, value: string) => void) {
  for (const slot of layerIndexes) {
    clearLayerCard(slot, onChange);
  }
  for (const slot of layerIndexes) {
    const snapshot = Object.fromEntries(
      layerFieldSuffixes.map((suffix) => [suffix, nextValues[`layer_${slot}_${suffix}`] ?? ''])
    );
    writeLayerSnapshot(snapshot, slot, onChange);
  }
  onChange('layer_count', nextValues.layer_count ?? '1');
}

function buildValuesWithRemovedLayerAtIndex(values: Record<string, string>, index: number) {
  const activeCount = getVisibleLayerCardCount(values);
  if (activeCount <= 1 || index < 1 || index > activeCount) {
    return values;
  }

  const nextValues = { ...values };
  const snapshots: Record<string, string>[] = [];
  for (let slot = 1; slot <= activeCount; slot += 1) {
    if (slot === index) {
      continue;
    }
    snapshots.push(snapshotLayerValues(values, slot));
  }

  for (const slot of layerIndexes) {
    getLayerFieldIds(slot).forEach((fieldId) => {
      nextValues[fieldId] = '';
    });
  }

  snapshots.forEach((snapshot, slotIndex) => {
    const targetIndex = slotIndex + 1;
    const rewritten = { ...snapshot };
    rewritten.top = targetIndex === 1 ? '0' : snapshots[targetIndex - 2]?.bottom ?? '';
    layerFieldSuffixes.forEach((suffix) => {
      nextValues[`layer_${targetIndex}_${suffix}`] = rewritten[suffix] ?? '';
    });
  });

  nextValues.layer_count = `${Math.max(snapshots.length, 1)}`;
  return nextValues;
}

function clearTemperatureRow(index: number, onChange: (fieldId: string, value: string) => void) {
  [`temp_${index}_depth`, `temp_${index}_value`].forEach((fieldId) => onChange(fieldId, ''));
}

function clearStabilityTest(index: number, onChange: (fieldId: string, value: string) => void) {
  [
    `test_${index}_type`,
    `test_${index}_result`,
    `test_${index}_taps`,
    `test_${index}_character`,
    `test_${index}_depth`,
    `test_${index}_pst_cut`,
    `test_${index}_pst_column`,
  ].forEach((fieldId) => onChange(fieldId, ''));
}

function normalizeBottomDepthDraftValue(value: string) {
  const cleaned = value.replace(/[^0-9.]/g, '');
  return cleaned;
}

function enforceMinimumBottomDepth(value: string, topValue: string) {
  const cleaned = value.replace(/[^0-9.]/g, '');
  if (!cleaned) {
    return '';
  }

  const minimum = getMinimumBottomDepth(topValue);
  if (!minimum) {
    return cleaned;
  }

  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric)) {
    return cleaned;
  }

  return numeric < Number(minimum) ? minimum : cleaned;
}

function getMinimumBottomDepth(topValue: string) {
  const numericTop = Number(topValue);
  if (!Number.isFinite(numericTop)) {
    return '';
  }

  if (Number.isInteger(numericTop)) {
    return `${numericTop + 1}`;
  }

  return `${Math.ceil(numericTop)}`;
}

function getTemperaturePointCount(values: Record<string, string>) {
  let highestIndex = 0;
  for (const index of temperatureIndexes) {
    if ((values[`temp_${index}_depth`] ?? '').trim() && (values[`temp_${index}_value`] ?? '').trim()) {
      highestIndex = index;
    }
  }
  return highestIndex;
}

function getStructuredTemperaturePointCount(values: Record<string, string>) {
  const lines = (values.temp_profile ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
  return lines.length;
}

function getVisibleTemperatureRowCount(values: Record<string, string>, extractedValues?: Record<string, string>) {
  const explicitCount = Number(values.temp_count ?? '');
  if (Number.isFinite(explicitCount) && explicitCount > 0) {
    return Math.min(Math.max(Math.trunc(explicitCount), 1), temperatureIndexes.length);
  }
  const structuredCount = temperatureIndexes.reduce((count, index) => {
    const hasAny = [`temp_${index}_depth`, `temp_${index}_value`].some((fieldId) => (values[fieldId] ?? '').trim());
    return hasAny ? index : count;
  }, 0);
  const legacyCount = (extractedValues?.temp_profile ?? values.temp_profile ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean).length;
  return Math.max(structuredCount, legacyCount, 1);
}

function getStabilityTestCount(values: Record<string, string>) {
  let highestIndex = 0;
  for (const index of stabilityTestIndexes) {
    const hasAny = [
      `test_${index}_type`,
      `test_${index}_result`,
      `test_${index}_taps`,
      `test_${index}_character`,
      `test_${index}_depth`,
      `test_${index}_pst_cut`,
      `test_${index}_pst_column`,
    ].some((fieldId) => (values[fieldId] ?? '').trim());
    if (hasAny) {
      highestIndex = index;
    }
  }
  return highestIndex;
}

function getLegacyStabilityCount(values: Record<string, string>) {
  return (values.stability_tests ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean).length;
}

function getVisibleStabilityTestCount(values: Record<string, string>, extractedValues?: Record<string, string>) {
  const explicitCount = Number(values.test_count ?? '');
  if (Number.isFinite(explicitCount) && explicitCount > 0) {
    return Math.min(Math.max(Math.trunc(explicitCount), 1), stabilityTestIndexes.length);
  }
  const structuredCount = getStabilityTestCount(values);
  const legacyCount = getLegacyStabilityCount(extractedValues ?? values);
  return Math.max(structuredCount, legacyCount, 1);
}

function buildTemperaturePreview(depth: string, temperature: string) {
  if (!depth && !temperature) {
    return '';
  }
  const left = temperature ? `${temperature} C` : 'temperature pending';
  const right = depth ? (depth === 'surface' ? 'surface' : `${depth} cm`) : 'depth pending';
  return `${left} at ${right}`;
}

function buildStabilityPreview(type: string, result: string, taps: string, character: string, depth: string) {
  if (!type && !result && !taps && !character && !depth) {
    return '';
  }
  const resultPreview =
    result
      ? type === 'CT'
        ? `${type}${resolveCtPreviewLetter(result, taps)}${taps ? ` ${taps} taps` : ''}`
        : type === 'ECT'
          ? `${result}${result !== 'ECTX' && taps ? ` ${taps} taps` : ''}`
          : type === 'PST'
            ? `${type} ${result}`
            : type === 'RB'
              ? result || type
            : `${type} ${result}`
      : type || 'test pending';
  const characterPreview = character ? `character ${character}` : '';
  const depthPreview = depth ? `at ${depth} cm` : 'depth pending';
  return [resultPreview, characterPreview, depthPreview].filter(Boolean).join(' · ');
}

function resolveCtResultLabel(taps: string, fallbackResult: string) {
  const numericTaps = Number(taps);
  if (Number.isFinite(numericTaps)) {
    if (numericTaps >= 1 && numericTaps <= 10) {
      return 'easy';
    }
    if (numericTaps >= 11 && numericTaps <= 20) {
      return 'moderate';
    }
    if (numericTaps >= 21 && numericTaps <= 30) {
      return 'hard';
    }
  }

  if (fallbackResult === 'easy' || fallbackResult === 'moderate' || fallbackResult === 'hard') {
    return fallbackResult;
  }

  return '';
}

function resolveCtPreviewLetter(result: string, taps: string) {
  if (result === 'auto') {
    const numericTaps = Number(taps);
    if (!Number.isFinite(numericTaps)) {
      return '';
    }
    if (numericTaps >= 1 && numericTaps <= 10) {
      return 'E';
    }
    if (numericTaps >= 11 && numericTaps <= 20) {
      return 'M';
    }
    if (numericTaps >= 21 && numericTaps <= 30) {
      return 'H';
    }
    return '';
  }

  return result[0]?.toUpperCase() ?? '';
}

function buildTimeOptions(startHour: number, endHour: number, minuteStep: number) {
  const options: string[] = [];
  for (let hour = startHour; hour <= endHour; hour += 1) {
    for (let minute = 0; minute < 60; minute += minuteStep) {
      if (hour === endHour && minute > 0) {
        continue;
      }
      options.push(`${hour}:${`${minute}`.padStart(2, '0')}`);
    }
  }
  return options;
}

function normalizeTemperatureDraftValue(value: string, depth: string) {
  const cleaned = value.replace(/[^0-9.-]/g, '');
  if (!cleaned) {
    return '';
  }
  if (cleaned === '-') {
    return '-';
  }
  if (depth === 'surface' || depth === '0') {
    return cleaned.replace(/(?!^)-/g, '');
  }
  const normalized = cleaned.startsWith('-') ? cleaned : `-${cleaned}`;
  return normalized.replace(/(?!^)-/g, '');
}
