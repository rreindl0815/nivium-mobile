import * as FileSystem from 'expo-file-system/legacy';

const QUEUED_VOICE_NOTES_DIRECTORY = `${FileSystem.documentDirectory ?? ''}queued-voice-notes`;

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

  const sourceInfo = await FileSystem.getInfoAsync(sourceUri);
  if (!sourceInfo.exists) {
    throw new Error('Recorded audio could not be found for local save.');
  }

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
