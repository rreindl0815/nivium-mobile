import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

import { useProfileDraft } from '@/context/profile-draft-context';
import { useVoiceNoteSession } from '@/context/voice-note-session-context';
import { formatDraftToEngineText } from '@/utils/formatter';
import { formatRawNotesFromServiceAsync, isFormatterServiceConfigured } from '@/utils/formatter-service';
import { isPlotRenderServiceConfigured } from '@/utils/plot-render-service';
import { getMetadataValue, parseFormattedProfile } from '@/utils/profile-document';
import { extractDraftValuesFromRawNotes } from '@/utils/raw-note-parser';
import { createRenderedProfileDocumentAsync, PlotRenderError } from '@/utils/profile-renderer';
import { hydrateStructuredValuesFromFormattedText } from '@/utils/structured-profile-values';
import { transcribeAudioFromServiceAsync } from '@/utils/transcribe-service';
import { deleteQueuedVoiceNoteAsync, persistQueuedVoiceNoteAsync } from '@/utils/voice-note-storage';
import type { SavedProfile, VoiceNoteSession } from '@/types/profile';

const STORAGE_KEY = 'skeena-saved-profiles';

type SavedProfilesContextValue = {
  profiles: SavedProfile[];
  selectedProfileId: string | null;
  isLoaded: boolean;
  createProfileFromDraft: (
    sourceKind?: 'manual' | 'raw-notes',
    editingProfileId?: string | null
  ) => Promise<SavedProfile | null>;
  createProfileFromVoiceSession: (session: VoiceNoteSession) => Promise<SavedProfile | null>;
  queueVoiceNoteRecording: (audioUri: string, sourceValues?: Record<string, string>) => Promise<SavedProfile | null>;
  finalizePendingVoiceNoteProcessing: (
    profileId: string,
    input: {
      transcriptRaw?: string;
      engineText?: string;
      resolvedValues?: Record<string, string>;
      warnings?: string[];
      audioUri?: string;
    }
  ) => Promise<SavedProfile | null>;
  retryPendingVoiceProcessing: (profileId: string) => Promise<{ profile: SavedProfile | null; error?: string }>;
  ensureProfilePdf: (profileId: string) => Promise<{ uri: string | null; error?: string }>;
  reopenProfileForEditing: (profileId: string) => Promise<'manual' | 'raw-notes' | null>;
  deleteProfile: (profileId: string) => Promise<void>;
  clearArchivePreservingSamples: () => Promise<number>;
  setSelectedProfileId: (id: string | null) => void;
  selectedProfile: SavedProfile | null;
};

const SavedProfilesContext = createContext<SavedProfilesContextValue | null>(null);
const LAYER_GRAIN_CODES = new Set(['PP', 'DF', 'RG', 'FC', 'FCxr', 'SH', 'DH', 'MF', 'IF', 'IFrc', 'MFcr']);
const LAYER_HARDNESS_CODES = new Set(['F', 'F+', '4F', '4F+', '1F', '1F+', 'P', 'P+', 'K', 'K+', 'I']);
const STABILITY_TYPES = new Set(['CT', 'SS', 'HS', 'ECT', 'PST', 'RB']);
const STABILITY_CHARACTERS = new Set(['SC', 'SP', 'PC', 'RP', 'BRK']);
const LAYER_STRUCTURED_VALUE_PATTERN =
  /^(?:layer_\d+_(?:top|bottom|grain_[12]|hardness_[12]|size_[12]|comment|concern)|layer_count)$/;

function setIfMissing(target: Record<string, string>, key: string, value: string | undefined) {
  const clean = value?.trim() ?? '';
  if (!clean) {
    return;
  }
  if ((target[key] ?? '').trim()) {
    return;
  }
  target[key] = clean;
}

function setIfPresent(target: Record<string, string>, key: string, value: string | undefined) {
  const clean = value?.trim() ?? '';
  if (!clean) {
    return;
  }
  target[key] = clean;
}

function extractCommentsFromFormattedText(formattedText: string) {
  return formattedText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^Notes:\s*(.+)$/i);
      return match ? match[1].trim() : '';
    })
    .filter(Boolean)
    .join('\n');
}

function sanitizeWord(value: string) {
  return value
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeSkyValue(value: string) {
  const text = sanitizeWord(value).toLowerCase();
  if (!text) {
    return '';
  }
  const token = text.split(' ')[0] ?? '';
  const allowed = new Set(['clr', 'few', 'sct', 'bkn', 'ovc', 'x', 'nil']);
  if (allowed.has(token)) {
    return token;
  }
  return token || text;
}

function sanitizePrecipValue(value: string) {
  const text = sanitizeWord(value).toLowerCase();
  if (!text) {
    return '';
  }
  const compact = text.replace(/\s+/g, '');
  if (/^nil$/.test(compact)) {
    return 'nil';
  }
  const match = compact.match(/^(s|r|gr|h)?-?(nil|[1-9])$/i);
  if (match) {
    return `${match[1] ?? ''}${match[2]}`.toLowerCase();
  }
  return text.split(' ')[0] ?? text;
}

function sanitizeWindValue(value: string) {
  const text = sanitizeWord(value).toLowerCase();
  if (!text) {
    return '';
  }
  const parts = text.split(' ').filter(Boolean);
  const dirSet = new Set(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']);
  const speedSet = new Set(['calm', 'light', 'moderate', 'strong', 'mod']);
  const dir = parts.find((part) => dirSet.has(part));
  const speed = parts.find((part) => speedSet.has(part));
  if (speed && dir) {
    return `${speed} ${dir.toUpperCase()}`;
  }
  if (speed) {
    return speed;
  }
  if (dir) {
    return dir.toUpperCase();
  }
  return parts[0] ?? text;
}

function sanitizeSurfaceGrainValue(value: string) {
  const text = value
    .replace(/foot\s*pen.*/i, '')
    .replace(/foot\s*penetration.*/i, '')
    .replace(/ski\s*pen.*/i, '')
    .replace(/ski\s*penetration.*/i, '')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) {
    return '';
  }

  const lower = text.toLowerCase();
  if (/\bstellar|\bstellars|\bpp\b/i.test(lower)) {
    return 'PP';
  }

  const token = text.split(' ')[0] ?? '';
  const allowed = new Set(['PP', 'DF', 'RG', 'FC', 'SH', 'DH', 'MF', 'IFrc', 'MFcr']);
  if (allowed.has(token)) {
    return token;
  }
  const upperToken = token.toUpperCase();
  if (allowed.has(upperToken)) {
    return upperToken;
  }
  return token;
}

function sanitizeManualValues(values: Record<string, string>) {
  const next = { ...values };
  if (next.elevation) next.elevation = next.elevation.replace(/[^\d.]/g, '');
  if (next.slope_angle) next.slope_angle = next.slope_angle.replace(/[^\d.]/g, '');
  if (next.total_hs) next.total_hs = next.total_hs.replace(/[^\d.]/g, '');
  if (next.foot_pen) next.foot_pen = next.foot_pen.replace(/[^\d.]/g, '');
  if (next.ski_pen) next.ski_pen = next.ski_pen.replace(/[^\d.]/g, '');
  if (next.air_temperature) next.air_temperature = next.air_temperature.replace(/[^\d.-]/g, '');
  if (next.lat_long) next.lat_long = next.lat_long.replace(/\s+/g, ' ').trim();
  if (next.sky) next.sky = sanitizeSkyValue(next.sky);
  if (next.precip) next.precip = sanitizePrecipValue(next.precip);
  if (next.wind) next.wind = sanitizeWindValue(next.wind);
  if (next.surface_grain) next.surface_grain = sanitizeSurfaceGrainValue(next.surface_grain);
  return next;
}

function normalizeGrainToken(token: string) {
  const clean = token.replace(/[.,;]+/g, '').trim();
  const upper = clean.toUpperCase();
  if (upper === 'FCXR') return 'FCxr';
  if (upper === 'IFRC') return 'IFrc';
  if (upper === 'MFCR') return 'MFcr';
  if (upper === 'IF') return 'IF';
  if (upper === 'PP' || upper === 'DF' || upper === 'RG' || upper === 'FC' || upper === 'SH' || upper === 'DH' || upper === 'MF') {
    return upper;
  }
  return '';
}

function extractSizeTokens(token: string) {
  const dual = token.match(/^(\d+(?:\.\d+)?)(mm|cm)\/(\d+(?:\.\d+)?)(mm|cm)$/i);
  if (dual) {
    return [`${dual[1]} ${dual[2].toLowerCase()}`, `${dual[3]} ${dual[4].toLowerCase()}`];
  }

  const single = token.match(/^(\d+(?:\.\d+)?)(mm|cm)$/i);
  if (single) {
    return [`${single[1]} ${single[2].toLowerCase()}`];
  }

  return [];
}

function normalizeLegacyLayerText(value: string) {
  return value
    .replace(/\bfour[\s-]*finger\b/gi, '4F')
    .replace(/\bone[\s-]*finger\b/gi, '1F')
    .replace(/\bfist\b/gi, 'F')
    .replace(/\bpencil\b/gi, 'P')
    .replace(/\bknife\b/gi, 'K')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanHardnessToken(token: string) {
  return token
    .replace(/^[\-/]+|[\-/]+$/g, '')
    .replace('/', '-')
    .trim();
}

function extractLegacyHardnessTokens(token: string) {
  const cleaned = cleanHardnessToken(token).replace(/→/g, '-');
  if (!cleaned) {
    return [];
  }

  const transition = cleaned.match(
    /^(F|F\+|4F|4F\+|1F|1F\+|P|P\+|K|K\+|I)\s*-\s*(F|F\+|4F|4F\+|1F|1F\+|P|P\+|K|K\+|I)$/i
  );
  if (transition) {
    return [transition[1].toUpperCase(), transition[2].toUpperCase()];
  }

  if (LAYER_HARDNESS_CODES.has(cleaned.toUpperCase())) {
    return [cleaned.toUpperCase()];
  }

  return [];
}

function normalizeLegacyHardnessTokens(grainTokens: string[], hardnessTokens: string[]) {
  const crustGrainPresent = grainTokens.some((token) => token === 'IFrc' || token === 'MFcr');
  if (!crustGrainPresent || hardnessTokens.length < 2) {
    return hardnessTokens;
  }

  const first = hardnessTokens[0];
  if (!first || !hardnessTokens.every((token) => token === first)) {
    return hardnessTokens;
  }

  return [first];
}

function parseLegacyLayerLine(line: string) {
  const match = line.trim().match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\s+(.+)$/);
  if (!match) {
    return null;
  }

  const top = match[1];
  const bottom = match[2];
  const [main, commentFromPipe] = match[3].split('|').map((part) => part.trim());
  const isRed = /\bred\b/i.test(main);
  const normalizedMain = normalizeLegacyLayerText(
    main
    .replace(/\bred\b/gi, '')
    .replace(/(\d+(?:\.\d+)?)\s*(mm|cm)\b/gi, '$1$2')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
  );
  const tokens = normalizedMain
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);

  const grainTokens = tokens
    .flatMap((token) => token.split('/').map((part) => normalizeGrainToken(part)))
    .filter(Boolean)
    .filter((token) => LAYER_GRAIN_CODES.has(token));
  const hardnessTokens = normalizeLegacyHardnessTokens(
    grainTokens,
    tokens.flatMap((token) => extractLegacyHardnessTokens(token))
  );
  const sizeTokens = tokens.flatMap((token) => extractSizeTokens(token));
  const used = new Set([
    ...tokens.filter((token) => token.toLowerCase() === 'crust'),
  ]);

  const trailingCommentTokens = tokens.filter((token) => {
    if (used.has(token)) {
      return false;
    }
    if (token.split('/').every((part) => Boolean(normalizeGrainToken(part)))) {
      return false;
    }
    if (extractLegacyHardnessTokens(token).length > 0) {
      return false;
    }
    if (extractSizeTokens(token).length > 0) {
      return false;
    }
    return true;
  });
  const mergedComment = [trailingCommentTokens.join(' ').trim(), commentFromPipe ?? '']
    .filter(Boolean)
    .join(' | ')
    .trim();

  return {
    top,
    bottom,
    grain1: grainTokens[0] ?? '',
    grain2: grainTokens[1] ?? '',
    hardness1: hardnessTokens[0] ?? '',
    hardness2: hardnessTokens[1] ?? '',
    size1: sizeTokens[0] ?? '',
    size2: sizeTokens[1] ?? '',
    comment: mergedComment,
    concern: isRed ? 'yes' : 'no',
  };
}

function parseTemperatureLine(line: string) {
  const match = line.trim().match(/^(-?\d+(?:\.\d+)?)\s+(surface|\d+(?:\.\d+)?)(?:cm)?$/i);
  if (!match) {
    return null;
  }
  return {
    value: match[1],
    depth: match[2].toLowerCase() === 'surface' ? 'surface' : match[2],
  };
}

function parseStabilityLine(line: string) {
  const normalized = line.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const normalizedUpper = normalized.toUpperCase();
  const detectedType = normalizedUpper.startsWith('ECT')
    ? 'ECT'
    : normalizedUpper.startsWith('CT')
      ? 'CT'
      : normalizedUpper.startsWith('PST')
        ? 'PST'
        : normalizedUpper.startsWith('SS')
          ? 'SS'
          : normalizedUpper.startsWith('HS')
            ? 'HS'
            : normalizedUpper.startsWith('RB')
              ? 'RB'
              : '';

  if (!detectedType) {
    return null;
  }
  const type = detectedType;
  if (!STABILITY_TYPES.has(type)) {
    return null;
  }

  const depthMatch = normalized.match(/\bat\s+(\d+(?:\.\d+)?)\s*cm\b/i);
  const tapsMatch = normalized.match(/\b(\d{1,2})\s*taps?\b/i);
  const characterMatch = normalized.match(/\b(SC|SP|PC|RP|BRK)\b/i);
  const test: Record<string, string> = {
    type,
    depth: depthMatch?.[1] ?? '',
    taps: tapsMatch?.[1] ?? '',
    character: characterMatch?.[1]?.toUpperCase() ?? '',
    result: '',
    pstCut: '',
    pstColumn: '',
  };

  if (test.character && !STABILITY_CHARACTERS.has(test.character)) {
    test.character = '';
  }

  if (type === 'CT' || type === 'SS' || type === 'HS') {
    const resultWord = normalized.match(/\b(easy|moderate|hard)\b/i)?.[1]?.toLowerCase() ?? '';
    if (resultWord) {
      test.result = resultWord;
    } else if (type === 'CT') {
      const ctCode = normalized.match(/\bCT([EMH])\b/i)?.[1]?.toUpperCase();
      if (ctCode === 'E') {
        test.result = 'easy';
      } else if (ctCode === 'M') {
        test.result = 'moderate';
      } else if (ctCode === 'H') {
        test.result = 'hard';
      }
    }
    // Support compact CT tokens like CTE11 / CTM23 when "11 taps" is not spoken explicitly.
    if (type === 'CT' && !test.taps) {
      const ctCompact = normalized.match(/\bCT(?:E|M|H)?\s*(\d{1,2})\b/i);
      if (ctCompact?.[1]) {
        test.taps = ctCompact[1];
      }
    }
  } else if (type === 'ECT') {
    const ect = normalized.match(/\bECT\s*([NPX])\s*\d*\b/i)?.[1]?.toUpperCase();
    if (ect) {
      test.result = `ECT${ect}`;
    }
    const ectCompact = normalized.match(/\bECT([NPX])(\d{1,2})\b/i);
    if (ectCompact?.[2] && !test.taps) {
      test.taps = ectCompact[2];
    }
  } else if (type === 'PST') {
    const pst = normalized.match(/\b(End|Arr|SF)\b/i)?.[1];
    if (pst) {
      test.result = pst.toUpperCase();
    }
    const column = normalized.match(/\b(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\b/);
    if (column) {
      test.pstCut = column[1];
      test.pstColumn = column[2];
    }
  } else if (type === 'RB') {
    const rb = normalized.match(/\b(RB[1-7])\b/i)?.[1]?.toUpperCase() ?? '';
    if (rb) {
      test.result = rb;
    }
  }

  return test;
}

function hasStructuredManualValues(values: Record<string, string>) {
  return Object.keys(values).some((key) => /^(layer_\d+_bottom|temp_\d+_depth|test_\d+_type)$/.test(key) && (values[key] ?? '').trim());
}

function seedStructuredManualValuesFromSource(target: Record<string, string>, sourceValues: Record<string, string>) {
  Object.entries(sourceValues).forEach(([key, value]) => {
    if (!value?.trim()) {
      return;
    }
    if (
      /^(?:layer_\d+_(?:top|bottom|grain_[12]|hardness_[12]|size_[12]|comment|concern)|layer_count|temp_\d+_(?:depth|value)|temp_count|test_\d+_(?:type|result|taps|character|depth|pst_cut|pst_column)|test_count)$/.test(
        key
      )
    ) {
      target[key] = value.trim();
    }
  });
}

function hydrateManualValuesForEdit(profile: SavedProfile) {
  const sourceValues = profile.sourceValues ?? {};
  const hydrated: Record<string, string> = {};
  const parsed = profile.formattedText?.trim() ? parseFormattedProfile(profile.formattedText) : null;
  const hasParsedLayers = (parsed?.layers.length ?? 0) > 0;
  const hasParsedTemps = (parsed?.temperatures.length ?? 0) > 0;
  const hasParsedTests = (parsed?.stabilityTests.length ?? 0) > 0;

  // Preserve explicit structured MED values first (when present),
  // then use parsed layer/test lines only to fill any missing fields.
  // If parsed profile sections exist, they are the source of truth and stale
  // structured fragments from older saves must not override them.
  if (hasStructuredManualValues(sourceValues) && !hasParsedLayers && !hasParsedTemps && !hasParsedTests) {
    seedStructuredManualValuesFromSource(hydrated, sourceValues);
  }

  const layerLines =
    hasParsedLayers
      ? parsed!.layers
      : Array.from({ length: 12 }, (_, index) => hydrated[`layer_${index + 1}`] ?? '').filter(Boolean);
  layerLines.slice(0, 12).forEach((line, index) => {
    const parsedLayer = parseLegacyLayerLine(line);
    if (!parsedLayer) {
      return;
    }
    const slot = index + 1;
    setIfMissing(hydrated, `layer_${slot}_top`, parsedLayer.top);
    setIfMissing(hydrated, `layer_${slot}_bottom`, parsedLayer.bottom);
    setIfMissing(hydrated, `layer_${slot}_grain_1`, parsedLayer.grain1);
    setIfMissing(hydrated, `layer_${slot}_grain_2`, parsedLayer.grain2);
    setIfMissing(hydrated, `layer_${slot}_hardness_1`, parsedLayer.hardness1);
    setIfMissing(hydrated, `layer_${slot}_hardness_2`, parsedLayer.hardness2);
    setIfMissing(hydrated, `layer_${slot}_size_1`, parsedLayer.size1);
    setIfMissing(hydrated, `layer_${slot}_size_2`, parsedLayer.size2);
    setIfMissing(hydrated, `layer_${slot}_comment`, parsedLayer.comment);
    setIfMissing(hydrated, `layer_${slot}_concern`, parsedLayer.concern);
  });
  setIfMissing(hydrated, 'layer_count', `${Math.max(layerLines.length, 1)}`);

  const temperatureLines =
    hasParsedTemps
      ? parsed!.temperatures
      : (hydrated.temp_profile ?? '')
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
  temperatureLines.slice(0, 20).forEach((line, index) => {
    const parsedTemp = parseTemperatureLine(line);
    if (!parsedTemp) {
      return;
    }
    const slot = index + 1;
    setIfMissing(hydrated, `temp_${slot}_depth`, parsedTemp.depth);
    setIfMissing(hydrated, `temp_${slot}_value`, parsedTemp.value);
  });
  setIfMissing(hydrated, 'temp_count', `${Math.max(temperatureLines.length, 1)}`);

  const stabilityLines =
    hasParsedTests
      ? parsed!.stabilityTests
      : (hydrated.stability_tests ?? '')
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
  stabilityLines.slice(0, 12).forEach((line, index) => {
    const parsedTest = parseStabilityLine(line);
    if (!parsedTest) {
      return;
    }
    const slot = index + 1;
    setIfMissing(hydrated, `test_${slot}_type`, parsedTest.type);
    setIfMissing(hydrated, `test_${slot}_result`, parsedTest.result);
    setIfMissing(hydrated, `test_${slot}_taps`, parsedTest.taps);
    setIfMissing(hydrated, `test_${slot}_character`, parsedTest.character);
    setIfMissing(hydrated, `test_${slot}_depth`, parsedTest.depth);
    setIfMissing(hydrated, `test_${slot}_pst_cut`, parsedTest.pstCut);
    setIfMissing(hydrated, `test_${slot}_pst_column`, parsedTest.pstColumn);
  });
  setIfMissing(hydrated, 'test_count', `${Math.max(stabilityLines.length, 1)}`);

  if (parsed) {
    // Always prefer the saved formatted profile metadata when reopening for MED edits.
    // This prevents noisy raw-note extraction fragments from leaking back into manual fields.
    setIfPresent(hydrated, 'run_name', getMetadataValue(parsed, 'Run Name'));
    setIfPresent(hydrated, 'date', getMetadataValue(parsed, 'Date'));
    setIfPresent(hydrated, 'time', getMetadataValue(parsed, 'Time'));
    setIfPresent(hydrated, 'observer', getMetadataValue(parsed, 'Observer'));
    setIfPresent(hydrated, 'organization', getMetadataValue(parsed, 'Organization'));
    setIfPresent(hydrated, 'elevation', getMetadataValue(parsed, 'Elevation').replace(/[^\d.]/g, ''));
    setIfPresent(hydrated, 'aspect', getMetadataValue(parsed, 'Aspect').toLowerCase());
    setIfPresent(hydrated, 'slope_angle', getMetadataValue(parsed, 'Slope Angle').replace(/[^\d.]/g, ''));
    setIfPresent(hydrated, 'lat_long', getMetadataValue(parsed, 'Lat/Long'));
    setIfPresent(hydrated, 'air_temperature', getMetadataValue(parsed, 'Air Temperature').replace(/[^\d.-]/g, ''));
    setIfPresent(hydrated, 'sky', getMetadataValue(parsed, 'Sky').toLowerCase());
    setIfPresent(hydrated, 'precip', getMetadataValue(parsed, 'Precip').toLowerCase());
    setIfPresent(hydrated, 'wind', getMetadataValue(parsed, 'Wind'));
    setIfPresent(hydrated, 'total_hs', getMetadataValue(parsed, 'Total Hs').replace(/[^\d.]/g, ''));
    setIfPresent(hydrated, 'surface_grain', getMetadataValue(parsed, 'Surface Grain'));
    setIfPresent(hydrated, 'foot_pen', getMetadataValue(parsed, 'Foot Pen').replace(/[^\d.]/g, ''));
    setIfPresent(hydrated, 'ski_pen', getMetadataValue(parsed, 'Ski Pen').replace(/[^\d.]/g, ''));
    setIfPresent(hydrated, 'comments', extractCommentsFromFormattedText(profile.formattedText));
  }

  // Keep any additional saved values (for fields not represented in parsed engine text),
  // but never overwrite parsed/hydrated values.
  Object.entries(sourceValues).forEach(([key, value]) => {
    // Parsed layer lines are the source of truth when reopening MED.
    // Do not let stale structured layer fragments from older sourceValues
    // overwrite or re-introduce drift (for example hardness_2 "P" leakage).
    if (parsed && LAYER_STRUCTURED_VALUE_PATTERN.test(key)) {
      return;
    }
    setIfMissing(hydrated, key, value);
  });

  // Last-resort fallback for legacy profiles with no parsed text and no saved values.
  if (Object.keys(hydrated).length === 0) {
    return sanitizeManualValues(buildResolvedDraftValues(profile.rawNotes, sourceValues));
  }

  return sanitizeManualValues(hydrated);
}

function buildProfileTitle(values: Record<string, string>) {
  const runName = values.run_name?.trim() || 'Untitled Run';
  return `${runName}`;
}

function buildProfileSubtitle(values: Record<string, string>) {
  const observer = values.observer?.trim() || 'Observer missing';
  const date = values.date?.trim() || 'Date missing';
  return `${date} · ${observer}`;
}

function buildProfileDisplayFromFormattedText(formattedText: string) {
  const parsed = formattedText.trim() ? parseFormattedProfile(formattedText) : null;
  const runName = parsed ? getMetadataValue(parsed, 'Run Name').trim() : '';
  const date = parsed ? getMetadataValue(parsed, 'Date').trim() : '';
  const observer = parsed ? getMetadataValue(parsed, 'Observer').trim() : '';

  return {
    title: runName || 'Untitled Run',
    subtitle: `${date || 'Date missing'} · ${observer || 'Observer missing'}`,
  };
}

function buildProfileDisplayMetadata(profile: SavedProfile) {
  const sourceValues = profile.sourceValues ?? {};
  const parsed = profile.formattedText ? parseFormattedProfile(profile.formattedText) : null;
  const runName = sourceValues.run_name?.trim() || (parsed ? getMetadataValue(parsed, 'Run Name').trim() : '');
  const date = sourceValues.date?.trim() || (parsed ? getMetadataValue(parsed, 'Date').trim() : '');
  const observer = sourceValues.observer?.trim() || (parsed ? getMetadataValue(parsed, 'Observer').trim() : '');
  const pendingVoiceSubtitle = profile.pendingMessage?.trim() || 'Waiting for connection to process saved audio.';

  return {
    title: runName || (profile.pendingAction === 'process-voice-audio' ? 'Voice Notes Pending' : 'Untitled Run'),
    subtitle:
      date || observer
        ? `${date || 'Date missing'} · ${observer || 'Observer missing'}`
        : profile.pendingAction === 'process-voice-audio'
          ? pendingVoiceSubtitle
          : 'Date missing · Observer missing',
  };
}

function normalizeSavedProfile(profile: SavedProfile): SavedProfile {
  const display = buildProfileDisplayMetadata(profile);
  const nextProfile: SavedProfile = {
    ...profile,
    title: display.title,
    subtitle: display.subtitle,
    transcriptRaw: profile.transcriptRaw ?? profile.rawNotes ?? '',
    engineTextOriginal:
      profile.engineTextOriginal ??
      ((profile.sourceKind ?? (profile.rawNotes.trim() ? 'raw-notes' : 'manual')) === 'raw-notes'
        ? profile.formattedText
        : undefined),
    formatterWarnings: profile.formatterWarnings ?? [],
    pendingAction: profile.pendingAction ?? undefined,
    pendingMessage: profile.pendingMessage?.trim() || undefined,
  };

  if (
    profile.title === nextProfile.title &&
    profile.subtitle === nextProfile.subtitle &&
    profile.transcriptRaw === nextProfile.transcriptRaw &&
    profile.engineTextOriginal === nextProfile.engineTextOriginal &&
    profile.formatterWarnings === nextProfile.formatterWarnings &&
    profile.pendingAction === nextProfile.pendingAction &&
    profile.pendingMessage === nextProfile.pendingMessage
  ) {
    return profile;
  }
  return nextProfile;
}

function buildPendingVoiceNoteProfile(profileId: string, audioUri: string, sourceValues?: Record<string, string>) {
  return normalizeSavedProfile({
    id: profileId,
    title: 'Voice Notes Pending',
    subtitle: 'Waiting for connection to process saved audio.',
    createdAt: new Date().toISOString(),
    formattedText: '',
    rawNotes: '',
    transcriptRaw: '',
    sourceValues: sanitizeManualValues(sourceValues ?? {}),
    sourceKind: 'raw-notes',
    engineTextOriginal: '',
    formatterWarnings: [],
    audioUri,
    pendingAction: 'process-voice-audio',
    pendingMessage: 'Voice recording is saved in Archive locally. Retry processing when you have service again.',
  });
}

function buildProcessedVoiceNoteProfile(
  profile: SavedProfile,
  input: {
    transcriptRaw?: string;
    engineText?: string;
    resolvedValues?: Record<string, string>;
    warnings?: string[];
    audioUri?: string;
  }
) {
  const transcriptRaw = input.transcriptRaw?.trim() ?? '';
  const engineText = input.engineText?.trim() ?? '';
  const seededValues = sanitizeManualValues(
    {
      ...hydrateStructuredValuesFromFormattedText(engineText || transcriptRaw, input.resolvedValues ?? {}),
      ...(profile.sourceValues ?? {}),
    }
  );
  const formatterWarnings = Array.from(new Set([...(input.warnings ?? []), ...(profile.formatterWarnings ?? [])]));

  return normalizeSavedProfile({
    ...profile,
    title: buildProfileTitle(seededValues),
    subtitle: buildProfileSubtitle(seededValues),
    formattedText: engineText || transcriptRaw,
    rawNotes: transcriptRaw,
    transcriptRaw,
    sourceValues: seededValues,
    sourceKind: 'raw-notes',
    engineTextOriginal: engineText || transcriptRaw,
    formatterWarnings,
    audioUri: input.audioUri ?? profile.audioUri,
    renderError: undefined,
    pendingAction: undefined,
    pendingMessage: undefined,
  });
}

function buildResolvedDraftValues(rawNotes: string, values: Record<string, string>) {
  const extractedValues = rawNotes.trim() ? extractDraftValuesFromRawNotes(rawNotes) : {};
  return {
    ...extractedValues,
    ...values,
  };
}

function resolveValuesForSourceKind(
  rawNotes: string,
  values: Record<string, string>,
  sourceKind: 'manual' | 'raw-notes'
) {
  if (sourceKind === 'manual') {
    return { ...values };
  }

  return buildResolvedDraftValues(rawNotes, values);
}

function looksLikeEngineFormattedText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  const lines = trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return false;
  }

  const hasLayerLine = lines.some((line) => /^\d+(?:\.\d+)?-\d+(?:\.\d+)?\s+/.test(line));
  const hasAnyProfileSignal = lines.some((line) =>
    /^(Date|Time|Run Name|Observer|Organization|Elevation|Aspect|Slope Angle|Air Temperature|Sky|Precip|Wind|Total Hs|Surface Grain|Foot Pen|Ski Pen):/i.test(
      line
    )
  );
  const hasStabilityLikeLine = lines.some((line) => /^(CT|ECT|PST|HS|SS|RB)/i.test(line));
  const hasTemperatureLikeLine = lines.some((line) => /^-?\d+(?:\.\d+)?\s+(?:surface|\d+(?:\.\d+)?cm)$/i.test(line));

  return hasLayerLine && (hasAnyProfileSignal || hasStabilityLikeLine || hasTemperatureLikeLine);
}

function rebuildFormattedText(profile: SavedProfile) {
  const sourceKind = profile.sourceKind ?? (profile.rawNotes.trim() ? 'raw-notes' : 'manual');
  const resolvedValues = resolveValuesForSourceKind(profile.rawNotes, profile.sourceValues ?? {}, sourceKind);
  const { formattedText } = formatDraftToEngineText({
    rawNotes: profile.rawNotes,
    values: resolvedValues,
    updatedAt: new Date().toISOString(),
  });

  return {
    resolvedValues,
    formattedText,
  };
}

async function buildRawNotesFormatterOutput(rawNotes: string, sourceValues: Record<string, string>) {
  if (!isFormatterServiceConfigured()) {
    throw new Error('AI formatting requires a configured data or Wi-Fi connection.');
  }

  const response = await formatRawNotesFromServiceAsync({
    rawNotes,
    source: 'raw-notes-ai',
    formatterVersion: 'nivium-ai-v1',
  });

  return {
    formattedText: response.formattedText,
    resolvedValues: {
      ...sourceValues,
      ...(response.resolvedValues ?? {}),
    },
  };
}

async function buildProfileForRender(profile: SavedProfile) {
  if (profile.sourceKind === 'raw-notes') {
    if (hasStructuredManualValues(profile.sourceValues ?? {})) {
      return rebuildFormattedText(profile);
    }

    const persistedFormatted = profile.formattedText?.trim() ?? '';
    if (persistedFormatted) {
      return {
        formattedText: persistedFormatted,
        resolvedValues: profile.sourceValues ?? {},
      };
    }

    const originalFormatted = profile.engineTextOriginal?.trim() ?? '';
    if (originalFormatted) {
      return {
        formattedText: originalFormatted,
        resolvedValues: profile.sourceValues ?? {},
      };
    }

    const sourceValues = buildResolvedDraftValues(profile.rawNotes, profile.sourceValues ?? {});
    return buildRawNotesFormatterOutput(profile.rawNotes, sourceValues);
  }

  return rebuildFormattedText(profile);
}

export function SavedProfilesProvider({ children }: { children: React.ReactNode }) {
  const { draft, loadFreshDraft } = useProfileDraft();
  const { loadFromSavedProfile } = useVoiceNoteSession();
  const [profiles, setProfiles] = useState<SavedProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const profilesRef = useRef<SavedProfile[]>([]);

  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  useEffect(() => {
    let isMounted = true;

    async function loadProfiles() {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!stored) {
          return;
        }
        const parsed = (JSON.parse(stored) as SavedProfile[]).map(normalizeSavedProfile);
        if (isMounted) {
          profilesRef.current = parsed;
          setProfiles(parsed);
          if (parsed[0]) {
            setSelectedProfileId(parsed[0].id);
          }
        }
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      } finally {
        if (isMounted) {
          setIsLoaded(true);
        }
      }
    }

    void loadProfiles();

    return () => {
      isMounted = false;
    };
  }, []);

  const persist = async (nextProfiles: SavedProfile[]) => {
    profilesRef.current = nextProfiles;
    setProfiles(nextProfiles);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextProfiles));
  };

  const queueVoiceNoteRecording = async (audioUri: string, sourceValues?: Record<string, string>) => {
    const profileId = `${Date.now()}`;
    const storedAudioUri = await persistQueuedVoiceNoteAsync(profileId, audioUri);
    const queuedProfile = buildPendingVoiceNoteProfile(profileId, storedAudioUri, sourceValues);
    const nextProfiles = [queuedProfile, ...profilesRef.current];
    await persist(nextProfiles);
    setSelectedProfileId(queuedProfile.id);
    return queuedProfile;
  };

  const finalizePendingVoiceNoteProcessing = async (
    profileId: string,
    input: {
      transcriptRaw?: string;
      engineText?: string;
      resolvedValues?: Record<string, string>;
      warnings?: string[];
      audioUri?: string;
    }
  ) => {
    const activeProfiles = profilesRef.current;
    const profile = activeProfiles.find((entry) => entry.id === profileId);
    if (!profile) {
      return null;
    }

    const finalizedProfile = buildProcessedVoiceNoteProfile(profile, input);
    const nextProfiles = activeProfiles.map((entry) => (entry.id === profileId ? finalizedProfile : entry));
    await persist(nextProfiles);
    setSelectedProfileId(finalizedProfile.id);
    return finalizedProfile;
  };

  const retryPendingVoiceProcessing = async (profileId: string) => {
    const activeProfiles = profilesRef.current;
    const profile = activeProfiles.find((entry) => entry.id === profileId);
    if (!profile) {
      return { profile: null, error: 'Profile not found.' };
    }
    if (!profile.audioUri) {
      return { profile: null, error: 'Saved voice recording is unavailable for retry.' };
    }

    try {
      const response = await transcribeAudioFromServiceAsync({
        audioUri: profile.audioUri,
        source: 'raw-notes-audio',
        formatterVersion: 'nivium-ai-v1',
      });
      const finalizedProfile = await finalizePendingVoiceNoteProcessing(profileId, {
        transcriptRaw: response.transcript,
        engineText: response.formattedText,
        resolvedValues: response.resolvedValues,
        warnings: response.warnings,
        audioUri: profile.audioUri,
      });
      if (!finalizedProfile) {
        return { profile: null, error: 'Profile not found after voice-note retry.' };
      }
      loadFromSavedProfile(finalizedProfile);
      return { profile: finalizedProfile };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Voice-note processing failed.';
      const updatedProfile = normalizeSavedProfile({
        ...profile,
        renderError: message,
        pendingAction: 'process-voice-audio',
        pendingMessage: 'Voice recording is still saved in Archive locally. Retry processing when you have service again.',
      });
      const nextProfiles = activeProfiles.map((entry) => (entry.id === profileId ? updatedProfile : entry));
      await persist(nextProfiles);
      setSelectedProfileId(updatedProfile.id);
      return { profile: updatedProfile, error: message };
    }
  };

  const ensureProfilePdf = async (profileId: string) => {
    const profile = profiles.find((entry) => entry.id === profileId);
    if (!profile) {
      return { uri: null, error: 'Profile not found.' };
    }
    if (profile.pendingAction === 'process-voice-audio') {
      return { uri: null, error: 'This saved recording still needs voice processing before it can be rendered.' };
    }
    const shouldUpgradeReportToPlot = profile.documentKind !== 'plot' && isPlotRenderServiceConfigured();
    if (profile.pdfUri && !shouldUpgradeReportToPlot) {
      return { uri: profile.pdfUri };
    }

    try {
      const rebuilt = await buildProfileForRender(profile);
      const profileForRender = {
        ...profile,
        formattedText: rebuilt.formattedText,
        sourceValues: rebuilt.resolvedValues,
      };
      const pdf = await createRenderedProfileDocumentAsync(profileForRender);
      const updatedProfile = {
        ...profileForRender,
        pdfUri: pdf.uri,
        previewImageUri: pdf.previewImageUri ?? profile.previewImageUri,
        documentKind: pdf.documentKind,
        renderError: undefined,
        pendingAction: undefined,
        pendingMessage: undefined,
      };
      const nextProfiles = profiles.map((entry) => (entry.id === profileId ? updatedProfile : entry));
      await persist(nextProfiles);
      return { uri: pdf.uri };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown renderer error.';
      const updatedProfile: SavedProfile = {
        ...profile,
        renderError: message,
        pendingAction: 'render-profile',
        pendingMessage: 'Formatted profile data is saved in Archive locally. Retry render when you have service again.',
      };
      const nextProfiles = profiles.map((entry) => (entry.id === profileId ? updatedProfile : entry));
      await persist(nextProfiles);
      return { uri: null, error: message };
    }
  };

  const createProfileFromDraft = async (
    sourceKind?: 'manual' | 'raw-notes',
    editingProfileId?: string | null
  ) => {
    const editingProfile = editingProfileId ? profiles.find((entry) => entry.id === editingProfileId) ?? null : null;
    const effectiveSourceKind = sourceKind ?? (draft.rawNotes.trim() ? 'raw-notes' : 'manual');
    const persistedSourceKind = editingProfile?.sourceKind ?? effectiveSourceKind;
    const resolvedValues = resolveValuesForSourceKind(draft.rawNotes, draft.values, effectiveSourceKind);
    const sanitizedValues =
      effectiveSourceKind === 'manual' ? sanitizeManualValues(resolvedValues) : resolvedValues;
    const resolvedDraft = {
      ...draft,
      values: sanitizedValues,
    };
    let formatterResolvedValues = sanitizedValues;
    let formattedText = '';
    let rawNotesFormatterError: string | undefined;

    if (effectiveSourceKind === 'raw-notes') {
      try {
        const rawNotesText = draft.rawNotes.trim();
        if (looksLikeEngineFormattedText(rawNotesText)) {
          // Voice Notes may already provide engine-ready text from the formatter service.
          // Preserve it verbatim to avoid a second formatter pass introducing drift.
          formattedText = rawNotesText;
          formatterResolvedValues = resolvedValues;
        } else {
          const formatterOutput = await buildRawNotesFormatterOutput(draft.rawNotes, resolvedValues);
          formattedText = formatterOutput.formattedText;
          formatterResolvedValues = formatterOutput.resolvedValues;
        }
      } catch (error) {
        rawNotesFormatterError = error instanceof Error ? error.message : 'Unknown formatter error.';
        formatterResolvedValues = resolveValuesForSourceKind(draft.rawNotes, resolvedValues, effectiveSourceKind);
      }
    } else {
      const result = formatDraftToEngineText(resolvedDraft);
      formattedText = result.formattedText;
    }

    const createdAt = new Date().toISOString();
    const newProfile: SavedProfile = {
      id: editingProfile?.id ?? `${Date.now()}`,
      title: buildProfileTitle(formatterResolvedValues),
      subtitle: buildProfileSubtitle(formatterResolvedValues),
      createdAt: editingProfile?.createdAt ?? createdAt,
      formattedText,
      rawNotes: editingProfile?.rawNotes ?? draft.rawNotes,
      transcriptRaw: editingProfile?.transcriptRaw ?? editingProfile?.rawNotes ?? draft.rawNotes,
      sourceValues: formatterResolvedValues,
      sourceKind: persistedSourceKind,
      engineTextOriginal:
        editingProfile?.engineTextOriginal ??
        (persistedSourceKind === 'raw-notes' ? editingProfile?.formattedText ?? formattedText : undefined),
      formatterWarnings: editingProfile?.formatterWarnings ?? [],
      audioUri: editingProfile?.audioUri,
      pendingAction: undefined,
      pendingMessage: undefined,
    };

    if (!formattedText.trim()) {
      const storedProfile: SavedProfile = {
        ...newProfile,
        renderError:
          rawNotesFormatterError ||
          (effectiveSourceKind === 'raw-notes'
            ? 'Formatter could not produce engine-ready text from these raw notes.'
            : 'Formatter could not produce engine-ready text.'),
        pendingAction: undefined,
        pendingMessage: undefined,
      };
      const nextProfiles = editingProfile
        ? profiles.map((entry) => (entry.id === editingProfile.id ? storedProfile : entry))
        : [storedProfile, ...profiles];
      await persist(nextProfiles);
      if (storedProfile.sourceKind === 'raw-notes') {
        loadFromSavedProfile(storedProfile);
      }
      setSelectedProfileId(storedProfile.id);
      return storedProfile;
    }

    let storedProfile: SavedProfile;
    try {
      const profileForRender = {
        ...newProfile,
        formattedText,
        sourceValues: formatterResolvedValues,
      };
      const pdf = await createRenderedProfileDocumentAsync(profileForRender);
      storedProfile = {
        ...profileForRender,
        pdfUri: pdf.uri,
        previewImageUri: pdf.previewImageUri,
        documentKind: pdf.documentKind,
      };
    } catch (error) {
      if (!(error instanceof PlotRenderError) && effectiveSourceKind !== 'raw-notes') {
        throw error;
      }
      storedProfile = {
        ...newProfile,
        formattedText: newProfile.formattedText,
        renderError: rawNotesFormatterError || (error instanceof Error ? error.message : 'Unknown formatter or renderer error.'),
        pendingAction: newProfile.formattedText.trim() && effectiveSourceKind === 'raw-notes' ? 'render-profile' : undefined,
        pendingMessage:
          newProfile.formattedText.trim() && effectiveSourceKind === 'raw-notes'
            ? 'Formatted profile data is saved in Archive locally. Retry render when you have service again.'
            : undefined,
      };
    }

    const nextProfiles = editingProfile
      ? profiles.map((entry) => (entry.id === editingProfile.id ? storedProfile : entry))
      : [storedProfile, ...profiles];
    await persist(nextProfiles);
    if (storedProfile.sourceKind === 'raw-notes') {
      loadFromSavedProfile(storedProfile);
    }
    setSelectedProfileId(storedProfile.id);
    return storedProfile;
  };

  const createProfileFromVoiceSession = async (session: VoiceNoteSession) => {
    const editingProfile = session.profileId ? profiles.find((entry) => entry.id === session.profileId) ?? null : null;
    const reviewValues = sanitizeManualValues(session.reviewValues ?? {});
    const rebuilt = formatDraftToEngineText({
      rawNotes: session.transcriptRaw,
      values: reviewValues,
      updatedAt: new Date().toISOString(),
    });
    const formattedText = rebuilt.formattedText.trim();
    const display = buildProfileDisplayFromFormattedText(formattedText);
    const createdAt = new Date().toISOString();
    const formatterWarnings = Array.from(new Set([...(session.serviceWarnings ?? []), ...(rebuilt.warnings ?? [])]));
    const baseProfile: SavedProfile = {
      id: editingProfile?.id ?? `${Date.now()}`,
      title: display.title,
      subtitle: display.subtitle,
      createdAt: editingProfile?.createdAt ?? createdAt,
      formattedText,
      rawNotes: session.transcriptRaw,
      transcriptRaw: session.transcriptRaw,
      sourceValues: reviewValues,
      sourceKind: 'raw-notes',
      engineTextOriginal: editingProfile?.engineTextOriginal ?? (session.engineTextOriginal.trim() || formattedText),
      formatterWarnings,
      audioUri: session.audioUri,
    };
    const newProfile: SavedProfile = {
      ...baseProfile,
      sourceValues: reviewValues,
      pendingAction: undefined,
      pendingMessage: undefined,
    };

    if (!formattedText) {
      const storedProfile: SavedProfile = {
        ...newProfile,
        renderError: 'No engine-ready text is available for render.',
        pendingAction: undefined,
        pendingMessage: undefined,
      };
      const nextProfiles = editingProfile
        ? profiles.map((entry) => (entry.id === editingProfile.id ? storedProfile : entry))
        : [storedProfile, ...profiles];
      await persist(nextProfiles);
      setSelectedProfileId(storedProfile.id);
      loadFromSavedProfile(storedProfile);
      return storedProfile;
    }

    let storedProfile: SavedProfile;
    try {
      const pdf = await createRenderedProfileDocumentAsync(newProfile);
      storedProfile = {
        ...newProfile,
        pdfUri: pdf.uri,
        previewImageUri: pdf.previewImageUri,
        documentKind: pdf.documentKind,
        renderError: undefined,
      };
    } catch (error) {
      if (!(error instanceof PlotRenderError)) {
        throw error;
      }
      storedProfile = {
        ...newProfile,
        renderError: error.message || 'Unknown renderer error.',
        pendingAction: 'render-profile',
        pendingMessage: 'Formatted profile data is saved in Archive locally. Retry render when you have service again.',
      };
    }

    const nextProfiles = editingProfile
      ? profiles.map((entry) => (entry.id === editingProfile.id ? storedProfile : entry))
      : [storedProfile, ...profiles];
    await persist(nextProfiles);
    loadFromSavedProfile(storedProfile);
    setSelectedProfileId(storedProfile.id);
    return storedProfile;
  };

  const reopenProfileForEditing = async (profileId: string) => {
    const profile = profiles.find((entry) => entry.id === profileId);
    if (!profile) {
      return null;
    }

    const nextKind = profile.sourceKind ?? (profile.rawNotes.trim() ? 'raw-notes' : 'manual');
    if (nextKind === 'raw-notes') {
      loadFromSavedProfile(profile);
      setSelectedProfileId(profile.id);
      return nextKind;
    }

    const nextValues = hydrateManualValuesForEdit(profile);
    // MED edits should be driven by structured values only, not by legacy raw dictation text.
    // Keeping raw notes here can re-introduce parser noise when saving after edits.
    loadFreshDraft({
      rawNotes: '',
      values: nextValues,
    });
    setSelectedProfileId(profile.id);
    return nextKind;
  };

  const deleteProfile = async (profileId: string) => {
    const profileToDelete = profiles.find((profile) => profile.id === profileId);
    if (profileToDelete?.pdfUri) {
      try {
        await FileSystem.deleteAsync(profileToDelete.pdfUri, { idempotent: true });
      } catch {
        // Ignore cleanup errors so profile deletion still succeeds.
      }
    }
    await deleteQueuedVoiceNoteAsync(profileToDelete?.audioUri);

    const nextProfiles = profiles.filter((profile) => profile.id !== profileId);
    await persist(nextProfiles);
    setSelectedProfileId((current) => {
      if (current !== profileId) {
        return current;
      }
      return nextProfiles[0]?.id ?? null;
    });
  };

  const clearArchivePreservingSamples = async () => {
    const profilesToDelete = [...profiles];
    const nextProfiles: SavedProfile[] = [];

    await Promise.all(
      profilesToDelete.map(async (profile) => {
        if (!profile.pdfUri) {
          await deleteQueuedVoiceNoteAsync(profile.audioUri);
          return;
        }
        try {
          await FileSystem.deleteAsync(profile.pdfUri, { idempotent: true });
        } catch {
          // Ignore cleanup errors so archive cleanup still succeeds.
        }
        await deleteQueuedVoiceNoteAsync(profile.audioUri);
      })
    );

    await persist(nextProfiles);
    setSelectedProfileId(null);
    return profilesToDelete.length;
  };

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;

  return (
    <SavedProfilesContext.Provider
      value={{
        profiles,
        selectedProfileId,
        isLoaded,
        createProfileFromDraft,
        createProfileFromVoiceSession,
        queueVoiceNoteRecording,
        finalizePendingVoiceNoteProcessing,
        retryPendingVoiceProcessing,
        ensureProfilePdf,
        reopenProfileForEditing,
        deleteProfile,
        clearArchivePreservingSamples,
        setSelectedProfileId,
        selectedProfile,
      }}>
      {children}
    </SavedProfilesContext.Provider>
  );
}

export function useSavedProfiles() {
  const context = useContext(SavedProfilesContext);
  if (!context) {
    throw new Error('useSavedProfiles must be used inside SavedProfilesProvider');
  }
  return context;
}
