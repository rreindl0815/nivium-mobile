import type { FormatterRequest, FormatterResponse } from '@/types/formatter-service';

const DEFAULT_ENDPOINT = process.env.EXPO_PUBLIC_NIVIUM_FORMATTER_ENDPOINT?.trim() ?? '';
const FORMATTER_REQUEST_TIMEOUT_MS = 60000;

export function getFormatterEndpoint() {
  return DEFAULT_ENDPOINT;
}

export function isFormatterServiceConfigured() {
  return Boolean(getFormatterEndpoint());
}

export async function formatRawNotesFromServiceAsync(request: FormatterRequest): Promise<FormatterResponse> {
  const endpoint = getFormatterEndpoint();
  if (!endpoint) {
    throw new Error('Formatter service is not configured.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FORMATTER_REQUEST_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Formatter request timed out after ${FORMATTER_REQUEST_TIMEOUT_MS} ms.`);
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
      // Ignore malformed error bodies.
    }
    throw new Error(`Formatter failed with status ${response.status}.${errorDetail}`);
  }

  const payload = (await response.json()) as FormatterResponse;
  if (!payload.formattedText?.trim()) {
    throw new Error('Formatter response did not include engine-ready text.');
  }

  return payload;
}
