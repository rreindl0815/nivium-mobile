export type PlotRenderRequest = {
  engineText: string;
  profileTitle: string;
  source: 'manual-local' | 'raw-ai';
  rendererVersion: 'nivium-v1';
};

export type PlotRenderResponse = {
  documentKind: 'plot';
  rendererVersion: 'nivium-v1';
  pdfBase64: string;
  previewPngBase64?: string;
  fileName?: string;
};
