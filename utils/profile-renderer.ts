import type { SavedProfile } from '@/types/profile';
import { createProfilePdfAsync } from '@/utils/profile-document';
import { isPlotRenderServiceConfigured, renderPlotPdfFromServiceAsync } from '@/utils/plot-render-service';

export type RenderedProfileDocument = {
  uri: string;
  previewImageUri?: string;
  documentKind: 'report' | 'plot';
};

export type RendererAvailability = {
  canRenderPlotLocally: boolean;
  summary: string;
};

export class PlotRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlotRenderError';
  }
}

export function getRendererAvailability(): RendererAvailability {
  if (isPlotRenderServiceConfigured()) {
    return {
      canRenderPlotLocally: true,
      summary: 'A plotted Nivium renderer endpoint is configured for the app.',
    };
  }

  return {
    canRenderPlotLocally: false,
    summary:
      'The plotted Nivium renderer is finalized in the lab, but the Expo app still needs a configured render endpoint to use it from the device.',
  };
}

export async function createRenderedProfileDocumentAsync(
  profile: SavedProfile
): Promise<RenderedProfileDocument> {
  if (isPlotRenderServiceConfigured()) {
    try {
      const plotted = await renderPlotPdfFromServiceAsync({
        engineText: profile.formattedText,
        profileTitle: profile.title,
        source: profile.sourceKind === 'raw-notes' ? 'raw-ai' : 'manual-local',
        rendererVersion: 'nivium-v1',
      });

      return {
        uri: plotted.uri,
        previewImageUri: plotted.previewImageUri,
        documentKind: plotted.response.documentKind,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown plotted renderer failure.';
      throw new PlotRenderError(message);
    }
  }

  const pdf = await createProfilePdfAsync(profile);

  return {
    uri: pdf.uri,
    documentKind: 'report',
  };
}
