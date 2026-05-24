import * as FileSystem from 'expo-file-system/legacy';

const QUEUED_VOICE_NOTES_DIRECTORY = `${FileSystem.documentDirectory ?? ''}queued-voice-notes`;
const FILE_STABILITY_DELAY_MS = 350;
const FILE_STABILITY_ATTEMPTS = 4;
const MIN_RECORDING_FILE_BYTES = 1024;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getExistingFileSizeAsync(uri: string) {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    throw new Error('Recorded audio could not be found for local save.');
  }
  return typeof info.size === 'number' ? info.size : null;
}

async function waitForStableFileSizeAsync(uri: string) {
  let previousSize: number | null = null;
  let latestSize = await getExistingFileSizeAsync(uri);

  for (let attempt = 0; attempt < FILE_STABILITY_ATTEMPTS; attempt += 1) {
    if (typeof latestSize === 'number' && latestSize >= MIN_RECORDING_FILE_BYTES && latestSize === previousSize) {
      return latestSize;
    }

    previousSize = latestSize;
    await delay(FILE_STABILITY_DELAY_MS);
    latestSize = await getExistingFileSizeAsync(uri);
  }

  if (typeof latestSize === 'number' && latestSize < MIN_RECORDING_FILE_BYTES) {
    throw new Error('Recorded audio appears incomplete. Please retry the recording.');
  }

  return latestSize;
}

function getRecordingExtension(sourceUri: string) {
  const basePath = sourceUri.split('?')[0] ?? sourceUri;
  const extension = basePath.split('.').pop()?.trim().toLowerCase() ?? '';
  if (!extension || /[^a-z0-9]/i.test(extension)) {
    return 'm4a';
  }
  return extension;
}

export async function persistQueuedVoiceNoteAsync(profileId: string, sourceUri: string) {
  if (!FileSystem.documentDirectory) {
    throw new Error('Local document storage is unavailable on this device.');
  }

  const sourceSize = await waitForStableFileSizeAsync(sourceUri);

  await FileSystem.makeDirectoryAsync(QUEUED_VOICE_NOTES_DIRECTORY, { intermediates: true });

  const destinationUri = `${QUEUED_VOICE_NOTES_DIRECTORY}/${profileId}.${getRecordingExtension(sourceUri)}`;
  if (destinationUri === sourceUri) {
    return destinationUri;
  }

  const existingDestination = await FileSystem.getInfoAsync(destinationUri);
  if (existingDestination.exists) {
    await FileSystem.deleteAsync(destinationUri, { idempotent: true });
  }

  await FileSystem.copyAsync({
    from: sourceUri,
    to: destinationUri,
  });

  const destinationSize = await waitForStableFileSizeAsync(destinationUri);
  if (
    typeof sourceSize === 'number' &&
    typeof destinationSize === 'number' &&
    sourceSize !== destinationSize
  ) {
    throw new Error('Recorded audio was not saved completely. Please retry the recording.');
  }

  return destinationUri;
}

export async function deleteQueuedVoiceNoteAsync(audioUri?: string) {
  if (!audioUri) {
    return;
  }

  try {
    await FileSystem.deleteAsync(audioUri, { idempotent: true });
  } catch {
    // Ignore cleanup errors so profile cleanup can continue.
  }
}
