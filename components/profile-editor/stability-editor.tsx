import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { FieldValueMap } from './editor-types';
import { SelectorField } from './selector-field';
import {
  buildStabilityPreview,
  buildValuesWithRemovedLastTest,
  countStabilityWarning,
  ectResultOptions,
  getVisibleStabilityTestCount,
  pstResultOptions,
  rbScoreOptions,
  resolveCtResultLabel,
  stabilityCharacterOptions,
  stabilityResultOptions,
  stabilityTestIndexes,
  stabilityTestTypeOptions,
} from './stability-utils';

export function StabilityEditor({
  values,
  onChange,
  onReplace,
}: {
  values: FieldValueMap;
  onChange: (fieldId: string, value: string) => void;
  onReplace: (values: FieldValueMap) => void;
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
              <View style={styles.headerText}>
                <View style={styles.headerTopRow}>
                  <Text style={styles.cardTitle}>Test {index}</Text>
                  {warningCount > 0 ? (
                    <View style={[styles.miniBadge, styles.warningMiniBadge]}>
                      <Text style={[styles.miniBadgeText, styles.warningMiniBadgeText]}>
                        {warningCount} warning{warningCount === 1 ? '' : 's'}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.overviewLine}>
                  {buildStabilityPreview(type, result, taps, character, depth) || 'Choose type, result, and depth'}
                </Text>
              </View>
              <Text style={styles.chevron}>{isOpen ? '−' : '+'}</Text>
            </Pressable>

            {isOpen ? (
              <View style={styles.body}>
                <View style={styles.row}>
                  <View style={styles.col}>
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
                    <View style={styles.col}>
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

                <View style={styles.row}>
                  {type === 'CT' || type === 'ECT' ? (
                    <View style={styles.col}>
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
                    <View style={styles.col}>
                      <Text style={styles.subFieldLabel}>Result</Text>
                      <Text style={styles.readOnlyField}>{result || 'Enter taps to classify'}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.row}>
                  <View style={styles.col}>
                    <SelectorField
                      label="Fracture Character"
                      value={character}
                      placeholder="Optional"
                      options={stabilityCharacterOptions}
                      clearOptionLabel="None"
                      onSelect={(next) => onChange(`test_${index}_character`, next)}
                    />
                  </View>
                  <View style={styles.col}>
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
                  <View style={styles.row}>
                    <View style={styles.col}>
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
                    <View style={styles.col}>
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

const styles = StyleSheet.create({
  groupStack: {
    gap: 14,
  },
  testCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C9D7E0',
    backgroundColor: '#E8EFF3',
    overflow: 'hidden',
  },
  testHeader: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: 'flex-start',
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardTitle: {
    color: '#20384D',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '800',
  },
  overviewLine: {
    color: '#355062',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
  },
  chevron: {
    color: '#355062',
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '700',
    marginTop: 2,
  },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 14,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  col: {
    flex: 1,
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
  warningMiniBadge: {
    backgroundColor: '#F6E2B8',
  },
  warningMiniBadgeText: {
    color: '#7D5312',
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
  buttonDisabled: {
    opacity: 0.45,
  },
});
