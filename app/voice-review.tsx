import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { LayerEditor } from '@/components/profile-editor/layer-editor';
import { ObservationDetailsEditor } from '@/components/profile-editor/observation-details-editor';
import type { CurrentLocationStatus } from '@/components/profile-editor/editor-types';
import { countLayerWarnings, getActualLayerCount } from '@/components/profile-editor/layer-utils';
import { useSavedProfiles } from '@/context/saved-profiles-context';
import { useVoiceNoteSession } from '@/context/voice-note-session-context';
import { requiredFieldIds } from '@/data/field-card';
import { getCurrentLocationErrorMessage, resolveCurrentLocationValuesAsync } from '@/utils/current-location';

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
const pstResultOptions = ['END', 'ARR', 'SF'];
const rbScoreOptions = ['RB1', 'RB2', 'RB3', 'RB4', 'RB5', 'RB6', 'RB7'];
const stabilityCharacterOptions = ['SC', 'SP', 'PC', 'RP', 'BRK'];
const temperatureDepthOptions = ['surface', '0', ...Array.from({ length: 40 }, (_, index) => `${(index + 1) * 10}`)];
const temperatureIndexes = Array.from({ length: 20 }, (_, index) => index + 1);
const stabilityTestIndexes = Array.from({ length: 12 }, (_, index) => index + 1);

export default function VoiceReviewScreen() {
  const router = useRouter();
  const { session, setReviewFieldValue, replaceReviewValues } = useVoiceNoteSession();
  const { createProfileFromVoiceSession } = useSavedProfiles();
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [isApplyingCurrentLocation, setIsApplyingCurrentLocation] = useState(false);
  const [currentLocationStatus, setCurrentLocationStatus] = useState<CurrentLocationStatus | null>(null);
  const [openSectionId, setOpenSectionId] = useState<string>('');
  const [openLayerIndex, setOpenLayerIndex] = useState(0);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const sectionOffsetsRef = useRef<Record<string, number>>({});
  const values = session.reviewValues;
  const canRender = session.engineTextCurrent.trim().length > 0;
  const missingObservationCount = requiredFieldIds.filter((fieldId) => !(values[fieldId] ?? '').trim()).length;
  const layerWarningCount = countLayerWarnings(values);
  const temperatureWarningCount = countTemperatureWarnings(values);
  const stabilityWarningCount = countStabilityWarnings(values);
  const serviceWarningBuckets = bucketFormatterWarnings(session.warnings);
  const totalWarningCount =
    serviceWarningBuckets.other +
    Math.max(layerWarningCount, serviceWarningBuckets.layers) +
    Math.max(temperatureWarningCount, serviceWarningBuckets.temperatures) +
    Math.max(stabilityWarningCount, serviceWarningBuckets.stability);
  const actualLayerCount = getActualLayerCount(values);
  const actualTemperatureCount = getActualTemperatureCount(values);
  const actualTestCount = getActualStabilityCount(values);

  useEffect(() => {
    if (session.profileId) {
      setOpenSectionId('');
      setOpenLayerIndex(0);
    }
  }, [session.profileId]);

  const spotlight = useMemo(
    () => [
      { label: 'Run', value: values.run_name?.trim() || 'Run name missing' },
      { label: 'Observer', value: values.observer?.trim() || 'Observer missing' },
      { label: 'Layers', value: `${actualLayerCount}` },
      { label: 'Tests', value: `${actualTestCount}` },
    ],
    [actualLayerCount, actualTestCount, values.observer, values.run_name]
  );

  const renderProfile = () => {
    void (async () => {
      if (!canRender || isCreatingProfile) {
        return;
      }
      setIsCreatingProfile(true);
      try {
        const created = await createProfileFromVoiceSession(session);
        if (!created) {
          return;
        }
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
      } finally {
        setIsCreatingProfile(false);
      }
    })();
  };

  const toggleSection = (sectionId: string) => {
    setOpenSectionId((current) => {
      const next = current === sectionId ? '' : sectionId;
      if (next !== 'layers') {
        setOpenLayerIndex(0);
      }
      return next;
    });
    const scrollToSection = () => {
      const targetY = Math.max((sectionOffsetsRef.current[sectionId] ?? 0) - 12, 0);
      scrollViewRef.current?.scrollTo({ y: targetY, animated: true });
    };
    setTimeout(scrollToSection, 50);
    setTimeout(scrollToSection, 180);
  };

  const applyCurrentLocation = () => {
    void (async () => {
      if (isApplyingCurrentLocation) {
        return;
      }

      setIsApplyingCurrentLocation(true);
      try {
        const currentLocation = await resolveCurrentLocationValuesAsync();
        replaceReviewValues({
          ...values,
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.safeArea}>
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.panel}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <ImageBackground source={require('../assets/images/nivium-hero-snow.png')} imageStyle={styles.heroImage} style={styles.hero}>
            <View style={styles.heroOverlay} />
            <Text style={styles.heroTitle}>Nivium</Text>
            <View style={styles.heroSubtitleStack}>
              <Text style={styles.heroSubtitle}>Voice Review</Text>
              <Image source={require('../assets/images/nivium-hero-swish.png')} style={styles.heroSubtitleSwish} resizeMode="stretch" />
            </View>
          </ImageBackground>

          <View style={styles.cardShell}>
            <View style={styles.cardHighlight} />
            <View style={styles.card}>
              <View style={styles.cardAccent} />
              <Text style={styles.cardEyebrow}>Review Draft</Text>
              <Text style={styles.cardTitle}>Check the structured profile before render</Text>
              <Text style={styles.cardCopy}>
                Nivium builds the profile behind the scenes after you review your values below.
              </Text>

              <View style={styles.spotlightRow}>
                {spotlight.map((item) => (
                  <View key={item.label} style={styles.spotlightCard}>
                    <Text style={styles.spotlightLabel}>{item.label}</Text>
                    <Text style={styles.spotlightValue}>{item.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {totalWarningCount > 0 ? (
            <View style={styles.warningBannerShell}>
              <View style={styles.warningBanner}>
                <Text style={styles.warningBannerLabel}>Review Needed</Text>
                <Text style={styles.warningBannerText}>
                  {formatWarningSummary(totalWarningCount, 'item needs attention', 'items need attention')}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.readyBannerShell}>
              <View style={styles.readyBanner}>
                <Text style={styles.readyBannerLabel}>Ready To Render</Text>
                <Text style={styles.readyBannerText}>No plot-affecting warnings are active right now.</Text>
              </View>
            </View>
          )}

          <View
            onLayout={(event) => {
              sectionOffsetsRef.current.observation = event.nativeEvent.layout.y;
            }}>
            <AccordionSection
              title="Observation Details"
              description={
                missingObservationCount > 0
                  ? 'Observation details are missing. You can still render if your layers are correct.'
                  : 'General, location, weather, and snow conditions'
              }
              accent="#A94C2A"
              isOpen={openSectionId === 'observation'}
              onToggle={() => toggleSection('observation')}>
              <ObservationDetailsEditor
                values={values}
                onChange={setReviewFieldValue}
                onUseCurrentLocation={applyCurrentLocation}
                isApplyingCurrentLocation={isApplyingCurrentLocation}
                currentLocationStatus={currentLocationStatus}
              />
            </AccordionSection>
          </View>

          <View
            onLayout={(event) => {
              sectionOffsetsRef.current.layers = event.nativeEvent.layout.y;
            }}>
            <AccordionSection
              title="Snowpack Layers"
              description={
                layerWarningCount > 0
                  ? `${formatCountLabel(actualLayerCount, 'layer')} · ${formatWarningSummary(layerWarningCount, 'layer warning', 'layer warnings')}`
                  : `${formatCountLabel(actualLayerCount, 'layer')}`
              }
              accent="#3D6B5A"
              isOpen={openSectionId === 'layers'}
              onToggle={() => toggleSection('layers')}>
              <LayerEditor
                values={values}
                onChange={setReviewFieldValue}
                onReplace={replaceReviewValues}
                openLayerIndex={openLayerIndex}
                onOpenLayerIndexChange={setOpenLayerIndex}
              />
            </AccordionSection>
          </View>

          <View
            onLayout={(event) => {
              sectionOffsetsRef.current.temperatures = event.nativeEvent.layout.y;
            }}>
            <AccordionSection
              title="Temperatures"
              description={
                temperatureWarningCount > 0
                  ? `${formatCountLabel(actualTemperatureCount, 'reading')} · ${formatWarningSummary(temperatureWarningCount, 'warning', 'warnings')}`
                  : `${formatCountLabel(actualTemperatureCount, 'reading')}`
              }
              accent="#395B88"
              isOpen={openSectionId === 'temperatures'}
              onToggle={() => toggleSection('temperatures')}>
              <TemperatureReviewEditor values={values} onChange={setReviewFieldValue} onReplace={replaceReviewValues} />
            </AccordionSection>
          </View>

          <View
            onLayout={(event) => {
              sectionOffsetsRef.current.tests = event.nativeEvent.layout.y;
            }}>
            <AccordionSection
              title="Stability Tests"
              description={
                stabilityWarningCount > 0
                  ? `${formatCountLabel(actualTestCount, 'test')} · ${formatWarningSummary(stabilityWarningCount, 'warning', 'warnings')}`
                  : `${formatCountLabel(actualTestCount, 'test')}`
              }
              accent="#8D6A2B"
              isOpen={openSectionId === 'tests'}
              onToggle={() => toggleSection('tests')}>
              <StabilityReviewEditor values={values} onChange={setReviewFieldValue} onReplace={replaceReviewValues} />
            </AccordionSection>
          </View>

          <View
            onLayout={(event) => {
              sectionOffsetsRef.current.notes = event.nativeEvent.layout.y;
            }}>
            <AccordionSection
              title="Notes"
              description={(values.comments ?? '').trim() ? 'Comment saved for the final profile' : 'Optional field notes'}
              accent="#5E5A88"
              isOpen={openSectionId === 'notes'}
              onToggle={() => toggleSection('notes')}>
              <View style={styles.groupCard}>
                <Text style={styles.groupTitle}>Notes</Text>
                <TextInput
                  value={values.comments ?? ''}
                  onChangeText={(value) => setReviewFieldValue('comments', value)}
                  placeholder="Add any extra notes to preserve"
                  placeholderTextColor="#7B8E9D"
                  multiline
                  textAlignVertical="top"
                  style={[styles.fieldInput, styles.notesInput]}
                />
              </View>
            </AccordionSection>
          </View>

          <View
            onLayout={(event) => {
              sectionOffsetsRef.current.advanced = event.nativeEvent.layout.y;
            }}>
            <AccordionSection
              title="Advanced"
              description="Read-only formatter text and service warnings"
              accent="#4E6272"
              isOpen={openSectionId === 'advanced'}
              onToggle={() => toggleSection('advanced')}
              compact>
              <View style={styles.advancedBlock}>
                <Text style={styles.advancedLabel}>Formatter Warnings</Text>
                {session.warnings.length === 0 ? (
                  <Text style={styles.advancedLine}>No formatter warnings.</Text>
                ) : (
                  session.warnings.map((warning, index) => (
                    <Text key={`${index}-${warning}`} style={styles.advancedLine}>
                      - {warning}
                    </Text>
                  ))
                )}
              </View>
              <View style={styles.advancedBlock}>
                <Text style={styles.advancedLabel}>Engine Text Preview</Text>
                <Text style={styles.engineText}>{session.engineTextCurrent || 'No engine text available yet.'}</Text>
              </View>
            </AccordionSection>
          </View>

          <View style={styles.actionRow}>
            <Pressable onPress={() => router.push('/record-notes')} style={({ pressed }) => [styles.secondaryActionShell, pressed ? styles.pressed : null]}>
              <View style={styles.secondaryActionFrame}>
                <View style={styles.secondaryAction}>
                  <Text style={styles.secondaryActionText}>Back</Text>
                </View>
              </View>
            </Pressable>

            <Pressable
              onPress={renderProfile}
              style={({ pressed }) => [
                styles.primaryActionShell,
                (!canRender || isCreatingProfile) ? styles.buttonDisabled : null,
                pressed && canRender && !isCreatingProfile ? styles.pressed : null,
              ]}
              disabled={!canRender || isCreatingProfile}>
              <View style={styles.primaryActionHighlight} />
              <View style={styles.primaryActionFrame}>
                <View style={styles.primaryAction}>
                  {isCreatingProfile ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator size="small" color="#FFF8EE" />
                      <Text style={styles.primaryActionText}>Rendering...</Text>
                    </View>
                  ) : (
                    <Text style={styles.primaryActionText}>Generate Profile</Text>
                  )}
                </View>
              </View>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function TemperatureReviewEditor({
  values,
  onChange,
  onReplace,
}: {
  values: Record<string, string>;
  onChange: (fieldId: string, value: string) => void;
  onReplace: (values: Record<string, string>) => void;
}) {
  const activeCount = getVisibleTemperatureRowCount(values);
  const canAdd = activeCount < temperatureIndexes.length;
  const canRemove = activeCount > 1;

  return (
    <View style={styles.groupStack}>
      {temperatureIndexes.slice(0, activeCount).map((index) => {
        const depth = values[`temp_${index}_depth`] ?? '';
        const temperature = values[`temp_${index}_value`] ?? '';
        const warningCount = countTemperatureWarning(values, index);

        return (
          <View key={index} style={styles.groupCard}>
            <View style={styles.inlineTitleRow}>
              <Text style={styles.groupTitle}>Reading {index}</Text>
              {warningCount > 0 ? (
                <View style={[styles.miniBadge, styles.warningMiniBadge]}>
                  <Text style={[styles.miniBadgeText, styles.warningMiniBadgeText]}>
                    {warningCount} warning{warningCount === 1 ? '' : 's'}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.layerRow}>
              <View style={styles.layerCol}>
                <SelectorField
                  label="Depth"
                  value={depth}
                  placeholder="Choose"
                  options={temperatureDepthOptions}
                  onSelect={(next) => onChange(`temp_${index}_depth`, next)}
                />
              </View>
              <View style={styles.layerCol}>
                <Text style={styles.subFieldLabel}>Temperature (°C)</Text>
                <TextInput
                  value={temperature}
                  onChangeText={(next) => onChange(`temp_${index}_value`, normalizeTemperatureDraftValue(next, depth))}
                  placeholder="-5"
                  placeholderTextColor="#7B8E9D"
                  keyboardType="numeric"
                  style={styles.fieldInput}
                />
              </View>
            </View>
          </View>
        );
      })}

      <View style={styles.sectionActionRow}>
        <Pressable
          onPress={() => {
            if (!canAdd) {
              return;
            }
            onReplace({
              ...values,
              temp_count: `${activeCount + 1}`,
            });
          }}
          style={[styles.primaryTinyButton, !canAdd ? styles.buttonDisabled : null]}
          disabled={!canAdd}>
          <Text style={styles.primaryTinyButtonText}>Add Temperature</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (!canRemove) {
              return;
            }
            onReplace(buildValuesWithRemovedLastTemperature(values));
          }}
          style={[styles.secondaryTinyButton, !canRemove ? styles.buttonDisabled : null]}
          disabled={!canRemove}>
          <Text style={styles.secondaryTinyButtonText}>Remove Last Reading</Text>
        </Pressable>
      </View>
    </View>
  );
}

function StabilityReviewEditor({
  values,
  onChange,
  onReplace,
}: {
  values: Record<string, string>;
  onChange: (fieldId: string, value: string) => void;
  onReplace: (values: Record<string, string>) => void;
}) {
  const activeCount = getVisibleStabilityTestCount(values);
  const canAdd = activeCount < stabilityTestIndexes.length;
  const canRemove = activeCount > 1;
  const [openTestIndex, setOpenTestIndex] = useState(0);

  useEffect(() => {
    if (openTestIndex > activeCount) {
      setOpenTestIndex(0);
    }
  }, [activeCount, openTestIndex]);

  return (
    <View style={styles.groupStack}>
      {stabilityTestIndexes.slice(0, activeCount).map((index) => {
        const type = values[`test_${index}_type`] ?? '';
        const taps = values[`test_${index}_taps`] ?? '';
        const storedResult = values[`test_${index}_result`] ?? '';
        const result = type === 'CT' ? resolveCtResultLabel(taps, storedResult) : storedResult;
        const character = values[`test_${index}_character`] ?? '';
        const depth = values[`test_${index}_depth`] ?? '';
        const pstCut = values[`test_${index}_pst_cut`] ?? '';
        const pstColumn = values[`test_${index}_pst_column`] ?? '';
        const isOpen = openTestIndex === index;
        const warningCount = countStabilityWarning(values, index);

        return (
          <View key={index} style={styles.testCard}>
            <Pressable style={styles.testHeader} onPress={() => setOpenTestIndex((current) => (current === index ? 0 : index))}>
              <View style={styles.layerHeaderText}>
                <View style={styles.layerHeaderTopRow}>
                  <Text style={styles.layerCardTitle}>Test {index}</Text>
                  {warningCount > 0 ? (
                    <View style={[styles.miniBadge, styles.warningMiniBadge]}>
                      <Text style={[styles.miniBadgeText, styles.warningMiniBadgeText]}>
                        {warningCount} warning{warningCount === 1 ? '' : 's'}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.layerOverviewLine}>
                  {buildStabilityPreview(type, result, taps, character, depth) || 'Choose type, result, and depth'}
                </Text>
              </View>
              <Text style={styles.layerChevron}>{isOpen ? '−' : '+'}</Text>
            </Pressable>

            {isOpen ? (
              <View style={styles.layerBody}>
                <View style={styles.layerRow}>
                  <View style={styles.layerCol}>
                    <SelectorField
                      label="Test Type"
                      value={type}
                      placeholder="Choose"
                      options={stabilityTestTypeOptions}
                      onSelect={(next) => {
                        onChange(`test_${index}_type`, next);
                        if (next === 'CT') {
                          onChange(`test_${index}_result`, 'auto');
                        } else if (next === 'RB') {
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
                        onSelect={(next) => onChange(`test_${index}_result`, next)}
                      />
                    </View>
                  ) : null}
                </View>

                <View style={styles.layerRow}>
                  {type === 'CT' || type === 'ECT' ? (
                    <View style={styles.layerCol}>
                      <Text style={styles.subFieldLabel}>Taps</Text>
                      <TextInput
                        value={taps}
                        onChangeText={(next) => {
                          const cleaned = next.replace(/[^0-9]/g, '');
                          onChange(`test_${index}_taps`, cleaned);
                          if (type === 'CT') {
                            onChange(`test_${index}_result`, 'auto');
                          }
                        }}
                        placeholder="Enter taps"
                        placeholderTextColor="#7B8E9D"
                        keyboardType="numeric"
                        style={styles.fieldInput}
                      />
                    </View>
                  ) : null}
                  {type === 'CT' ? (
                    <View style={styles.layerCol}>
                      <Text style={styles.subFieldLabel}>Result</Text>
                      <Text style={styles.readOnlyField}>{result || 'Enter taps to classify'}</Text>
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
                      clearOptionLabel="None"
                      onSelect={(next) => onChange(`test_${index}_character`, next)}
                    />
                  </View>
                  <View style={styles.layerCol}>
                    <Text style={styles.subFieldLabel}>Depth (cm)</Text>
                    <TextInput
                      value={depth}
                      onChangeText={(next) => onChange(`test_${index}_depth`, next.replace(/[^0-9.]/g, ''))}
                      placeholder="Enter depth"
                      placeholderTextColor="#7B8E9D"
                      keyboardType="numeric"
                      style={styles.fieldInput}
                    />
                  </View>
                </View>

                {type === 'PST' ? (
                  <View style={styles.layerRow}>
                    <View style={styles.layerCol}>
                      <Text style={styles.subFieldLabel}>Cut Length</Text>
                      <TextInput
                        value={pstCut}
                        onChangeText={(next) => onChange(`test_${index}_pst_cut`, next.replace(/[^0-9]/g, ''))}
                        placeholder="e.g. 30"
                        placeholderTextColor="#7B8E9D"
                        keyboardType="numeric"
                        style={styles.fieldInput}
                      />
                    </View>
                    <View style={styles.layerCol}>
                      <Text style={styles.subFieldLabel}>Column Length</Text>
                      <TextInput
                        value={pstColumn}
                        onChangeText={(next) => onChange(`test_${index}_pst_column`, next.replace(/[^0-9]/g, ''))}
                        placeholder="e.g. 100"
                        placeholderTextColor="#7B8E9D"
                        keyboardType="numeric"
                        style={styles.fieldInput}
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}

      <View style={styles.sectionActionRow}>
        <Pressable
          onPress={() => {
            if (!canAdd) {
              return;
            }
            onReplace({
              ...values,
              test_count: `${activeCount + 1}`,
            });
            setOpenTestIndex(activeCount + 1);
          }}
          style={[styles.primaryTinyButton, !canAdd ? styles.buttonDisabled : null]}
          disabled={!canAdd}>
          <Text style={styles.primaryTinyButtonText}>Add Test</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (!canRemove) {
              return;
            }
            onReplace(buildValuesWithRemovedLastTest(values));
            setOpenTestIndex(Math.max(activeCount - 1, 1));
          }}
          style={[styles.secondaryTinyButton, !canRemove ? styles.buttonDisabled : null]}
          disabled={!canRemove}>
          <Text style={styles.secondaryTinyButtonText}>Remove Last Test</Text>
        </Pressable>
      </View>
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
                key={`${label}-${optionValue}`}
                onPress={() => {
                  onSelect(isClearOption ? '' : optionValue);
                  setIsOpen(false);
                }}
                style={[
                  styles.selectorOption,
                  index === 0 ? styles.selectorOptionFirst : null,
                  selected ? styles.selectorOptionSelected : null,
                ]}>
                <Text style={[styles.selectorOptionText, selected ? styles.selectorOptionTextSelected : null]}>
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

function countTemperatureWarnings(values: Record<string, string>) {
  let total = 0;
  for (const index of temperatureIndexes.slice(0, getVisibleTemperatureRowCount(values))) {
    total += countTemperatureWarning(values, index);
  }
  total += countTemperatureTrendWarnings(values);
  return total;
}

function countTemperatureWarning(values: Record<string, string>, index: number) {
  const depth = (values[`temp_${index}_depth`] ?? '').trim();
  const temperature = (values[`temp_${index}_value`] ?? '').trim();
  return depth && temperature ? 0 : depth || temperature ? 1 : 0;
}

function countTemperatureTrendWarnings(values: Record<string, string>) {
  let warnings = 0;
  let previousDepth: number | null = null;

  for (const index of temperatureIndexes.slice(0, getVisibleTemperatureRowCount(values))) {
    const depthValue = (values[`temp_${index}_depth`] ?? '').trim();
    const temperatureValue = (values[`temp_${index}_value`] ?? '').trim();
    if (!depthValue || !temperatureValue) {
      continue;
    }

    const depth = depthValue === 'surface' ? -1 : Number(depthValue);
    const temperature = Number(temperatureValue);
    if (!Number.isFinite(depth) || !Number.isFinite(temperature)) {
      continue;
    }

    if (previousDepth !== null && depth <= previousDepth) {
      warnings += 1;
    }

    previousDepth = depth;
  }

  return warnings;
}

function countStabilityWarnings(values: Record<string, string>) {
  let total = 0;
  for (const index of stabilityTestIndexes.slice(0, getVisibleStabilityTestCount(values))) {
    total += countStabilityWarning(values, index);
  }
  return total;
}

function bucketFormatterWarnings(warnings: string[]) {
  const buckets = {
    layers: 0,
    temperatures: 0,
    stability: 0,
    other: 0,
  };

  warnings.forEach((warning) => {
    const text = warning.toLowerCase();
    if (/\b(stability test|compression test|shear test|rutschblock|ect|pst|ct\d|ss\b|hs\b|rb\d)\b/.test(text)) {
      buckets.stability += 1;
      return;
    }
    if (/\b(temp|temperature|surface temp)\b/.test(text)) {
      buckets.temperatures += 1;
      return;
    }
    if (/\b(layer|grain|hardness|depth|concern|size)\b/.test(text)) {
      buckets.layers += 1;
      return;
    }
    buckets.other += 1;
  });

  return buckets;
}

function countStabilityWarning(values: Record<string, string>, index: number) {
  const type = (values[`test_${index}_type`] ?? '').trim();
  const result = (values[`test_${index}_result`] ?? '').trim();
  const depth = (values[`test_${index}_depth`] ?? '').trim();
  const pstCut = (values[`test_${index}_pst_cut`] ?? '').trim();
  const pstColumn = (values[`test_${index}_pst_column`] ?? '').trim();

  if (!type && !result && !depth && !pstCut && !pstColumn) {
    return 0;
  }

  let count = 0;
  if (!type) count += 1;
  if (!result && type !== 'CT') count += 1;
  if (!depth) count += 1;
  if (type === 'PST' && (!pstCut || !pstColumn)) count += 1;
  return count;
}

function getActualTemperatureCount(values: Record<string, string>) {
  let count = 0;
  for (const index of temperatureIndexes.slice(0, getVisibleTemperatureRowCount(values))) {
    if ((values[`temp_${index}_depth`] ?? '').trim() && (values[`temp_${index}_value`] ?? '').trim()) {
      count += 1;
    }
  }
  return count;
}

function getActualStabilityCount(values: Record<string, string>) {
  let count = 0;
  for (const index of stabilityTestIndexes.slice(0, getVisibleStabilityTestCount(values))) {
    if ((values[`test_${index}_type`] ?? '').trim()) {
      count += 1;
    }
  }
  return count;
}

function getVisibleTemperatureRowCount(values: Record<string, string>) {
  const explicitCount = Number(values.temp_count ?? '');
  if (Number.isFinite(explicitCount) && explicitCount > 0) {
    return Math.min(Math.max(Math.trunc(explicitCount), 1), temperatureIndexes.length);
  }
  let highestIndex = 0;
  for (const index of temperatureIndexes) {
    if ((values[`temp_${index}_depth`] ?? '').trim() || (values[`temp_${index}_value`] ?? '').trim()) {
      highestIndex = index;
    }
  }
  return Math.max(highestIndex, 1);
}

function getVisibleStabilityTestCount(values: Record<string, string>) {
  const explicitCount = Number(values.test_count ?? '');
  if (Number.isFinite(explicitCount) && explicitCount > 0) {
    return Math.min(Math.max(Math.trunc(explicitCount), 1), stabilityTestIndexes.length);
  }
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
  return Math.max(highestIndex, 1);
}

function buildValuesWithRemovedLastTemperature(values: Record<string, string>) {
  const activeCount = getVisibleTemperatureRowCount(values);
  if (activeCount <= 1) {
    return values;
  }
  const next = { ...values };
  next[`temp_${activeCount}_depth`] = '';
  next[`temp_${activeCount}_value`] = '';
  next.temp_count = `${Math.max(activeCount - 1, 1)}`;
  return next;
}

function buildValuesWithRemovedLastTest(values: Record<string, string>) {
  const activeCount = getVisibleStabilityTestCount(values);
  if (activeCount <= 1) {
    return values;
  }
  const next = { ...values };
  [
    `test_${activeCount}_type`,
    `test_${activeCount}_result`,
    `test_${activeCount}_taps`,
    `test_${activeCount}_character`,
    `test_${activeCount}_depth`,
    `test_${activeCount}_pst_cut`,
    `test_${activeCount}_pst_column`,
  ].forEach((fieldId) => {
    next[fieldId] = '';
  });
  next.test_count = `${Math.max(activeCount - 1, 1)}`;
  return next;
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

function formatWarningSummary(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatCountLabel(count: number, singular: string) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#20384D',
  },
  panel: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 40,
    gap: 18,
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
    ...StyleSheet.absoluteFillObject,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  card: {
    borderRadius: 7,
    backgroundColor: '#BECEDA',
    padding: 18,
    gap: 12,
  },
  cardAccent: {
    width: 56,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#A94C2A',
  },
  cardEyebrow: {
    color: '#4E6272',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  cardTitle: {
    color: '#20384D',
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
  },
  cardCopy: {
    color: '#385061',
    fontSize: 15,
    lineHeight: 22,
  },
  spotlightRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  spotlightCard: {
    flexGrow: 1,
    minWidth: '46%',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#E8EFF3',
  },
  spotlightLabel: {
    color: '#4E6272',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  spotlightValue: {
    marginTop: 4,
    color: '#20384D',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  warningBannerShell: {
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#06080B',
  },
  warningBanner: {
    borderRadius: 7,
    backgroundColor: '#F5D6CA',
    padding: 16,
    gap: 6,
  },
  warningBannerLabel: {
    color: '#7A2E12',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  warningBannerText: {
    color: '#5B2A17',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  },
  readyBannerShell: {
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#06080B',
  },
  readyBanner: {
    borderRadius: 7,
    backgroundColor: '#D8E8DF',
    padding: 16,
    gap: 6,
  },
  readyBannerLabel: {
    color: '#1F5B3C',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  readyBannerText: {
    color: '#24473A',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  },
  groupStack: {
    gap: 14,
  },
  groupCard: {
    borderRadius: 8,
    padding: 14,
    backgroundColor: '#E8EFF3',
    gap: 12,
  },
  groupTitle: {
    color: '#20384D',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '800',
  },
  fieldGrid: {
    gap: 12,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dateBlock: {
    flex: 1,
  },
  windField: {
    gap: 10,
  },
  field: {
    gap: 6,
  },
  optionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#8FA5B6',
    backgroundColor: '#F6FAFC',
  },
  optionChipSelected: {
    borderColor: '#395B88',
    backgroundColor: '#D9E7F2',
  },
  optionChipText: {
    color: '#355062',
    fontSize: 13,
    fontWeight: '800',
  },
  optionChipTextSelected: {
    color: '#173248',
  },
  fieldInput: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#8FA5B6',
    backgroundColor: '#F6FAFC',
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: '#173248',
    fontSize: 16,
    lineHeight: 20,
  },
  subFieldLabel: {
    color: '#355062',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  notesInput: {
    minHeight: 120,
  },
  selectorField: {
    gap: 6,
  },
  selectorTrigger: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#8FA5B6',
    backgroundColor: '#F6FAFC',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  selectorTriggerSelected: {
    borderColor: '#395B88',
  },
  selectorTriggerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  selectorValue: {
    flex: 1,
    color: '#173248',
    fontSize: 16,
    lineHeight: 20,
  },
  selectorPlaceholder: {
    color: '#7B8E9D',
  },
  selectorChevron: {
    color: '#355062',
    fontSize: 13,
    fontWeight: '800',
  },
  selectorOptions: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#8FA5B6',
    backgroundColor: '#F6FAFC',
  },
  selectorOption: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: '#D2DDE6',
  },
  selectorOptionFirst: {
    borderTopWidth: 0,
  },
  selectorOptionSelected: {
    backgroundColor: '#D8E6EF',
  },
  selectorOptionText: {
    color: '#173248',
    fontSize: 15,
    lineHeight: 19,
  },
  selectorOptionTextSelected: {
    fontWeight: '700',
  },
  layerList: {
    gap: 12,
  },
  layerCard: {
    borderRadius: 8,
    backgroundColor: '#E8EFF3',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#C7D4DE',
    borderLeftWidth: 5,
    borderLeftColor: 'transparent',
  },
  layerCardConcern: {
    borderLeftColor: '#A12E25',
  },
  layerCardWarn: {
    borderColor: '#C78F2A',
  },
  layerCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
  },
  layerHeaderText: {
    flex: 1,
    gap: 3,
  },
  layerHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  layerBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
  },
  layerCardTitle: {
    color: '#20384D',
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '800',
  },
  layerOverviewLine: {
    color: '#355062',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  layerChevron: {
    color: '#20384D',
    fontSize: 24,
    lineHeight: 24,
    fontWeight: '500',
  },
  miniBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#D8E6EF',
  },
  miniBadgeText: {
    color: '#234255',
    fontSize: 11,
    fontWeight: '800',
  },
  concernBadge: {
    backgroundColor: '#C62821',
  },
  concernBadgeText: {
    color: '#FFF7F6',
  },
  commentBadge: {
    backgroundColor: '#D9E3F4',
  },
  warningMiniBadge: {
    backgroundColor: '#F1E0B9',
  },
  warningMiniBadgeText: {
    color: '#734C02',
  },
  layerBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 12,
  },
  inlineActionButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#395B88',
  },
  inlineActionText: {
    color: '#FFF8EE',
    fontSize: 13,
    fontWeight: '800',
  },
  layerRow: {
    flexDirection: 'row',
    gap: 12,
  },
  layerCol: {
    flex: 1,
    gap: 6,
  },
  readOnlyField: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#8FA5B6',
    backgroundColor: '#DDE7EE',
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: '#385061',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  depthHint: {
    color: '#6A5540',
    fontSize: 12,
    lineHeight: 16,
  },
  commentInput: {
    minHeight: 84,
  },
  toggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  toggleChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#8FA5B6',
    backgroundColor: '#F6FAFC',
  },
  toggleChipSelected: {
    borderColor: '#395B88',
    backgroundColor: '#D9E7F2',
  },
  toggleChipText: {
    color: '#355062',
    fontSize: 13,
    fontWeight: '800',
  },
  toggleChipTextSelected: {
    color: '#173248',
  },
  toggleChipDanger: {
    borderColor: '#B34A42',
    backgroundColor: '#FFF3F2',
  },
  toggleChipSelectedDanger: {
    borderColor: '#8F1D17',
    backgroundColor: '#C62821',
  },
  toggleChipDangerTextIdle: {
    color: '#8A2B24',
  },
  toggleChipDangerText: {
    color: '#FFF7F6',
  },
  sectionActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  insertLayerPanel: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C7D4DE',
    backgroundColor: '#E8EFF3',
    padding: 14,
    gap: 12,
  },
  insertLayerTitle: {
    color: '#173248',
    fontSize: 16,
    fontWeight: '800',
  },
  insertLayerHint: {
    color: '#456175',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  insertLayerError: {
    color: '#8F1D17',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  primaryTinyButton: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#395B88',
  },
  primaryTinyButtonText: {
    color: '#FFF8EE',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryTinyButton: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#DCE6ED',
  },
  secondaryTinyButtonText: {
    color: '#20384D',
    fontSize: 13,
    fontWeight: '800',
  },
  deleteTinyButton: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#C97C72',
    backgroundColor: '#FFF8F6',
  },
  deleteTinyButtonText: {
    color: '#9B332A',
    fontSize: 13,
    fontWeight: '800',
  },
  inlineTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  testCard: {
    borderRadius: 8,
    backgroundColor: '#E8EFF3',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#C7D4DE',
  },
  testHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
  },
  advancedBlock: {
    gap: 8,
  },
  advancedLabel: {
    color: '#20384D',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  advancedLine: {
    color: '#355062',
    fontSize: 14,
    lineHeight: 20,
  },
  engineText: {
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#F6FAFC',
    color: '#173248',
    fontSize: 13,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'stretch',
    marginTop: 4,
  },
  primaryActionShell: {
    flex: 1.4,
    borderRadius: 8,
    backgroundColor: '#06080B',
    padding: 3,
  },
  primaryActionHighlight: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  primaryActionFrame: {
    borderRadius: 7,
    backgroundColor: '#40658E',
    padding: 2,
  },
  primaryAction: {
    borderRadius: 6,
    backgroundColor: '#55799F',
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 58,
  },
  primaryActionText: {
    color: '#FFF8EE',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryActionShell: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: '#06080B',
    padding: 3,
  },
  secondaryActionFrame: {
    borderRadius: 7,
    backgroundColor: '#AFC0CF',
    padding: 2,
  },
  secondaryAction: {
    borderRadius: 6,
    backgroundColor: '#BECEDA',
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 58,
  },
  secondaryActionText: {
    color: '#20384D',
    fontSize: 16,
    fontWeight: '800',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  buttonDisabled: {
    opacity: 0.48,
  },
  pressed: {
    opacity: 0.84,
  },
});
