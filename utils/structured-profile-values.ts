import { getMetadataValue, parseFormattedProfile } from '@/utils/profile-document';

const LAYER_GRAIN_CODES = new Set(['PP', 'DF', 'RG', 'FC', 'FCxr', 'SH', 'DH', 'MF', 'IF', 'IFrc', 'MFcr']);
const LAYER_HARDNESS_CODES = new Set(['F', 'F+', '4F', '4F+', '1F', '1F+', 'P', 'P+', 'K', 'K+', 'I']);
const STABILITY_TYPES = new Set(['CT', 'SS', 'HS', 'ECT', 'PST', 'RB']);
const STABILITY_CHARACTERS = new Set(['SC', 'SP', 'PC', 'RP', 'BRK']);

function setIfMissing(target: Record<string, string>, key: string, value: string | undefined) {
  const clean = value?.trim() ?? '';
  if (!clean || (target[key] ?? '').trim()) {
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

export function sanitizeStructuredValues(values: Record<string, string>) {
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
  const hardnessTokens = tokens.flatMap((token) => extractLegacyHardnessTokens(token));
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

function seedStructuredValuesFromSource(target: Record<string, string>, sourceValues: Record<string, string>) {
  Object.entries(sourceValues).forEach(([key, value]) => {
    if (!value?.trim()) {
      return;
    }
    if (
      /^(?:date|time|run_name|observer|organization|elevation|aspect|slope_angle|lat_long|air_temperature|sky|precip|wind|total_hs|surface_grain|foot_pen|ski_pen|comments|layer_\d+_(?:top|bottom|grain_[12]|hardness_[12]|size_[12]|comment|concern)|layer_count|temp_\d+_(?:depth|value)|temp_count|test_\d+_(?:type|result|taps|character|depth|pst_cut|pst_column)|test_count)$/.test(
        key
      )
    ) {
      target[key] = value.trim();
    }
  });
}

export function hydrateStructuredValuesFromFormattedText(
  formattedText: string,
  sourceValues: Record<string, string> = {}
) {
  const hydrated: Record<string, string> = {};
  seedStructuredValuesFromSource(hydrated, sourceValues);

  const parsed = formattedText.trim() ? parseFormattedProfile(formattedText) : null;
  if (parsed) {
    parsed.layers.slice(0, 12).forEach((line, index) => {
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
    setIfMissing(hydrated, 'layer_count', `${Math.max(parsed.layers.length, 1)}`);

    parsed.temperatures.slice(0, 20).forEach((line, index) => {
      const parsedTemp = parseTemperatureLine(line);
      if (!parsedTemp) {
        return;
      }
      const slot = index + 1;
      setIfMissing(hydrated, `temp_${slot}_depth`, parsedTemp.depth);
      setIfMissing(hydrated, `temp_${slot}_value`, parsedTemp.value);
    });
    setIfMissing(hydrated, 'temp_count', `${Math.max(parsed.temperatures.length, 1)}`);

    parsed.stabilityTests.slice(0, 12).forEach((line, index) => {
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
    setIfMissing(hydrated, 'test_count', `${Math.max(parsed.stabilityTests.length, 1)}`);

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
    setIfPresent(hydrated, 'comments', extractCommentsFromFormattedText(formattedText));
  }

  return sanitizeStructuredValues(hydrated);
}
