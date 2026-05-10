import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { CurrentLocationStatus } from './editor-types';

export function CurrentLocationHelper({
  isApplyingCurrentLocation,
  currentLocationStatus,
  onUseCurrentLocation,
}: {
  isApplyingCurrentLocation: boolean;
  currentLocationStatus: CurrentLocationStatus | null;
  onUseCurrentLocation: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Current Location</Text>
      <Pressable
        onPress={onUseCurrentLocation}
        disabled={isApplyingCurrentLocation}
        style={({ pressed }) => [
          styles.button,
          isApplyingCurrentLocation ? styles.buttonDisabled : null,
          pressed && !isApplyingCurrentLocation ? styles.buttonPressed : null,
        ]}>
        {isApplyingCurrentLocation ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#FFF8EE" />
            <Text style={styles.buttonText}>Using Current Location...</Text>
          </View>
        ) : (
          <Text style={styles.buttonText}>Use Current Location for Lat / Long and Elevation</Text>
        )}
      </Pressable>
      {currentLocationStatus ? (
        <Text
          style={[
            styles.message,
            currentLocationStatus.tone === 'error' ? styles.messageError : styles.messageSuccess,
          ]}>
          {currentLocationStatus.message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#D9E4EB',
  },
  title: {
    color: '#355062',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  button: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#20384D',
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.86,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFF8EE',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  messageSuccess: {
    color: '#2F5D45',
  },
  messageError: {
    color: '#9B332A',
  },
});
