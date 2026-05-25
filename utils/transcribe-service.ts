import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { getFormatterEndpoint } from '@/utils/formatter-service';

const CONFIGURED_TRANSCRIBE_ENDPOINT = process.env.EXPO_PUBLIC_NIVIUM_TRANSCRIBE_ENDPOINT?.trim() ?? '';
const TRANSCRIBE_REQUEST_TIMEOUT_MS = 120000;
const MIN_UPLOAD_FILE_BYTES = 1024;

export type TranscribeResponse = {
  transcript: string;
  formattedText?: string;
  resolvedValues?: Record<string, string>;
  warnings?: string[];
  formatterVersion?: string;
};

function buildDerivedTranscribeEndpoint() {
  const formatterEndpoint = getFormatterEndpoint();
  if (!formatterEndpoint) {
    return '';
  }
  if (formatterEndpoint.endsWith('/format')) {
    return `${formatterEndpoint.slice(0, -'/format'.length)}/transcribe-format`;
  }
  return '';
}

export function getTranscribeEndpoint() {
  return CONFIGURED_TRANSCRIBE_ENDPOINT || buildDerivedTranscribeEndpoint();
}

export function isTranscribeServiceConfigured() {
  return Boolean(getTranscribeEndpoint());
}

async function getAudioUploadSizeAsync(uri: string) {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    throw new Error('Saved voice recording is unavailable for upload.');
  }
  if (typeof info.size === 'number' && info.size < MIN_UPLOAD_FILE_BYTES) {
    throw new Error('Saved voice recording appears incomplete. Please retry the recording.');
  }
  return typeof info.size === 'number' ? info.size : null;
}

function formatTranscribeFailure(status: number, detail: string) {
  const cleanDetail = detail.trim();
  if (status === 502 || status === 503 || status === 504 || status >= 500) {
    const suffix = cleanDetail ? ` ${cleanDetail}` : '';
    return `Nivium server is temporarily unavailable (${status}). Please retry in a few minutes.${suffix}`;
  }
  if (status === 429) {
    return 'Nivium is temporarily rate limited. Please retry shortly.';
  }
  return `Transcription failed with status ${status}.${cleanDetail ? ` ${cleanDetail}` : ''}`;
}

export async function transcribeAudioFromServiceAsync(args: {
  audioUri: string;
  fileName?: string;
  mimeType?: string;
  source?: string;
  formatterVersion?: string;
  recordingDurationMillis?: number;
  recordingWasInterrupted?: boolean;
}): Promise<TranscribeResponse> {
  const endpoint = getTranscribeEndpoint();
  if (!endpoint) {
    throw new Error('Transcription service is not configured.');
  }

  const audioBytes = await getAudioUploadSizeAsync(args.audioUri);
  const form = new FormData();
  form.append('audio', {
    uri: args.audioUri,
    name: args.fileName ?? 'voice-note.m4a',
    type: args.mimeType ?? 'audio/mp4',
  } as never);
  form.append('source', args.source ?? 'raw-notes-audio');
  form.append('formatterVersion', args.formatterVersion ?? 'nivium-ai-v1');
  if (typeof audioBytes === 'number') {
    form.append('clientAudioBytes', String(audioBytes));
  }
  if (typeof args.recordingDurationMillis === 'number' && Number.isFinite(args.recordingDurationMillis)) {
    form.append('clientRecordingDurationMs', String(Math.max(0, Math.round(args.recordingDurationMillis))));
  }
  form.append('clientRecordingInterrupted', args.recordingWasInterrupted ? '1' : '0');
  form.append('clientPlatform', Platform.OS);
  form.append('clientAppVersion', Constants.expoConfig?.version ?? '');
  form.append('clientNativeBuildVersion', String(Constants.nativeBuildVersion ?? ''));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRANSCRIBE_REQUEST_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Transcription timed out after ${TRANSCRIBE_REQUEST_TIMEOUT_MS} ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let errorDetail = '';
    try {
      const payload = (await response.json()) as { error?: string };
      errorDetail = payload.error?.trim() ?? '';
    } catch {
      // Ignore malformed error body.
    }
    throw new Error(formatTranscribeFailure(response.status, errorDetail));
  }

  const payload = (await response.json()) as TranscribeResponse;
  if (!payload.transcript?.trim() && !payload.formattedText?.trim()) {
    throw new Error('Transcription response was empty.');
  }

  return payload;
}
