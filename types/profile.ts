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

export type VoiceNoteSession = {
  profileId?: string;
  transcriptRaw: string;
  engineTextOriginal: string;
  engineTextCurrent: string;
  reviewValues: Record<string, string>;
  serviceWarnings: string[];
  warnings: string[];
  formatterVersion?: string;
  audioUri?: string;
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
  transcriptRaw?: string;
  engineTextOriginal?: string;
  formatterWarnings?: string[];
  audioUri?: string;
  pdfUri?: string;
  previewImageUri?: string;
  documentKind?: 'report' | 'plot';
  renderError?: string;
};
