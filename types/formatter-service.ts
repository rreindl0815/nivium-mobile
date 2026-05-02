export type FormatterRequest = {
  rawNotes: string;
  source: 'raw-notes-ai';
  formatterVersion: 'nivium-ai-v1';
};

export type FormatterResponse = {
  formatterVersion: 'nivium-ai-v1';
  formattedText: string;
  resolvedValues?: Record<string, string>;
  warnings?: string[];
};
