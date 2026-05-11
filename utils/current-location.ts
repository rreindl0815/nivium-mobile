import * as Location from 'expo-location';

const LAST_KNOWN_MAX_AGE_MS = 60_000;
const LAST_KNOWN_REQUIRED_ACCURACY_METERS = 80;

export type CurrentLocationValues = {
  elevationMeters: string;
  latLong: string;
  hasElevation: boolean;
};

export async function resolveCurrentLocationValuesAsync(): Promise<CurrentLocationValues> {
  const existingPermission = await Location.getForegroundPermissionsAsync();
  let status = existingPermission.status;

  if (status !== 'granted') {
    const requestedPermission = await Location.requestForegroundPermissionsAsync();
    status = requestedPermission.status;
  }

  if (status !== 'granted') {
    throw new Error('Location not available. Enter Lat / Long and Elevation manually.');
  }

  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    throw new Error('Turn on location services to fill Lat / Long and Elevation.');
  }

  let position = await Location.getLastKnownPositionAsync({
    maxAge: LAST_KNOWN_MAX_AGE_MS,
    requiredAccuracy: LAST_KNOWN_REQUIRED_ACCURACY_METERS,
  });

  if (!position) {
    position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
  }

  if (!position) {
    throw new Error('Current location could not be determined. Enter Lat / Long and Elevation manually.');
  }

  const { latitude, longitude, altitude } = position.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Current location could not be determined. Enter Lat / Long and Elevation manually.');
  }

  const hasElevation = typeof altitude === 'number' && Number.isFinite(altitude);

  return {
    elevationMeters: hasElevation ? `${Math.round(altitude)}` : '',
    latLong: `${formatCoordinate(latitude)}, ${formatCoordinate(longitude)}`,
    hasElevation,
  };
}

export function getCurrentLocationErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return 'Location not available. Enter Lat / Long and Elevation manually.';
}

function formatCoordinate(value: number) {
  const absoluteValue = Math.abs(value);
  const degrees = Math.floor(absoluteValue);
  const minutes = (absoluteValue - degrees) * 60;
  const prefix = value < 0 ? '-' : '';
  return `${prefix}${degrees}°${minutes.toFixed(3)}'`;
}
