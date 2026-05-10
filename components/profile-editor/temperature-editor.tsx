import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { FieldValueMap } from './editor-types';
import { SelectorField } from './selector-field';
import {
  buildValuesWithRemovedLastTemperature,
  countTemperatureWarning,
  getVisibleTemperatureRowCount,
  normalizeTemperatureDraftValue,
  temperatureDepthOptions,
  temperatureIndexes,
} from './temperature-utils';

export function TemperatureEditor({
  values,
  onChange,
  onReplace,
}: {
  values: FieldValueMap;
  onChange: (fieldId: string, value: string) => void;
  onReplace: (values: FieldValueMap) => void;
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
            <View style={styles.row}>
              <View style={styles.col}>
                <SelectorField
                  label="Depth"
                  value={depth}
                  placeholder="Choose"
                  options={temperatureDepthOptions}
                  onSelect={(next) => onChange(`temp_${index}_depth`, next)}
                />
              </View>
              <View style={styles.col}>
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

const styles = StyleSheet.create({
  groupStack: {
    gap: 14,
  },
  groupCard: {
    borderRadius: 8,
    padding: 14,
    backgroundColor: '#E8EFF3',
    gap: 12,
  },
  inlineTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  groupTitle: {
    color: '#20384D',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '800',
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
