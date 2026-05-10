import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { FieldValueMap } from './editor-types';
import { SelectorField } from './selector-field';
import {
  buildLayerOverview,
  buildValuesWithAddedLayer,
  buildValuesWithInsertedLayerRange,
  buildValuesWithRemovedLayerAtIndex,
  countLayerWarning,
  enforceMinimumBottomDepth,
  getMinimumBottomDepth,
  getVisibleLayerCardCount,
  grainOptions,
  hardnessOptions,
  layerIndexes,
  normalizeBottomDepthDraftValue,
  sizeOptions,
} from './layer-utils';

export function LayerEditor({
  values,
  onChange,
  onReplace,
  openLayerIndex,
  onOpenLayerIndexChange,
  onEditorLayout,
  onLayerLayout,
  onFocusLayer,
  showInsertLayerAction = true,
}: {
  values: FieldValueMap;
  onChange: (fieldId: string, value: string) => void;
  onReplace: (values: FieldValueMap) => void;
  openLayerIndex: number;
  onOpenLayerIndexChange: (index: number) => void;
  onEditorLayout?: (offsetY: number) => void;
  onLayerLayout?: (index: number, offsetY: number) => void;
  onFocusLayer?: (index: number) => void;
  showInsertLayerAction?: boolean;
}) {
  const resolvedActiveCount = getVisibleLayerCardCount(values);
  const activeCount = Math.max(resolvedActiveCount, openLayerIndex || 0);
  const canAddLayer = activeCount < layerIndexes.length;
  const canRemoveLayer = activeCount > 1;
  const [showInsertPanel, setShowInsertPanel] = useState(false);
  const [insertTop, setInsertTop] = useState('');
  const [insertBottom, setInsertBottom] = useState('');
  const [insertError, setInsertError] = useState('');

  useEffect(() => {
    if (openLayerIndex > activeCount) {
      onOpenLayerIndexChange(Math.max(activeCount, 1));
    }
  }, [activeCount, onOpenLayerIndexChange, openLayerIndex]);

  useEffect(() => {
    if (!showInsertLayerAction && showInsertPanel) {
      setShowInsertPanel(false);
      setInsertTop('');
      setInsertBottom('');
      setInsertError('');
    }
  }, [showInsertLayerAction, showInsertPanel]);

  return (
    <View
      style={styles.layerList}
      onLayout={(event) => {
        onEditorLayout?.(event.nativeEvent.layout.y);
      }}>
      {layerIndexes.slice(0, activeCount).map((index) => {
        const isOpen = openLayerIndex === index;
        const overview = buildLayerOverview(values, index);
        const warningCount = countLayerWarning(values, index);
        const hasComment = Boolean((values[`layer_${index}_comment`] ?? '').trim());
        const isConcern = (values[`layer_${index}_concern`] ?? 'no') === 'yes';
        const topValue = index === 1 ? values[`layer_${index}_top`] ?? '0' : values[`layer_${index - 1}_bottom`] ?? '';
        const bottomValue = values[`layer_${index}_bottom`] ?? '';

        return (
          <View
            key={index}
            style={[
              styles.layerCard,
              isConcern ? styles.layerCardConcern : null,
              warningCount > 0 ? styles.layerCardWarn : null,
            ]}
            onLayout={(event) => {
              onLayerLayout?.(index, event.nativeEvent.layout.y);
            }}>
            <Pressable
              style={styles.layerCardHeader}
              onPress={() => onOpenLayerIndexChange(openLayerIndex === index ? 0 : index)}>
              <View style={styles.layerHeaderText}>
                <View style={styles.layerHeaderTopRow}>
                  <Text style={styles.layerCardTitle}>Layer {index}</Text>
                  <View style={styles.layerBadgeRow}>
                    {isConcern ? (
                      <View style={[styles.miniBadge, styles.concernBadge]}>
                        <Text style={[styles.miniBadgeText, styles.concernBadgeText]}>Concern</Text>
                      </View>
                    ) : null}
                    {hasComment ? (
                      <View style={[styles.miniBadge, styles.commentBadge]}>
                        <Text style={styles.miniBadgeText}>Comment</Text>
                      </View>
                    ) : null}
                    {warningCount > 0 ? (
                      <View style={[styles.miniBadge, styles.warningMiniBadge]}>
                        <Text style={[styles.miniBadgeText, styles.warningMiniBadgeText]}>
                          {warningCount} warning{warningCount === 1 ? '' : 's'}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Text style={styles.layerOverviewLine}>{overview.depth}</Text>
                <Text style={styles.layerOverviewLine}>{overview.hardness}</Text>
                <Text style={styles.layerOverviewLine}>{overview.primary}</Text>
                {overview.secondary ? <Text style={styles.layerOverviewLine}>{overview.secondary}</Text> : null}
              </View>
              <Text style={styles.layerChevron}>{isOpen ? '−' : '+'}</Text>
            </Pressable>

            {isOpen ? (
              <View style={styles.layerBody}>
                <View style={styles.layerRow}>
                  <View style={styles.layerCol}>
                    <Text style={styles.subFieldLabel}>Top Depth (cm)</Text>
                    {index === 1 ? (
                      <TextInput
                        value={values[`layer_${index}_top`] ?? '0'}
                        onChangeText={(next) => onChange(`layer_${index}_top`, next.replace(/[^0-9.]/g, ''))}
                        placeholder="0"
                        placeholderTextColor="#7B8E9D"
                        keyboardType="numeric"
                        style={styles.fieldInput}
                      />
                    ) : (
                      <Text style={styles.readOnlyField}>{topValue || 'Carry from layer above'}</Text>
                    )}
                  </View>
                  <View style={styles.layerCol}>
                    <Text style={styles.subFieldLabel}>Bottom Depth (cm)</Text>
                    <TextInput
                      value={bottomValue}
                      onChangeText={(next) => onChange(`layer_${index}_bottom`, normalizeBottomDepthDraftValue(next))}
                      onEndEditing={() => onChange(`layer_${index}_bottom`, enforceMinimumBottomDepth(bottomValue, topValue))}
                      placeholder="Bottom"
                      placeholderTextColor="#7B8E9D"
                      keyboardType="numeric"
                      style={styles.fieldInput}
                    />
                    {getMinimumBottomDepth(topValue) ? (
                      <Text style={styles.depthHint}>Must be {getMinimumBottomDepth(topValue)} cm or deeper</Text>
                    ) : null}
                  </View>
                </View>

                <View style={styles.layerRow}>
                  <View style={styles.layerCol}>
                    <SelectorField
                      label="Hardness"
                      value={values[`layer_${index}_hardness_1`] ?? ''}
                      placeholder="Choose hardness"
                      options={hardnessOptions}
                      clearOptionLabel="None"
                      onSelect={(next) => onChange(`layer_${index}_hardness_1`, next)}
                    />
                  </View>
                  <View style={styles.layerCol}>
                    <SelectorField
                      label="Hardness 2"
                      value={values[`layer_${index}_hardness_2`] ?? ''}
                      placeholder="Optional"
                      options={hardnessOptions}
                      clearOptionLabel="None"
                      onSelect={(next) => onChange(`layer_${index}_hardness_2`, next)}
                    />
                  </View>
                </View>

                <View style={styles.layerRow}>
                  <View style={styles.layerCol}>
                    <SelectorField
                      label="Grain Form 1"
                      value={values[`layer_${index}_grain_1`] ?? ''}
                      placeholder="Choose grain"
                      options={grainOptions}
                      clearOptionLabel="None"
                      onSelect={(next) => onChange(`layer_${index}_grain_1`, next)}
                    />
                  </View>
                  <View style={styles.layerCol}>
                    <SelectorField
                      label="Size 1"
                      value={values[`layer_${index}_size_1`] ?? ''}
                      placeholder="Optional"
                      options={sizeOptions}
                      clearOptionLabel="None"
                      onSelect={(next) => onChange(`layer_${index}_size_1`, next)}
                    />
                  </View>
                </View>

                <View style={styles.layerRow}>
                  <View style={styles.layerCol}>
                    <SelectorField
                      label="Grain Form 2"
                      value={values[`layer_${index}_grain_2`] ?? ''}
                      placeholder="Optional"
                      options={grainOptions}
                      clearOptionLabel="None"
                      onSelect={(next) => onChange(`layer_${index}_grain_2`, next)}
                    />
                  </View>
                  <View style={styles.layerCol}>
                    <SelectorField
                      label="Size 2"
                      value={values[`layer_${index}_size_2`] ?? ''}
                      placeholder="Optional"
                      options={sizeOptions}
                      clearOptionLabel="None"
                      onSelect={(next) => onChange(`layer_${index}_size_2`, next)}
                    />
                  </View>
                </View>

                <View style={styles.field}>
                  <Text style={styles.subFieldLabel}>Layer Comment</Text>
                  <TextInput
                    value={values[`layer_${index}_comment`] ?? ''}
                    onChangeText={(next) => onChange(`layer_${index}_comment`, next)}
                    placeholder="Optional layer comment"
                    placeholderTextColor="#7B8E9D"
                    multiline
                    textAlignVertical="top"
                    style={[styles.fieldInput, styles.commentInput]}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.subFieldLabel}>Layer of Concern</Text>
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

                <View style={styles.sectionActionRow}>
                  <Pressable
                    onPress={() => {
                      if (!canRemoveLayer) {
                        return;
                      }
                      const nextValues = buildValuesWithRemovedLayerAtIndex(values, index);
                      const nextOpenIndex = Math.min(index, activeCount - 1);
                      onReplace(nextValues);
                      onOpenLayerIndexChange(nextOpenIndex);
                      onFocusLayer?.(nextOpenIndex);
                    }}
                    style={[styles.deleteTinyButton, !canRemoveLayer ? styles.buttonDisabled : null]}
                    disabled={!canRemoveLayer}>
                    <Text style={styles.deleteTinyButtonText}>Delete Layer</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        );
      })}

      <View style={styles.sectionActionRow}>
        {showInsertLayerAction ? (
          <Pressable
            onPress={() => {
              if (!canAddLayer) {
                return;
              }
              setShowInsertPanel((current) => !current);
              setInsertError('');
            }}
            style={[styles.primaryTinyButton, !canAddLayer ? styles.buttonDisabled : null]}
            disabled={!canAddLayer}>
            <Text style={styles.primaryTinyButtonText}>Insert Layer</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => {
            if (!canAddLayer) {
              return;
            }
            const nextOpenIndex = Math.min(activeCount + 1, layerIndexes.length);
            onReplace(buildValuesWithAddedLayer(values));
            setShowInsertPanel(false);
            setInsertTop('');
            setInsertBottom('');
            setInsertError('');
            onOpenLayerIndexChange(nextOpenIndex);
            onFocusLayer?.(nextOpenIndex);
          }}
          style={[styles.primaryTinyButton, !canAddLayer ? styles.buttonDisabled : null]}
          disabled={!canAddLayer}>
          <Text style={styles.primaryTinyButtonText}>Add Layer</Text>
        </Pressable>
      </View>

      {showInsertLayerAction && showInsertPanel ? (
        <View style={styles.insertLayerPanel}>
          <Text style={styles.insertLayerTitle}>Insert Missing Layer</Text>
          <Text style={styles.insertLayerHint}>
            Enter the missing layer depths. Nivium will place it in the pack and open it for details.
          </Text>
          <View style={styles.layerRow}>
            <View style={styles.layerCol}>
              <Text style={styles.subFieldLabel}>Top Depth (cm)</Text>
              <TextInput
                value={insertTop}
                onChangeText={(next) => {
                  setInsertTop(next.replace(/[^0-9.]/g, ''));
                  if (insertError) {
                    setInsertError('');
                  }
                }}
                placeholder="Top"
                placeholderTextColor="#7B8E9D"
                keyboardType="numeric"
                style={styles.fieldInput}
              />
            </View>
            <View style={styles.layerCol}>
              <Text style={styles.subFieldLabel}>Bottom Depth (cm)</Text>
              <TextInput
                value={insertBottom}
                onChangeText={(next) => {
                  setInsertBottom(next.replace(/[^0-9.]/g, ''));
                  if (insertError) {
                    setInsertError('');
                  }
                }}
                placeholder="Bottom"
                placeholderTextColor="#7B8E9D"
                keyboardType="numeric"
                style={styles.fieldInput}
              />
            </View>
          </View>
          {insertError ? <Text style={styles.insertLayerError}>{insertError}</Text> : null}
          <View style={styles.sectionActionRow}>
            <Pressable
              onPress={() => {
                const result = buildValuesWithInsertedLayerRange(values, insertTop, insertBottom);
                if ('error' in result) {
                  setInsertError(result.error);
                  return;
                }
                onReplace(result.nextValues);
                onOpenLayerIndexChange(result.insertedIndex);
                onFocusLayer?.(result.insertedIndex);
                setShowInsertPanel(false);
                setInsertTop('');
                setInsertBottom('');
                setInsertError('');
              }}
              style={styles.primaryTinyButton}>
              <Text style={styles.primaryTinyButtonText}>Place Layer</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setShowInsertPanel(false);
                setInsertTop('');
                setInsertBottom('');
                setInsertError('');
              }}
              style={styles.secondaryTinyButton}>
              <Text style={styles.secondaryTinyButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  layerList: {
    gap: 14,
  },
  layerCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C9D7E0',
    backgroundColor: '#E8EFF3',
    overflow: 'hidden',
  },
  layerCardConcern: {
    borderColor: '#C66A55',
    backgroundColor: '#F7E7E2',
  },
  layerCardWarn: {
    borderColor: '#D4A14A',
  },
  layerCardHeader: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: 'flex-start',
  },
  layerHeaderText: {
    flex: 1,
    gap: 4,
  },
  layerHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  layerCardTitle: {
    color: '#20384D',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '800',
  },
  layerBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
  },
  miniBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#D9E7F2',
  },
  miniBadgeText: {
    color: '#173248',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  concernBadge: {
    backgroundColor: '#F1C9BF',
  },
  concernBadgeText: {
    color: '#822E17',
  },
  commentBadge: {
    backgroundColor: '#D5E3EC',
  },
  warningMiniBadge: {
    backgroundColor: '#F6E2B8',
  },
  warningMiniBadgeText: {
    color: '#7D5312',
  },
  layerOverviewLine: {
    color: '#355062',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
  },
  layerChevron: {
    color: '#355062',
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '700',
    marginTop: 2,
  },
  layerBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 14,
  },
  layerRow: {
    flexDirection: 'row',
    gap: 12,
  },
  layerCol: {
    flex: 1,
    gap: 6,
  },
  field: {
    gap: 6,
  },
  subFieldLabel: {
    color: '#355062',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
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
  readOnlyField: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C2CFD8',
    backgroundColor: '#DFE8EE',
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: '#355062',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
  },
  depthHint: {
    color: '#5C7386',
    fontSize: 12,
    lineHeight: 16,
  },
  commentInput: {
    minHeight: 96,
    paddingTop: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  toggleChip: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#8FA5B6',
    backgroundColor: '#F6FAFC',
    paddingHorizontal: 14,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleChipSelected: {
    borderColor: '#395B88',
    backgroundColor: '#D9E7F2',
  },
  toggleChipText: {
    color: '#355062',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '800',
  },
  toggleChipTextSelected: {
    color: '#173248',
  },
  toggleChipDanger: {
    borderColor: '#C66A55',
  },
  toggleChipSelectedDanger: {
    backgroundColor: '#F1C9BF',
    borderColor: '#B44A31',
  },
  toggleChipDangerTextIdle: {
    color: '#8A3A24',
  },
  toggleChipDangerText: {
    color: '#822E17',
  },
  sectionActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  primaryTinyButton: {
    borderRadius: 999,
    backgroundColor: '#20384D',
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  primaryTinyButtonText: {
    color: '#FFF8EE',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  secondaryTinyButton: {
    borderRadius: 999,
    backgroundColor: '#D6E1E8',
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  secondaryTinyButtonText: {
    color: '#355062',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  deleteTinyButton: {
    borderRadius: 999,
    backgroundColor: '#F1C9BF',
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  deleteTinyButtonText: {
    color: '#822E17',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  insertLayerPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C9D7E0',
    backgroundColor: '#EEF4F7',
    padding: 14,
    gap: 12,
  },
  insertLayerTitle: {
    color: '#20384D',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
  },
  insertLayerHint: {
    color: '#355062',
    fontSize: 14,
    lineHeight: 19,
  },
  insertLayerError: {
    color: '#9B3F28',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
});
