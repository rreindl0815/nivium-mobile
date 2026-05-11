import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { SelectorOption } from './editor-types';

export function SelectorField({
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
  options: readonly SelectorOption[];
  clearOptionLabel?: string;
  onSelect: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const renderedOptions: SelectorOption[] = clearOptionLabel ? [clearOptionLabel, ...options] : [...options];
  const selectedOption = renderedOptions.find((option) => {
    const optionValue = typeof option === 'string' ? option : option.value;
    const isClearOption = clearOptionLabel && optionValue === clearOptionLabel;
    return isClearOption ? !value : value === optionValue;
  });
  const selectedLabel =
    !value && clearOptionLabel
      ? ''
      : selectedOption
        ? typeof selectedOption === 'string'
          ? selectedOption
          : selectedOption.label
        : value;

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
            {selectedLabel || placeholder}
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

const styles = StyleSheet.create({
  selectorField: {
    gap: 6,
  },
  subFieldLabel: {
    color: '#355062',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
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
    borderTopColor: '#D2DCE3',
  },
  selectorOptionFirst: {
    borderTopWidth: 0,
  },
  selectorOptionSelected: {
    backgroundColor: '#D9E7F2',
  },
  selectorOptionText: {
    color: '#173248',
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '600',
  },
  selectorOptionTextSelected: {
    fontWeight: '800',
  },
});
