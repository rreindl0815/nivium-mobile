import { parseFormattedProfile } from '@/utils/profile-document';

const FIELD_LABEL_PATTERNS = [
  /date/i,
  /time/i,
  /run\s*name|location/i,
  /observer(?:s)?/i,
  /organization/i,
  /elevation/i,
  /aspect/i,
  /slope\s*angle/i,
  /lat(?:itude)?\s*\/?\s*long(?:itude)?/i,
  /air\s*temperature/i,
  /sky/i,
  /precip(?:itation)?/i,
  /wind\s*speed/i,
  /wind\s*direction/i,
  /total\s*hs|total\s*height/i,
  /surface\s*grain/i,
  /foot\s*pen/i,
  /ski\s*pen/i,
];

function normalizeSpacing(value: string) {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitIntoSentences(value: string) {
  return value
    .replace(/([.!?])\s+(?=[A-Za-z0-9])/g, '$1\n')
    .replace(/,\s+(?=(?:next|layer|temperature|stability|comment|general note)\b)/gi, ',\n')
    .replace(/\s+-\s+/g, ' - ')
    .replace(/\s{2,}/g, ' ');
}

function breakBeforeLabels(value: string) {
  let next = value;
  FIELD_LABEL_PATTERNS.forEach((pattern) => {
    next = next.replace(new RegExp(`\\b(${pattern.source})\\b\\s*:?\\s*`, 'gi'), '\n$1: ');
  });

  next = next
    .replace(/\b(layer\s*\d+)\b\s*:?\s*/gi, '\n$1: ')
    .replace(/\b(next\s*layer)\b\s*:?\s*/gi, '\n$1: ')
    .replace(/\b(compression\s*test|propagation\s*saw\s*test|rutschblock\s*test|shovel\s*shear\s*test|hand\s*shear\s*test|ext\.?\s*col\.?\s*test)\b\s*:?\s*/gi, '\n$1: ')
    .replace(/\b(general\s*note|comments?)\b\s*:?\s*/gi, '\n$1: ');

  return next;
}

function normalizeUnits(value: string) {
  return value
    .replace(/\b(\d+)\s*cm\b/gi, '$1 cm')
    .replace(/\b(\d+)\s*m\b/gi, '$1 m')
    .replace(/\b(\d+)\s*degrees?\b/gi, '$1 degrees')
    .replace(/\bminus\s+(\d+)\b/gi, '-$1');
}

function looksLikeEngineFormattedText(value: string) {
  return /(?:^|\n)\d+(?:\.\d+)?-\d+(?:\.\d+)?\s+/m.test(value) || /(?:^|\n)(?:CT|ECT|PST|HS|SS|DT|RB)/im.test(value);
}

function normalizeEngineFormattedText(value: string) {
  const parsed = parseFormattedProfile(value);
  const lines = [
    ...parsed.metadata.map((item) => `${item.label}: ${item.value}`),
    ...parsed.layers,
    ...parsed.temperatures,
    ...parsed.stabilityTests,
    ...parsed.notes,
  ].filter(Boolean);

  return normalizeSpacing(lines.join('\n'));
}

export function formatVoiceNotesForEditing(raw: string) {
  if (!raw.trim()) {
    return '';
  }

  const normalized = normalizeSpacing(raw);
  if (looksLikeEngineFormattedText(normalized)) {
    return normalizeEngineFormattedText(normalized);
  }
  const sentenceSplit = splitIntoSentences(normalized);
  const labelBroken = breakBeforeLabels(sentenceSplit);
  const unitNormalized = normalizeUnits(labelBroken);

  return normalizeSpacing(unitNormalized);
}
