import type { ProfileDraft } from '@/types/profile';
import { extractDraftValuesFromRawNotes } from '@/utils/raw-note-parser';

type FormatResult = {
  formattedText: string;
  warnings: string[];
};

type MetadataConfigItem = {
  fieldId: string;
  label: string;
  suffix?: string;
  transform?: (value: string) => string;
};

const metadataConfig: MetadataConfigItem[] = [
  { fieldId: 'date', label: 'Date' },
  { fieldId: 'time', label: 'Time' },
  { fieldId: 'run_name', label: 'Run Name' },
  { fieldId: 'observer', label: 'Observer' },
  { fieldId: 'organization', label: 'Organization', transform: normalizeOrganization },
  { fieldId: 'elevation', label: 'Elevation', suffix: ' m', transform: stripNumberFormatting },
  { fieldId: 'aspect', label: 'Aspect', transform: normalizeAspect },
  { fieldId: 'slope_angle', label: 'Slope Angle', suffix: ' degrees' },
  { fieldId: 'lat_long', label: 'Lat/Long', transform: normalizeLatLong },
  { fieldId: 'air_temperature', label: 'Air Temperature' },
  { fieldId: 'sky', label: 'Sky' },
  { fieldId: 'precip', label: 'Precip' },
  { fieldId: 'wind', label: 'Wind' },
  { fieldId: 'total_hs', label: 'Total Hs', suffix: ' cm' },
  { fieldId: 'surface_grain', label: 'Surface Grain' },
  { fieldId: 'foot_pen', label: 'Foot Pen', suffix: ' cm' },
  { fieldId: 'ski_pen', label: 'Ski Pen', suffix: ' cm' },
] as const;

const layerFieldIds = [
  'layer_1',
  'layer_2',
  'layer_3',
  'layer_4',
  'layer_5',
  'layer_6',
  'layer_7',
  'layer_8',
  'layer_9',
  'layer_10',
  'layer_11',
  'layer_12',
] as const;

const structuredLayerIndexes = Array.from({ length: 12 }, (_, index) => index + 1);
const structuredTemperatureIndexes = Array.from({ length: 20 }, (_, index) => index + 1);
const structuredStabilityIndexes = Array.from({ length: 12 }, (_, index) => index + 1);

export function formatDraftToEngineText(draft: ProfileDraft): FormatResult {
  const warnings: string[] = [];
  const concernRange = normalizeConcernRange(draft.values.layer_of_concern ?? '');

  const metadataLines = metadataConfig
    .map((item) => {
      const rawValue = draft.values[item.fieldId]?.trim();
      if (!rawValue) {
        return null;
      }

      const transformed = item.transform ? item.transform(rawValue) : rawValue;
      const value = applySuffix(transformed, item.suffix);
      return `${item.label}: ${value}`;
    })
    .filter((value): value is string => Boolean(value));

  const layerSource = resolveLayerSource(draft);
  const layerLines = normalizeLayerEntries(layerSource.lines, warnings, concernRange, layerSource.isStructured);

  const temperatureLines = resolveTemperatureBlock(draft.values);
  const stabilityLines = resolveStabilityBlock(draft.values);
  const commentLines = normalizeNotesBlock(draft.values.comments ?? '');

  const sections = [
    metadataLines.join('\n'),
    layerLines.join('\n'),
    temperatureLines,
    stabilityLines,
    commentLines,
  ].filter((section) => section.trim().length > 0);

  return {
    formattedText: sections.join('\n\n'),
    warnings,
  };
}

export function formatRawNotesToEngineText(rawNotes: string): FormatResult {
  const draft: ProfileDraft = {
    rawNotes,
    values: extractDraftValuesFromRawNotes(rawNotes),
    updatedAt: new Date().toISOString(),
  };
  return formatDraftToEngineText(draft);
}

function normalizeLayerEntries(values: string[], warnings: string[], concernRange: string, isStructured: boolean) {
  const results: string[] = [];
  let previousBottom: number | null = null;
  let previousLine = '';

  for (const value of values) {
    const raw = value.trim();
    if (!raw) {
      continue;
    }

    if (isStructured) {
      const compact = normalizeSpacing(raw.replaceAll(',', ' '));
      const lineWithConcern = concernRange ? applyConcernRange(compact, concernRange) : compact;
      results.push(lineWithConcern);
      const structuredRange = compact.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)/);
      if (structuredRange) {
        previousBottom = Number(structuredRange[2]);
      }
      previousLine = lineWithConcern;
      continue;
    }

    const normalized = normalizeLayerLine(raw, previousBottom, previousLine, warnings);
    const lineWithConcern = concernRange ? applyConcernRange(normalized.line, concernRange) : normalized.line;
    results.push(lineWithConcern);
    previousBottom = normalized.bottom;
    previousLine = lineWithConcern;
  }

  return results;
}

function resolveLayerSource(draft: ProfileDraft) {
  const structured = buildStructuredLayerLines(draft.values);
  if (structured.lines.length > 0) {
    return { lines: structured.lines, isStructured: structured.usedStructuredData };
  }
  return {
    lines: layerFieldIds.map((fieldId) => draft.values[fieldId] ?? ''),
    isStructured: false,
  };
}

function buildStructuredLayerLines(values: ProfileDraft['values']) {
  const results: string[] = [];
  let usedStructuredData = false;
  let previousBottom = '';

  for (const index of structuredLayerIndexes) {
    const topField = values[`layer_${index}_top`]?.trim() ?? '';
    const bottomField = values[`layer_${index}_bottom`]?.trim() ?? '';
    const hardness1 = values[`layer_${index}_hardness_1`]?.trim() ?? '';
    const hardness2 = values[`layer_${index}_hardness_2`]?.trim() ?? '';
    const grain1 = values[`layer_${index}_grain_1`]?.trim() ?? '';
    const grain2 = values[`layer_${index}_grain_2`]?.trim() ?? '';
    const size1 = normalizeStructuredSize(values[`layer_${index}_size_1`] ?? '');
    const size2 = normalizeStructuredSize(values[`layer_${index}_size_2`] ?? '');
    const comment = values[`layer_${index}_comment`]?.trim() ?? '';
    const isConcern = values[`layer_${index}_concern`] === 'yes';
    const legacyLine = values[`layer_${index}`]?.trim() ?? '';

    const hasStructuredData = [
      topField,
      bottomField,
      hardness1,
      hardness2,
      grain1,
      grain2,
      size1,
      size2,
      comment,
      values[`layer_${index}_concern`] ?? '',
    ].some(Boolean);

    if (!hasStructuredData) {
      if (legacyLine) {
        results.push(legacyLine);
        const legacyBottomMatch = legacyLine.match(/^\d+(?:\.\d+)?-(\d+(?:\.\d+)?)/);
        previousBottom = legacyBottomMatch?.[1] ?? previousBottom;
      }
      continue;
    }
    usedStructuredData = true;

    const top = topField || previousBottom || (index === 1 ? '0' : '');
    if (!top || !bottomField) {
      continue;
    }

    previousBottom = bottomField;

    // Defensive backfill: if a structured field is missing after an edit/reopen,
    // recover it from the legacy single-line layer value instead of dropping data.
    const legacyParts = parseLegacyLayerParts(legacyLine);
    const resolvedGrain1 = grain1 || legacyParts.grain1;
    const resolvedGrain2 = grain2 || legacyParts.grain2;

    const grain = [resolvedGrain1, resolvedGrain2].filter(Boolean).join('/');
    const hardness = [hardness1, hardness2].filter(Boolean).join('-');
    const size = [size1, size2].filter(Boolean).join('/');

    const mainParts = [`${top}-${bottomField}`, grain, hardness, size, isConcern ? 'red' : ''].filter(Boolean);
    const commentPart = comment ? `| ${comment}` : '';
    results.push([mainParts.join(' '), commentPart].filter(Boolean).join(' ').trim());
  }

  return { lines: results, usedStructuredData };
}

function parseLegacyLayerParts(line: string) {
  const normalized = normalizeSpacing(line || '');
  const body = normalized.replace(/^\d+(?:\.\d+)?-\d+(?:\.\d+)?\s+/, '');
  if (!body) {
    return {
      grain1: '',
      grain2: '',
      hardness1: '',
      hardness2: '',
      size1: '',
      size2: '',
    };
  }

  const main = body.split('|')[0]?.trim() ?? '';
  const tokens = main
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);

  const grainTokens = tokens
    .flatMap((token) => token.split('/').map((part) => normalizeLegacyGrainToken(part)))
    .filter(Boolean);
  return {
    grain1: grainTokens[0] ?? '',
    grain2: grainTokens[1] ?? '',
  };
}

function normalizeLegacyGrainToken(token: string) {
  const clean = token.replace(/[.,;]+/g, '').trim();
  if (!clean) {
    return '';
  }
  const upper = clean.toUpperCase();
  if (upper === 'FCXR') return 'FCxr';
  if (upper === 'IFRC') return 'IFrc';
  if (upper === 'MFCR') return 'MFcr';
  if (upper === 'PP' || upper === 'DF' || upper === 'RG' || upper === 'FC' || upper === 'SH' || upper === 'DH' || upper === 'MF' || upper === 'IF') {
    return upper;
  }
  return '';
}


function normalizeStructuredSize(value: string) {
  const clean = normalizeSpacing(value);
  if (!clean) {
    return '';
  }
  if (/(?:mm|cm)$/i.test(clean)) {
    return clean;
  }
  return `${clean}mm`;
}

function normalizeLayerLine(
  raw: string,
  previousBottom: number | null,
  previousLine: string,
  warnings: string[]
): { line: string; bottom: number | null } {
  const compact = normalizeSpacing(raw.replaceAll(',', ' '));

  const explicitRange = compact.match(/^(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)(.*)$/i);
  if (explicitRange) {
    const originalTop = Number(explicitRange[1]);
    const bottom = Number(explicitRange[2]);
    const tail = normalizeLayerTail(explicitRange[3]?.trim() ?? '');

    const top = shouldKeepOriginalTop(originalTop, previousBottom, previousLine, tail) ? originalTop : previousBottom ?? originalTop;
    if (previousBottom !== null && originalTop !== previousBottom) {
      if (!shouldKeepOriginalTop(originalTop, previousBottom, previousLine, tail)) {
        warnings.push(`Adjusted layer start from ${formatDepth(originalTop)} to ${formatDepth(previousBottom)} to keep the profile continuous.`);
      }
    }

    if (bottom <= top) {
      warnings.push(`Layer "${compact}" has a bottom depth that is not deeper than the top depth.`);
    }

    return {
      line: [formatRange(top, bottom), tail].filter(Boolean).join(' ').trim(),
      bottom,
    };
  }

  const lowerBoundaryOnly = compact.match(/^(?:next\s+layer(?:\s+down)?\s*)?(?:to|down to)?\s*(\d+(?:\.\d+)?)(.*)$/i);
  if (lowerBoundaryOnly && previousBottom !== null) {
    const bottom = Number(lowerBoundaryOnly[1]);
    const tail = normalizeLayerTail(lowerBoundaryOnly[2]?.trim() ?? '');

    if (bottom <= previousBottom) {
      warnings.push(`Layer "${compact}" has a bottom depth that is not deeper than the layer above.`);
    }

    warnings.push(`Used ${formatDepth(previousBottom)} as the starting depth for "${compact}".`);

    return {
      line: [formatRange(previousBottom, bottom), tail].filter(Boolean).join(' ').trim(),
      bottom,
    };
  }

  warnings.push(`Could not confidently normalize layer "${compact}". It was left as entered.`);
  return {
    line: compact,
    bottom: previousBottom,
  };
}

function normalizeMultilineBlock(value: string) {
  return value
    .split('\n')
    .map((line) => normalizeSpacing(line))
    .filter(Boolean)
    .join('\n');
}

function normalizeNotesBlock(value: string) {
  return value
    .split('\n')
    .map((line) => normalizeSpacing(line))
    .filter(Boolean)
    .map((line) => `Notes: ${line}`)
    .join('\n');
}

function normalizeConcernRange(value: string) {
  const match = normalizeSpacing(value).match(/^(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)$/i);
  if (!match) {
    return '';
  }
  return `${formatDepth(Number(match[1]))}-${formatDepth(Number(match[2]))}`;
}

function normalizeTemperatureBlock(value: string) {
  return value
    .split('\n')
    .map((line) => normalizeTemperatureLine(line))
    .filter(Boolean)
    .join('\n');
}

function resolveTemperatureBlock(values: ProfileDraft['values']) {
  const structured = buildStructuredTemperatureBlock(values);
  if (structured) {
    return normalizeTemperatureBlock(structured);
  }
  return normalizeTemperatureBlock(values.temp_profile ?? '');
}

function buildStructuredTemperatureBlock(values: ProfileDraft['values']) {
  const lines: string[] = [];

  for (const index of structuredTemperatureIndexes) {
    const depth = (values[`temp_${index}_depth`] ?? '').trim();
    const temperature = (values[`temp_${index}_value`] ?? '').trim();

    if (!depth && !temperature) {
      continue;
    }
    if (!depth || !temperature) {
      continue;
    }

    const normalizedTemperature = temperature.startsWith('-') ? temperature : `-${temperature}`.replace(/^--/, '-');
    const normalizedDepth = depth === 'surface' ? 'surface' : `${depth}cm`;
    lines.push(`${normalizedTemperature} ${normalizedDepth}`);
  }

  return lines.join('\n');
}

function normalizeStabilityBlock(value: string) {
  return value
    .split('\n')
    .flatMap((line) =>
      normalizeStabilityLine(line)
        .replace(
          /\b(at\s+\d+(?:\.\d+)?\s*cm)\s+and a\s+(?=(?:CT(?:E|M|H)?\d*|ECT[PNX]?\d*|PST|HS|SS|RB\d*|DT\d*)\b)/gi,
          '$1\n'
        )
        .split('\n')
        .map((part) => part.trim())
        .filter(Boolean)
    )
    .filter(Boolean)
    .join('\n');
}

function resolveStabilityBlock(values: ProfileDraft['values']) {
  const structured = buildStructuredStabilityBlock(values);
  if (structured) {
    return normalizeStabilityBlock(structured);
  }
  return normalizeStabilityBlock(values.stability_tests ?? '');
}

function buildStructuredStabilityBlock(values: ProfileDraft['values']) {
  const lines: string[] = [];
  const seen = new Set<string>();

  for (const index of structuredStabilityIndexes) {
    const type = (values[`test_${index}_type`] ?? '').trim();
    const result = (values[`test_${index}_result`] ?? '').trim();
    const taps = (values[`test_${index}_taps`] ?? '').trim();
    const character = (values[`test_${index}_character`] ?? '').trim();
    const depth = (values[`test_${index}_depth`] ?? '').trim();
    const pstCut = (values[`test_${index}_pst_cut`] ?? '').trim();
    const pstColumn = (values[`test_${index}_pst_column`] ?? '').trim();

    if (!type && !result && !taps && !character && !depth && !pstCut && !pstColumn) {
      continue;
    }
    if (!type || !result || ((type !== 'ECT' || result !== 'ECTX') && !depth)) {
      continue;
    }

    if (type === 'CT') {
      const resultLetter = resolveCtResultLetter(result, taps);
      if (!resultLetter) {
        continue;
      }
      const line = [`CT${resultLetter}${taps}`.trim(), character, `at ${depth} cm`].filter(Boolean).join(' ');
      const key = line.trim().toUpperCase();
      if (!seen.has(key)) {
        seen.add(key);
        lines.push(line);
      }
      continue;
    }

    if (type === 'ECT') {
      if (result === 'ECTX') {
        const line = 'ECTX';
        const key = line.trim().toUpperCase();
        if (!seen.has(key)) {
          seen.add(key);
          lines.push(line);
        }
        continue;
      }
      const line = [`${result}${taps}`.trim(), character, `at ${depth} cm`].filter(Boolean).join(' ');
      const key = line.trim().toUpperCase();
      if (!seen.has(key)) {
        seen.add(key);
        lines.push(line);
      }
      continue;
    }

    if (type === 'PST') {
      if (!pstCut || !pstColumn || !depth) {
        continue;
      }
      const line = [`PST ${pstCut}/${pstColumn} ${result}`.trim(), `at ${depth} cm`].filter(Boolean).join(' ');
      const key = line.trim().toUpperCase();
      if (!seen.has(key)) {
        seen.add(key);
        lines.push(line);
      }
      continue;
    }

    if (type === 'RB') {
      const line = [result, character, depth ? `at ${depth} cm` : ''].filter(Boolean).join(' ');
      const key = line.trim().toUpperCase();
      if (!seen.has(key)) {
        seen.add(key);
        lines.push(line);
      }
      continue;
    }

    const line = [`${type} ${result.toLowerCase()}`.trim(), character, `at ${depth} cm`].filter(Boolean).join(' ');
    const key = line.trim().toUpperCase();
    if (!seen.has(key)) {
      seen.add(key);
      lines.push(line);
    }
  }

  return lines.join('\n');
}

function resolveCtResultLetter(result: string, taps: string) {
  if (result === 'auto') {
    const numericTaps = Number(taps);
    if (!Number.isFinite(numericTaps)) {
      return '';
    }
    if (numericTaps >= 1 && numericTaps <= 10) {
      return 'E';
    }
    if (numericTaps >= 11 && numericTaps <= 20) {
      return 'M';
    }
    if (numericTaps >= 21 && numericTaps <= 30) {
      return 'H';
    }
    return '';
  }

  return result[0]?.toUpperCase() ?? '';
}

function normalizeOrganization(value: string) {
  if (/sk(e|i)?na|skierna/i.test(value)) {
    return 'Skeena';
  }
  return value;
}

function normalizeAspect(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replaceAll('north east', 'northeast')
    .replaceAll('north west', 'northwest')
    .replaceAll('south east', 'southeast')
    .replaceAll('south west', 'southwest');
}

function normalizeLatLong(value: string) {
  return value.replace(/,\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function applySuffix(value: string, suffix?: string) {
  if (!suffix) {
    return value;
  }

  const normalizedSuffix = suffix.trim().toLowerCase();
  if (value.toLowerCase().endsWith(normalizedSuffix)) {
    return value;
  }

  return `${value}${suffix}`;
}

function normalizeSpacing(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeLayerTail(value: string) {
  if (!value) {
    return '';
  }

  const commentParts = value.split('|');
  const main = normalizeLayerMain(commentParts[0] ?? '');
  const comment = commentParts[1] ? normalizeSpacing(commentParts[1]) : '';
  return [main, comment ? `| ${comment}` : ''].filter(Boolean).join(' ').trim();
}

function normalizeLayerMain(value: string) {
  let text = normalizeSpacing(value);
  if (!text) {
    return text;
  }

  const isRed = /\bred\b/i.test(text);
  text = text
    .replace(/\bfrom\b/gi, '')
    .replace(/\bhardness\b/gi, '')
    .replace(/\bresistance\b/gi, '')
    .replace(/\bprimary grainform\b/gi, '')
    .replace(/\bsecondary grainform\b/gi, '')
    .replace(/\bmillimeters?\b/gi, 'mm')
    .replace(/\bmillimetres?\b/gi, 'mm')
    .replace(/\bone millimeter\b/gi, '1mm')
    .replace(/\btwo millimeters?\b/gi, '2mm')
    .replace(/\bthree millimeters?\b/gi, '3mm')
    .replace(/\bzero point five\b/gi, '0.5')
    .replace(/\bpoint five\b/gi, '0.5');

  const commentParts: string[] = [];
  const hasWetGrains = /\bwet grains?\b|\bMF\b/i.test(text);
  const grain = detectLayerGrain(text);
  const hardness = detectLayerHardness(text);
  const size = detectLayerSize(text);

  let normalized = '';
  if (grain === 'IFrc' || grain === 'MFcr') {
    normalized = [grain, hardness, 'crust'].filter(Boolean).join(' ');
    if (hasWetGrains) {
      commentParts.push('wet grains present');
    }
  } else if (grain) {
    normalized = [grain, hardness, size].filter(Boolean).join(' ');
  }

  if (!normalized) {
    text = normalizeGrains(text);
    text = normalizeHardness(text);
    text = normalizeSizes(text);
    text = normalizeCrustComments(text);
    normalized = normalizeSpacing(text);
  }

  if (isRed && !/\bred\b/i.test(normalized)) {
    normalized = `${normalized} red`.trim();
  }

  const existingWetComment = /\|\s*wet grains present/i.test(value);
  if (!existingWetComment && commentParts.length > 0 && !/\|\s*/.test(normalized)) {
    normalized = `${normalized} | ${commentParts.join('; ')}`.trim();
  }

  return normalizeSpacing(normalized);
}

function applyConcernRange(line: string, concernRange: string) {
  if (!line.startsWith(`${concernRange} `) && line !== concernRange) {
    return line;
  }
  if (/\bred\b/i.test(line)) {
    return line;
  }
  const parts = line.split('|');
  const main = `${parts[0].trim()} red`;
  const comment = parts[1] ? ` | ${parts[1].trim()}` : '';
  return `${main}${comment}`.trim();
}

function normalizeGrains(value: string) {
  let text = value;
  const replacements: [RegExp, string][] = [
    [/\bstellars?\b/gi, 'PP'],
    [/\bstellar crystals?\b/gi, 'PP'],
    [/\bef\b/gi, 'DF'],
    [/\bdecomposing fragments?\b/gi, 'DF'],
    [/\bdecomposing\b/gi, 'DF'],
    [/\bfragments?\b/gi, 'DF'],
    [/\brounds?\b/gi, 'RG'],
    [/\bfacets?\b/gi, 'FC'],
    [/\bsurface hoar\b/gi, 'SH'],
    [/\bdepth hoar\b/gi, 'DH'],
    [/\bwet grains?\b/gi, 'MF'],
    [/\brain crust\b/gi, 'IFrc'],
    [/\bdrizzle crust\b/gi, 'IFrc'],
    [/\bsun crust\b/gi, 'MFcr'],
    [/\bmelt[- ]freeze crust\b/gi, 'MFcr'],
  ];

  replacements.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });

  text = text
    .replace(/\bPP\s+and\s+DF\b/gi, 'PP/DF')
    .replace(/\bDF\s+and\s+PP\b/gi, 'DF/PP')
    .replace(/\bPP\s+and\s+FC\b/gi, 'PP/FC')
    .replace(/\bFC\s+and\s+PP\b/gi, 'FC/PP')
    .replace(/\bRG\s+and\s+FC\b/gi, 'RG/FC')
    .replace(/\bFC\s+and\s+RG\b/gi, 'FC/RG')
    .replace(/\bFC\s+and\s+DF\b/gi, 'FC/DF')
    .replace(/\bDF\s+and\s+FC\b/gi, 'DF/FC');

  return text;
}

function normalizeHardness(value: string) {
  let text = value;

  const words: [RegExp, string][] = [
    [/\bfist\b/gi, 'F'],
    [/\bfour finger\b/gi, '4F'],
    [/\b4 finger\b/gi, '4F'],
    [/\bone finger\b/gi, '1F'],
    [/\b1 finger\b/gi, '1F'],
    [/\bpencil\b/gi, 'P'],
    [/\bknife\b/gi, 'K'],
    [/\bice\b/gi, 'I'],
  ];
  words.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });

  text = text
    .replace(/\b(F|4F|1F|P|K)\s*(?:plus|plus-ish|plusish|plussy)\b/gi, '$1+')
    .replace(/\b(4F|1F|P|K|I)\s*-\b/gi, (_, hardness: string) => minusToPlusBelow(hardness))
    .replace(/\b(F|4F|1F|P|K)\s+to\s+(F|4F|1F|P|K|I)\b/gi, '$1-$2');

  return text;
}

function normalizeSizes(value: string) {
  return value
    .replace(/\b(\d+(?:\.\d+)?)\s*mm\b/gi, '$1mm')
    .replace(/\b(\d+(?:\.\d+)?)mm\s*(?:and|\/)\s*(\d+(?:\.\d+)?)mm\b/gi, '$1mm/$2mm')
    .replace(/\b(\d+(?:\.\d+)?)\s*to\s*(\d+(?:\.\d+)?)\s*mm\b/gi, '$1mm/$2mm');
}

function normalizeCrustComments(value: string) {
  let text = value;

  if (/IFrc|MFcr/.test(text) && /MF/.test(text) && !/\|/.test(text)) {
    text = text.replace(/\b(?:and\s+)?MF\b/g, '').trim();
    text = text.replace(/\s{2,}/g, ' ').trim();
    text = `${text} | wet grains present`;
  }

  if (/(IFrc|MFcr)/.test(text) && !/\bcrust\b/i.test(text)) {
    const hardnessMatch = text.match(/\b(F|4F|1F|P|K|I)\+?(?:-(F|4F|1F|P|K|I)\+?)?\b/);
    if (hardnessMatch) {
      text = text.replace(hardnessMatch[0], `${hardnessMatch[0]} crust`);
    }
  }

  return text;
}

function detectLayerGrain(value: string) {
  const text = normalizeSpacing(value.toLowerCase()).replace(/\bmdf\b/g, 'df').replace(/\bef\b/g, 'df');

  if (/\b(rain crust|drizzle crust|ifrc)\b/.test(text)) {
    return 'IFrc';
  }
  if (/\b(sun crust|melt[- ]freeze crust|mfcr)\b/.test(text)) {
    return 'MFcr';
  }

  const hasPP = /\b(pp|stellar crystals?|stellars?|stellers?)\b/.test(text);
  const hasDF = /\b(df|decomposing fragments?|decomposing|fragments?)\b/.test(text);
  const hasFC = /\b(fc|facets?)\b/.test(text);
  const hasRG = /\b(rg|rounds?)\b/.test(text);

  if (hasPP && hasFC && !hasRG) {
    return 'PP/FC';
  }
  if (hasPP && hasDF) {
    return 'PP/DF';
  }
  if (hasDF && hasPP) {
    return 'DF/PP';
  }
  if (hasFC && hasDF) {
    return 'FC/DF';
  }
  if (hasDF && hasFC) {
    return 'DF/FC';
  }
  if (hasFC && hasRG) {
    return 'FC/RG';
  }
  if (hasRG && hasFC) {
    return 'RG/FC';
  }
  if (hasFC) {
    return 'FC';
  }
  if (hasRG) {
    return 'RG';
  }
  if (hasDF) {
    return 'DF';
  }
  if (hasPP) {
    return 'PP';
  }
  if (/\b(mf|wet grains?)\b/.test(text)) {
    return 'MF';
  }
  if (/\b(sh|surface hoar)\b/.test(text)) {
    return 'SH';
  }
  if (/\b(dh|depth hoar)\b/.test(text)) {
    return 'DH';
  }

  return '';
}

function detectLayerHardness(value: string) {
  let text = value.toLowerCase();
  text = text
    .replace(/\bfrom\s+pencil\s+plus\s+to\s+knife\b/g, 'P+-K')
    .replace(/\bfrom\s+4[- ]finger\s+to\s+1[- ]finger\b/g, '4F-1F')
    .replace(/\bfrom\s+four[- ]finger\s+to\s+one[- ]finger\b/g, '4F-1F');

  const replacements: [RegExp, string][] = [
    [/\bfist\b/g, 'F'],
    [/\bfour[- ]finger\b/g, '4F'],
    [/\b4[- ]finger\b/g, '4F'],
    [/\bone[- ]finger\b/g, '1F'],
    [/\b1[- ]finger\b/g, '1F'],
    [/\bpencil\b/g, 'P'],
    [/\bknife\b/g, 'K'],
    [/\bice\b/g, 'I'],
  ];
  replacements.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });

  text = text
    .replace(/\b(F|4F|1F|P|K)\s*(?:plus|plus-ish|plusish|plussy)\b/gi, '$1+')
    .replace(/\bfrom\s+((?:F|4F|1F|P|K|I)\+?)\s+to\s+((?:F|4F|1F|P|K|I)\+?)\b/gi, '$1-$2')
    .replace(/\b((?:F|4F|1F|P|K|I)\+?)\s+to\s+((?:F|4F|1F|P|K|I)\+?)\b/gi, '$1-$2')
    .replace(/\b(F|4F|1F|P|K|I)\s+to\s+(F|4F|1F|P|K|I)\s*plus\b/gi, '$1-$2+')
    .replace(/\b(F|4F|1F|P|K|I)\s+to\s+(F|4F|1F|P|K|I)\b/gi, '$1-$2');

  const token = '(?:4F|1F|F|P|K|I)';
  const range = text.match(new RegExp(`\\b${token}(?:\\+)?\\s*-\\s*${token}(?:\\+)?(?![a-z])`, 'i'));
  if (range) {
    return range[0].replace(/\s+/g, '').toUpperCase();
  }
  const single = text.match(new RegExp(`\\b${token}(?:\\+)?(?![a-z])`, 'i'));
  if (single) {
    return single[0].replace(/\s+/g, '').toUpperCase();
  }
  return '';
}

function detectLayerSize(value: string) {
  const text = value
    .toLowerCase()
    .replace(/\bzero point five\b/g, '0.5 mm')
    .replace(/\bpoint five\b/g, '0.5 mm')
    .replace(/\bone mm\b/g, '1 mm')
    .replace(/\btwo mm\b/g, '2 mm')
    .replace(/\bthree mm\b/g, '3 mm')
    .replace(/\bone millimeters?\b/g, '1 mm')
    .replace(/\btwo millimeters?\b/g, '2 mm')
    .replace(/\bthree millimeters?\b/g, '3 mm');
  const dualSlash = text.match(/\b(\d+(?:\.\d+)?)\s*mm\s*\/\s*(\d+(?:\.\d+)?)\s*mm\b/i);
  if (dualSlash) {
    return `${dualSlash[1]}mm/${dualSlash[2]}mm`;
  }
  const dualAnd = text.match(/\b(\d+(?:\.\d+)?)\s*(?:mm|millimeters?)\s*and\s*(\d+(?:\.\d+)?)\s*(?:mm|millimeters?)\b/i);
  if (dualAnd) {
    return `${dualAnd[1]}mm/${dualAnd[2]}mm`;
  }
  const range = text.match(/\b(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*mm\b/i);
  if (range) {
    return `${range[1]}mm/${range[2]}mm`;
  }
  const single = text.match(/\b(\d+(?:\.\d+)?)\s*mm\b/i) || text.match(/\b(\d+(?:\.\d+)?)mm\b/i);
  if (single) {
    return `${single[1]}mm`;
  }
  return '';
}

function normalizeTemperatureLine(value: string) {
  let text = normalizeSpacing(value.toLowerCase());
  if (!text) {
    return '';
  }

  text = text.replace(/\bminus\s+/g, '-').replace(/\s*degrees?\b/g, '');
  text = text.replace(/\bzero\b/g, '0');
  text = text.replace(/\bcentimeters?\b/g, 'cm').replace(/\bcentimetres?\b/g, 'cm');
  text = text.replace(/\bat surface\b/g, 'surface');
  text = text.replace(/\bat zero\b/g, 'surface');
  text = text.replace(/\bat 0\b/g, 'surface');

  const surfaceMatch = text.match(/^(-?\d+(?:\.\d+)?)\s*(?:at\s*)?surface$/);
  if (surfaceMatch) {
    return `${surfaceMatch[1]} surface`;
  }

  const depthFirst = text.match(/^(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*cm$/);
  if (depthFirst) {
    return `${depthFirst[1]} ${depthFirst[2]}cm`;
  }

  const spoken = text.match(/^(-?\d+(?:\.\d+)?)\s+at\s+(\d+(?:\.\d+)?)\s*cm$/);
  if (spoken) {
    return `${spoken[1]} ${spoken[2]}cm`;
  }

  return normalizeSpacing(value);
}

function normalizeStabilityLine(value: string) {
  let text = normalizeSpacing(value);
  if (!text) {
    return '';
  }

  text = text
    .replace(/^a stability test\s*/i, '')
    .replace(/^a\s+(?=CT\b|SS\b|HS\b|compression test|shear test)/i, '')
    .replace(/\band the stability test[:, ]*/gi, '')
    .replace(/\band a second test[:, ]*/gi, '')
    .replace(/\band another stability test[:, ]*/gi, '')
    .replace(/\bstability tests?[:, ]*/gi, '')
    .replace(/\banother stability test[:, ]*/gi, '')
    .replace(/,/g, ' ')
    .replace(/\bcompression test\b/gi, 'CT')
    .replace(/\bshear test\b/gi, 'SS')
    .replace(/\bshovel shear\b/gi, 'SS')
    .replace(/\bhand shear\b/gi, 'HS')
    .replace(/\bsudden collaps(?:e)?\b/gi, 'SC')
    .replace(/\bsudden collapse\b/gi, 'SC')
    .replace(/\bsudden planar\b/gi, 'SP')
    .replace(/\bprogressive compression\b/gi, 'PC')
    .replace(/\bresistant planar\b/gi, 'RP')
    .replace(/\b(?:break|uneven break|irregular break|non-planar break)\b/gi, 'BRK');

  text = text
    .replace(/\bextended column test\b/gi, 'ECT')
    .replace(/\bpropagation saw test\b/gi, 'PST')
    .replace(/\bpropagates\b/gi, 'ECTP')
    .replace(/\bnon-propagating\b/gi, 'ECTN')
    .replace(/\bno fracture\b/gi, 'ECTX')
    .replace(/\bend\b/gi, 'END')
    .replace(/\barr\b/gi, 'ARR');

  text = text.replace(/\bCT\s+(easy|moderate|hard)\s+(\d{1,2})/gi, (_, result: string, taps: string) => {
    const letter = result[0].toUpperCase();
    return `CT${letter}${taps}`;
  });

  text = text.replace(/\bCT\s+(easy|moderate|hard)\b/gi, (_, result: string) => {
    const letter = result[0].toUpperCase();
    return `CT${letter}`;
  });

  text = text.replace(/\bSS\s+(easy|moderate|hard)\b/gi, (_, result: string) => `SS ${result.toLowerCase()}`);
  text = text.replace(/\bHS\s+(easy|moderate|hard)\b/gi, (_, result: string) => `HS ${result.toLowerCase()}`);
  text = text.replace(/\b(\d{1,2})\s*taps?\b/gi, '$1');
  text = text.replace(/\btaps?\b/gi, '');
  text = text.replace(/\s+at\s+(\d+(?:\.\d+)?)\s*centimeters?\b/gi, ' at $1 cm');
  text = text.replace(/\s+at\s+(\d+(?:\.\d+)?)\s*cm\b/gi, ' at $1 cm');
  text = text.replace(/^at\s+(\d+(?:\.\d+)?)\s*(?:cm|centimeters?)\s+(CT\w+\s+\w+)/i, '$2 at $1 cm');
  text = text.replace(/\bat\s+(\d+(?:\.\d+)?)\s*(?:cm|centimeters?)\s+(CT\w+\s+\w+)/i, '$2 at $1 cm');
  text = text.replace(/\b(SS\s+\w+)\s+at\s+(\d+(?:\.\d+)?)\s*cm\s+SC(?:\s+also)?/i, '$1 SC at $2 cm');
  text = text.replace(/^a\s+/i, '');

  text = text
    .replace(/\bECT\s+ECTP\s*(\d{1,2})\s*([A-Z]{2,3})?\s*at\s*(\d+(?:\.\d+)?)\s*cm\b/i, (_, taps: string, fc: string, depth: string) =>
      [`ECTP${taps}`, fc, `at ${depth} cm`].filter(Boolean).join(' ')
    )
    .replace(/\bECTP\s*(\d{1,2})\s*([A-Z]{2,3})?\s*at\s*(\d+(?:\.\d+)?)\s*cm\b/i, (_, taps: string, fc: string, depth: string) =>
      [`ECTP${taps}`, fc, `at ${depth} cm`].filter(Boolean).join(' ')
    )
    .replace(/\bECTN\s*(\d{1,2})\s*([A-Z]{2,3})?\s*at\s*(\d+(?:\.\d+)?)\s*cm\b/i, (_, taps: string, fc: string, depth: string) =>
      [`ECTN${taps}`, fc, `at ${depth} cm`].filter(Boolean).join(' ')
    )
    .replace(/\bECTX\s*at\s*(\d+(?:\.\d+)?)\s*cm\b/i, (_, depth: string) => `ECTX at ${depth} cm`)
    .replace(/\bPST\s+(\d+(?:\.\d+)?)\s*cut on a\s*(\d+(?:\.\d+)?)\s*centimeter column\s*(END|ARR)\s*at\s*(\d+(?:\.\d+)?)\s*cm\b/i, (_, cut: string, total: string, result: string, depth: string) =>
      `PST ${cut}/${total} ${result} at ${depth} cm`
    )
    .replace(/\bPST\s+(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*(END|ARR)\s*at\s*(\d+(?:\.\d+)?)\s*cm\b/i, (_, cut: string, total: string, result: string, depth: string) =>
      `PST ${cut}/${total} ${result} at ${depth} cm`
    );

  return normalizeSpacing(text);
}

function minusToPlusBelow(hardness: string) {
  const map: Record<string, string> = {
    '4F': 'F+',
    '1F': '4F+',
    P: '1F+',
    K: 'P+',
    I: 'K+',
  };
  return map[hardness] ?? hardness;
}

function formatRange(top: number, bottom: number) {
  return `${formatDepth(top)}-${formatDepth(bottom)}`;
}

function shouldKeepOriginalTop(originalTop: number, previousBottom: number | null, previousLine: string, tail: string) {
  if (previousBottom === null || originalTop === previousBottom) {
    return true;
  }

  return false;
}

function formatDepth(value: number) {
  return Number.isInteger(value) ? `${value}` : `${value}`;
}

function stripNumberFormatting(value: string) {
  return value.replace(/,/g, '');
}
