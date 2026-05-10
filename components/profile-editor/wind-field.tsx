import { View } from 'react-native';

import { windDirectionOptions, windSpeedOptions } from './editor-constants';
import { buildWindValue, parseWindValue } from './editor-utils';
import { SelectorField } from './selector-field';

export function WindField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { speed, direction } = parseWindValue(value);
  const setSpeed = (nextSpeed: string) => onChange(buildWindValue(nextSpeed, nextSpeed === 'calm' ? '' : direction));
  const setDirection = (nextDirection: string) => onChange(buildWindValue(speed, nextDirection));

  return (
    <View style={{ gap: 10 }}>
      <SelectorField
        label="Speed"
        value={speed}
        placeholder="Choose speed"
        options={windSpeedOptions}
        onSelect={setSpeed}
      />
      {speed !== 'calm' ? (
        <SelectorField
          label="Direction"
          value={direction}
          placeholder="Choose direction"
          options={windDirectionOptions}
          onSelect={setDirection}
        />
      ) : null}
    </View>
  );
}
