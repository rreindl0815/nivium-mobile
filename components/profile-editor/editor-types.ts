export type FieldValueMap = Record<string, string>;

export type CurrentLocationStatus = {
  tone: 'success' | 'error';
  message: string;
};

export type SelectorOption = string | { label: string; value: string };
