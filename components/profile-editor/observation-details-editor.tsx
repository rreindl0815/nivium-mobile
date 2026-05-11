import { StyleSheet, Text, TextInput, View, Pressable } from 'react-native';

import { fieldCardSections } from '@/data/field-card';
import {
  convertElevationValue,
  elevationUnitOptions,
  normalizeElevationUnit,
} from '@/utils/profile-defaults';

import { chipOptionFieldIds, observationGroups, timeOptions } from './editor-constants';
import { CurrentLocationHelper } from './current-location-helper';
import { DateField } from './date-field';
import type { CurrentLocationStatus, FieldValueMap } from './editor-types';
import { SelectorField } from './selector-field';
import { WindField } from './wind-field';

const metadataFieldMap = new Map(
  (fieldCardSections.find((section) => section.id === 'metadata')?.fields ?? []).map((field) => [field.id, field])
);

export function ObservationDetailsEditor({
  values,
  onChange,
  onReplaceValues,
  onUseCurrentLocation,
  isApplyingCurrentLocation,
  currentLocationStatus,
  showCurrentLocationHelper = true,
}: {
  values: FieldValueMap;
  onChange: (fieldId: string, value: string) => void;
  onReplaceValues?: (values: FieldValueMap) => void;
  onUseCurrentLocation: () => void;
  isApplyingCurrentLocation: boolean;
  currentLocationStatus: CurrentLocationStatus | null;
  showCurrentLocationHelper?: boolean;
}) {
  const elevationUnit = normalizeElevationUnit(values.elevation_unit);

  const handleElevationUnitChange = (nextUnit: string) => {
    const normalizedNextUnit = normalizeElevationUnit(nextUnit);
    const currentUnit = normalizeElevationUnit(values.elevation_unit);
    const nextElevation = convertElevationValue(values.elevation, currentUnit, normalizedNextUnit);
    const nextValues = {
      ...values,
      elevation_unit: normalizedNextUnit,
      elevation: values.elevation?.trim() ? nextElevation : values.elevation ?? '',
    };

    if (onReplaceValues) {
      onReplaceValues(nextValues);
      return;
    }

    onChange('elevation_unit', normalizedNextUnit);
    if (values.elevation?.trim()) {
      onChange('elevation', nextElevation);
    }
  };

  return (
    <View style={styles.groupStack}>
      {observationGroups.map((group) => (
        <View key={group.title} style={styles.groupCard}>
          <Text style={styles.groupTitle}>{group.title}</Text>
          {showCurrentLocationHelper && group.title === 'Location' ? (
            <CurrentLocationHelper
              isApplyingCurrentLocation={isApplyingCurrentLocation}
              currentLocationStatus={currentLocationStatus}
              onUseCurrentLocation={onUseCurrentLocation}
            />
          ) : null}
          <View style={styles.fieldGrid}>
            {group.fields.map((fieldId) => {
              const field = metadataFieldMap.get(fieldId);
              if (!field) {
                return null;
              }
              if (field.id === 'elevation_unit') {
                return (
                  <View key={field.id} style={styles.field}>
                    <SelectorField
                      label="Elevation Unit"
                      value={elevationUnit}
                      placeholder="Choose unit"
                      options={elevationUnitOptions}
                      onSelect={handleElevationUnitChange}
                    />
                  </View>
                );
              }
              return (
                <ObservationField
                  key={field.id}
                  fieldId={field.id}
                  label={getObservationFieldLabel(field.id, field.label, elevationUnit)}
                  placeholder={getObservationFieldPlaceholder(field.id, field.placeholder)}
                  keyboardType={field.keyboardType}
                  options={fieldId === 'time' ? timeOptions : field.options}
                  value={values[field.id] ?? ''}
                  onChange={onChange}
                />
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

function ObservationField({
  fieldId,
  label,
  placeholder,
  keyboardType,
  options,
  value,
  onChange,
}: {
  fieldId: string;
  label: string;
  placeholder: string;
  keyboardType?: 'default' | 'numeric';
  options?: readonly string[];
  value: string;
  onChange: (fieldId: string, value: string) => void;
}) {
  if (fieldId === 'date') {
    return (
      <View style={styles.field}>
        <Text style={styles.subFieldLabel}>{label}</Text>
        <DateField value={value} onChange={(next) => onChange(fieldId, next)} />
      </View>
    );
  }

  if (fieldId === 'wind') {
    return (
      <View style={styles.field}>
        <Text style={styles.subFieldLabel}>{label}</Text>
        <WindField value={value} onChange={(next) => onChange(fieldId, next)} />
      </View>
    );
  }

  if (options?.length && chipOptionFieldIds.has(fieldId)) {
    return (
      <View style={styles.field}>
        <Text style={styles.subFieldLabel}>{label}</Text>
        <View style={styles.optionList}>
          {options.map((option) => {
            const selected = value === option;
            return (
              <Pressable
                key={`${fieldId}-${option}`}
                onPress={() => onChange(fieldId, option)}
                style={[styles.optionChip, selected ? styles.optionChipSelected : null]}>
                <Text style={[styles.optionChipText, selected ? styles.optionChipTextSelected : null]}>{option}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  if (options?.length) {
    return (
      <View style={styles.field}>
        <SelectorField
          label={label}
          value={value}
          placeholder={placeholder}
          options={options}
          clearOptionLabel={fieldId === 'time' ? undefined : 'None'}
          onSelect={(next) => onChange(fieldId, next)}
        />
      </View>
    );
  }

  return (
    <View style={styles.field}>
      <Text style={styles.subFieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(next) => onChange(fieldId, next)}
        placeholder={placeholder}
        placeholderTextColor="#7B8E9D"
        keyboardType={keyboardType}
        style={styles.fieldInput}
      />
    </View>
  );
}

function getObservationFieldLabel(fieldId: string, fallbackLabel: string, elevationUnit: string) {
  switch (fieldId) {
    case 'run_name':
      return 'Run Name / Location';
    case 'observer':
      return 'Observer(s)';
    case 'elevation':
      return `Elevation (${elevationUnit})`;
    case 'total_hs':
      return 'Total HS (cm)';
    case 'lat_long':
      return 'Lat / Long';
    default:
      return fallbackLabel;
  }
}

function getObservationFieldPlaceholder(fieldId: string, fallbackPlaceholder: string) {
  switch (fieldId) {
    case 'time':
      return 'Enter time';
    case 'date':
      return 'Date';
    case 'lat_long':
      return 'Enter lat / long';
    default:
      return fallbackPlaceholder;
  }
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
  groupTitle: {
    color: '#20384D',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '800',
  },
  fieldGrid: {
    gap: 12,
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
});
