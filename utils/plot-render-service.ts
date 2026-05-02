import * as FileSystem from 'expo-file-system/legacy';

import type { PlotRenderRequest, PlotRenderResponse } from '@/types/render-service';

const DEFAULT_ENDPOINT = process.env.EXPO_PUBLIC_NIVIUM_RENDER_ENDPOINT?.trim() ?? '';

function sanitizeFileSegment(value: string) {
  return value
    .trim()
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export function getPlotRenderEndpoint() {
  return DEFAULT_ENDPOINT;
}

export function isPlotRenderServiceConfigured() {
  return Boolean(getPlotRenderEndpoint());
}

export async function renderPlotPdfFromServiceAsync(
  request: PlotRenderRequest
): Promise<{ uri: string; previewImageUri?: string; response: PlotRenderResponse }> {
  const endpoint = getPlotRenderEndpoint();
  if (!endpoint) {
    throw new Error('Plot render service is not configured.');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    let errorDetail = '';
    try {
      const payload = (await response.json()) as { error?: string };
      errorDetail = payload.error?.trim() ? ` ${payload.error.trim()}` : '';
    } catch {
      // Ignore non-JSON error bodies and fall back to status-only messaging.
    }
    throw new Error(`Plot render failed with status ${response.status}.${errorDetail}`);
  }

  const payload = (await response.json()) as PlotRenderResponse;
  if (!payload.pdfBase64?.trim()) {
    throw new Error('Plot render response did not include a PDF payload.');
  }

  const directory = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  if (!directory) {
    throw new Error('No writable device directory is available for rendered PDFs.');
  }

  const baseName =
    payload.fileName?.replace(/\.pdf$/i, '') || sanitizeFileSegment(request.profileTitle) || 'nivium-profile';
  const fileUri = `${directory}${baseName}-${Date.now()}.pdf`;
  const previewUri = payload.previewPngBase64 ? `${directory}${baseName}-${Date.now()}-preview.png` : undefined;

  await FileSystem.writeAsStringAsync(fileUri, payload.pdfBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (previewUri && payload.previewPngBase64) {
    await FileSystem.writeAsStringAsync(previewUri, payload.previewPngBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  return {
    uri: fileUri,
    previewImageUri: previewUri,
    response: payload,
  };
}
