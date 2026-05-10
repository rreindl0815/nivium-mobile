import { View } from 'react-native';

import { dayOptions, monthOptions, yearOptions } from './editor-constants';
import { composeDate, parseDateParts } from './editor-utils';
import { SelectorField } from './selector-field';

export function DateField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const parts = parseDateParts(value);
  const update = (nextMonth: string, nextDay: string, nextYear: string) =>
    onChange(composeDate(nextMonth, nextDay, nextYear));

  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1 }}>
        <SelectorField
          label="Month"
          value={parts.month}
          placeholder="Month"
          options={monthOptions}
          onSelect={(nextMonth) => update(nextMonth, parts.day || '1', parts.year || yearOptions[1] || yearOptions[0])}
        />
      </View>
      <View style={{ flex: 1 }}>
        <SelectorField
          label="Day"
          value={parts.day}
          placeholder="Day"
          options={dayOptions}
          onSelect={(nextDay) => update(parts.month || 'January', nextDay, parts.year || yearOptions[1] || yearOptions[0])}
        />
      </View>
      <View style={{ flex: 1 }}>
        <SelectorField
          label="Year"
          value={parts.year}
          placeholder="Year"
          options={yearOptions}
          onSelect={(nextYear) => update(parts.month || 'January', parts.day || '1', nextYear)}
        />
      </View>
    </View>
  );
}
