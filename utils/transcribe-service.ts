import { getFormatterEndpoint } from '@/utils/formatter-service';

const CONFIGURED_TRANSCRIBE_ENDPOINT = process.env.EXPO_PUBLIC_NIVIUM_TRANSCRIBE_ENDPOINT?.trim() ?? '';
const TRANSCRIBE_REQUEST_TIMEOUT_MS = 120000;

export type TranscribeResponse = {
  transcript: string;
  formattedText?: string;
  resolvedValues?: Record<string, string>;
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

export async function transcribeAudioFromServiceAsync(args: {
  audioUri: string;
  fileName?: string;
  mimeType?: string;
  source?: string;
  formatterVersion?: string;
}): Promise<TranscribeResponse> {
  const endpoint = getTranscribeEndpoint();
  if (!endpoint) {
    throw new Error('Transcription service is not configured.');
  }

  const form = new FormData();
  form.append('audio', {
    uri: args.audioUri,
    name: args.fileName ?? 'voice-note.m4a',
    type: args.mimeType ?? 'audio/mp4',
  } as never);
  form.append('source', args.source ?? 'raw-notes-audio');
  form.append('formatterVersion', args.formatterVersion ?? 'nivium-ai-v1');

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
      errorDetail = payload.error?.trim() ? ` ${payload.error.trim()}` : '';
    } catch {
      // Ignore malformed error body.
    }
    throw new Error(`Transcription failed with status ${response.status}.${errorDetail}`);
  }

  const payload = (await response.json()) as TranscribeResponse;
  if (!payload.transcript?.trim() && !payload.formattedText?.trim()) {
    throw new Error('Transcription response was empty.');
  }

  return payload;
}

