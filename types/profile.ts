export type FieldSection = {
  id: string;
  title: string;
  description: string;
  accent: string;
  fields: FieldDefinition[];
};

export type FieldDefinition = {
  id: string;
  label: string;
  placeholder: string;
  keyboardType?: 'default' | 'numeric';
  multiline?: boolean;
  options?: string[];
};

export type ProfileDraft = {
  rawNotes: string;
  values: Record<string, string>;
  updatedAt: string;
};

export type SavedProfile = {
  id: string;
  title: string;
  subtitle: string;
  createdAt: string;
  formattedText: string;
  rawNotes: string;
  sourceValues?: Record<string, string>;
  sourceKind?: 'manual' | 'raw-notes';
  pdfUri?: string;
  previewImageUri?: string;
  documentKind?: 'report' | 'plot';
  renderError?: string;
};
