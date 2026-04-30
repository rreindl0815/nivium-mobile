import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { formatDraftToEngineText, formatRawNotesToEngineText } from '../utils/formatter';
import { extractDraftValuesFromRawNotes } from '../utils/raw-note-parser';
import type { ProfileDraft } from '../types/profile';
import type { FormatterRequest, FormatterResponse } from '../types/formatter-service';

const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_FORMATTER_TIMEOUT_MS || 45000);

function json(res: import('node:http').ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': String(Buffer.byteLength(body)),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(body);
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim() ?? '';
const OPENAI_MODEL = process.env.OPENAI_FORMATTER_MODEL?.trim() || 'gpt-4.1-mini';
const OPENAI_TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || 'gpt-4o-mini-transcribe';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1';
const FORMATTER_AUDIT_DIR = process.env.NIVIUM_FORMATTER_AUDIT_DIR?.trim() || '/tmp/nivium-formatter-audit';
const TRANSCRIBE_CACHE_MAX = Number(process.env.NIVIUM_TRANSCRIBE_CACHE_MAX || 100);
const transcribeResponseCache = new Map<string, FormatterResponse & { transcript: string }>();

const FORMATTER_SYSTEM_PROMPT = `You are Nivium's snow-profile formatter.

Your job is to convert messy avalanche field dictation into engine-ready text for the Nivium renderer.

Return exactly one JSON object with:
- formattedText: string
- warnings: string[]

Do not return markdown.
Do not return explanations.

formattedText structure:
1. metadata lines first
2. blank line
3. snowpack layer lines
4. blank line
5. temperature lines when present
6. blank line
7. stability-test lines when present
8. blank line
9. Notes: ... lines when present

General rules:
- Be conservative.
- If a detail is missing or ambiguous, omit it rather than inventing it.
- Preserve avalanche shorthand and snow-science terminology when clear.
- Omit missing metadata lines entirely.
- Never guess unknown terms.
- If a spoken term is truly unknown, omit it and add a warning.
- Keep output compact, engine-ready, and render-safe.

Metadata labels must use exact spelling:
- Date:
- Time:
- Run Name:
- Observer:
- Organization:
- Elevation: ... m
- Aspect:
- Slope Angle: ... degrees
- Lat/Long:
- Air Temperature:
- Sky:
- Precip:
- Wind:
- Total Hs: ... cm
- Surface Grain:
- Foot Pen: ... cm
- Ski Pen: ... cm

Metadata rules:
- If raw notes say "Skina", normalize Organization to "Skeena".
- If a value is missing, omit the entire line.
- Do not invent values.
- Aspect must be full lowercase words only:
  north, south, east, west, northeast, northwest, southeast, southwest
- Do not abbreviate aspect.
- Wind direction should remain uppercase if abbreviated: N, S, E, W, NE, NW, SE, SW.
- Preserve spoken wind speed words like calm, light, mod, strong when clear.
- Lat/Long must contain both coordinates if provided.
- Never include a comma between latitude and longitude.
- If hemisphere letters are missing, preserve the coordinates as spoken but remove the comma.
- Temperature metadata should not include a degree symbol.

Layer format:
- One layer per line.
- Format:
  start-end GRAIN HARDNESS SIZE [red] [| comment]

Examples:
- 0-5 DF/FC 4F 1mm/1mm | stellar facet mix
- 5-7 IFrc K crust | drizzle crust
- 7-15 RG 4F+ 1mm
- 15-30 IFrc I crust
- 30-50 RG/FC P 1mm/0.5mm
- 50-52 FC 4F 3mm red
- 52-120 RG P+ 1mm

Continuity rule:
- Keep the profile continuous.
- If one layer ends at X and the next spoken layer starts at X+1, use X as the next start unless the dictation clearly indicates a real gap.

Grain rules:
- Preserve dual grains when two spoken grainforms are provided, unless the crust exception applies.
- Keep spoken grain order.
- No spaces around "/".

Spoken grain mappings:
- stellars / stellar / stellar crystals -> PP
- rounds -> RG
- facets -> FC
- EF -> DF
- decomposing / decomposing fragments -> DF
- surface hoar / surface whore / surface horror / surface wear / surface wore / surface war / surface oar / surface hour -> SH
- depth hoar -> DH
- rain crust / drizzle crust -> IFrc
- melt-freeze crust / sun crust -> MFcr
- wet grains -> MF

Examples:
- stellar and DF -> PP/DF
- rounds and facets -> RG/FC
- facets and decomposing -> FC/DF
- stellars and facets -> PP/FC

Crust exception:
- If either grainform is IFrc or MFcr:
  - output the crust as a single grain
  - append "crust" immediately after hardness
  - move the secondary material into the comment

Example:
- rain crust with wet grains
  -> 42-55 IFrc K crust | wet grains present

Size rules:
- Single size examples: 0.5mm, 1mm, 2mm, 12mm, 3cm
- Dual size examples: 2mm/1mm
- No "S" prefix.
- If grain is dual and both sizes are known, keep both sizes in grain order.
- If grain is dual and only one size is known, duplicate it.
- If no size was mentioned, omit size entirely.

Hardness rules:
- Allowed base hardness: F, 4F, 1F, P, K, I
- Spoken mapping:
  - fist -> F
  - four finger -> 4F
  - one finger -> 1F
  - pencil -> P
  - knife -> K
  - ice -> I
- Preserve explicit transitions like:
  - 4F to 1F -> 4F-1F
- Use plus notation when clearly spoken:
  - F+, 4F+, 1F+, P+, K+
- Never output minus notation like 1F- or P-.
- Convert minus-ish values downward:
  - 4F- -> F+
  - 1F- -> 4F+
  - P- -> 1F+
  - K- -> P+
  - I- -> K+

Red-layer rule:
- If notes specify a layer of concern from X to Y cm, find the exact matching layer and append red before any comment.
- If no exact layer matches, omit the red marker and add a warning.
- If guide says "red" immediately after a described layer, mark that same layer red.
- If guide says "layer of concern" without bounds, treat the most recently described layer as red.

Layer comments:
- Append comments as:
  | comment text
- Keep wording close to the dictation.
- Do not invent comments.
- Do not turn grain names into comments unless the notes explicitly described them as comments.
- Never output a literal comment like "layer of concern"; mark the matching layer red instead.

Temperature lines:
- One per line.
- Format:
  -4 surface
  -3 10cm
  -1 50cm
- No degree symbol.
- Use "surface" for the surface measurement.
- Convert spoken "minus" to negative.

Stability tests:
- One per line.
- All stability lines must include "at {depth} cm".

Fracture character mapping:
- sudden planar -> SP
- sudden collapse -> SC
- progressive compression -> PC
- resistant planar -> RP
- break / uneven break / irregular break / non-planar break -> BRK

CT format:
- CT{E|M|H}{taps} [fracture] at {depth} cm
- Tap mapping:
  - 1-10 -> E
  - 11-20 -> M
  - 21-30 -> H

ECT format:
- propagates -> ECTP
- non-propagating -> ECTN
- no fracture -> ECTX

PST format:
- PST {cut}/{total} {END|ARR} at {depth} cm

HS format:
- HS easy at {depth} cm
- HS moderate at {depth} cm
- HS hard at {depth} cm

SS format:
- SS easy [fracture] at {depth} cm
- SS moderate [fracture] at {depth} cm
- SS hard [fracture] at {depth} cm

RB format:
- RB{score} [fracture] at {depth} cm

Notes:
- General notes must appear only as:
  Notes: ...
- Never merge general notes into metadata.
- Never merge general notes into a layer unless the notes explicitly target that layer.

Worked examples to follow strictly:

Input:
Date: February 19, 2026 at 12:30. Run name: Ball Steep. Observer: Martin W./Hannes. Organization: Skina. Elevation: 1,385 meters. Aspect: East. Slope angle: 38 degrees. Air temperature: minus 18. Sky: few. Precip: nil. Wind: calm. Total HS: 250. Foot pen: 20 centimeters. Correction: foot pen 45 centimeters. Ski pen: 20 centimeters. Layer 1: from 0 to 10 centimeters. Stellar and DF. Fist hardness. Layer 2: from 10 centimeters to 38 centimeters. DF. Hardness is from fist to four-finger plus. Next layer, from 38 to 40 centimeters, a rain crust, knife hardness. 40 centimeters to 42 centimeters, facets, four-finger hardness. 42 centimeters to 55 centimeters, rain crust, knife hardness. As a second grain form, put wet grains in there also. Next layer, 55 to 60 centimeters, rounds, one millimeter, pencil hardness. Next layer, from 60 to 70 centimeters, wet grains and rain crust, knife hardness. And last layer from 70 centimeters to 120 centimeters, rounds, one millimeters, pencil hardness. Layer of concern is from 40 to 42 centimeters. Stability tests, compression test, moderate, 15 taps, sudden collapse at 41 centimeters. And another stability test, compression test, hard. 27 taps at 102 centimeters. 55°45'13", -128°10'51" add in surfacegrain as stellars

Output:
Date: February 19, 2026
Time: 12:30
Run Name: Ball Steep
Observer: Martin W./Hannes
Organization: Skeena
Elevation: 1385 m
Aspect: east
Slope Angle: 38 degrees
Lat/Long: 55°45'13" -128°10'51"
Air Temperature: -18
Sky: few
Precip: nil
Wind: calm
Total Hs: 250 cm
Surface Grain: PP
Foot Pen: 45 cm
Ski Pen: 20 cm

0-10 PP/DF F
10-38 DF F-4F+
38-40 IFrc K crust
40-42 FC 4F red
42-55 IFrc K crust | wet grains present
55-60 RG P 1mm
60-70 IFrc K crust | wet grains present
70-120 RG P 1mm

CTM15 SC at 41 cm
CTH27 at 102 cm

Input:
Date: 12th of February 2026 at 14:00. Run name: Star Catcher. Observer: Martin W slash Martin K. Organization: Skina. Elevation: 1350 meters. Aspect: West. Slope angle: 25 degrees. Air temperature: minus 8. Sky cover: OVC. No precip. Wind: Southwest, moderate. Total Hs: 320 centimeters. Foot pen: 50 centimeters, ski pen: 30 centimeters. Layer 1, 0 to 50 centimeters, stellars and DF from fist to four-finger resistance. Layer 2, from 50 to 60 centimeters. Rain crust, ice hardness, from 60 to 65 centimeters, facets, 2 millimeters, four-finger hardness. 65 to 80 centimeters, rain crust, knife hardness. From 80 to 100 centimeters, rounds, 1 millimeter, one-finger hardness. 100 to 101, sun crust, ice resistance. 101 to 140 centimeters, rounds, 1 millimeter, one-finger resistance. Add a comment in the 100 to 101 centimeter. January 14th, crust. stability test: compression test moderate, 16 taps, sudden collapse at 62 centimeters. 55°51'14", -128°04'17"

Output:
Date: February 12, 2026
Time: 14:00
Run Name: Star Catcher
Observer: Martin W/Martin K
Organization: Skeena
Elevation: 1350 m
Aspect: west
Slope Angle: 25 degrees
Lat/Long: 55°51'14" -128°04'17"
Air Temperature: -8
Sky: OVC
Precip: nil
Wind: SW moderate
Total Hs: 320 cm
Foot Pen: 50 cm
Ski Pen: 30 cm

0-50 PP/DF F-4F
50-60 IFrc I crust
60-65 FC 4F 2mm
65-80 IFrc K crust
80-100 RG 1mm 1F
100-101 MFcr I crust | January 14th, crust
101-140 RG 1mm 1F

CTM16 SC at 62 cm

Final rule:
- Output only the final JSON object.
- formattedText must be directly renderable by the current Nivium renderer.
- Prefer the Skeena-style parsing behavior above, while preserving Nivium compatibility and compactness.
`;

const FORMATTER_SCHEMA = {
  name: 'nivium_formatter_output',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      formattedText: {
        type: 'string',
      },
      warnings: {
        type: 'array',
        items: {
          type: 'string',
        },
      },
    },
    required: ['formattedText', 'warnings'],
  },
} as const;

function normalizeWindMetadataValue(value: string) {
  const normalized = value
    .replace(/\bfrom the\b/gi, '')
    .replace(/\bfrom\b/gi, '')
    .replace(/\bsouthwest\b/gi, 'SW')
    .replace(/\bsoutheast\b/gi, 'SE')
    .replace(/\bnorthwest\b/gi, 'NW')
    .replace(/\bnortheast\b/gi, 'NE')
    .replace(/\bwest\b/gi, 'W')
    .replace(/\beast\b/gi, 'E')
    .replace(/\bnorth\b/gi, 'N')
    .replace(/\bsouth\b/gi, 'S')
    .replace(/[.,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized.replace(/\bmod(?:erate)?\b/gi, (word) => (/^[A-Z]/.test(word) ? 'Moderate' : 'moderate'));
}

function postProcessFormattedText(formattedText: string) {
  return formattedText
    .split('\n')
    .map((line) => {
      if (/^Wind:/i.test(line)) {
        const value = line.replace(/^Wind:\s*/i, '');
        return `Wind: ${normalizeWindMetadataValue(value)}`;
      }
      return line;
    })
    .join('\n');
}

function extractLayerLines(formattedText: string) {
  return formattedText
    .split('\n')
    .filter((line) => /^\d+(?:\.\d+)?-\d+(?:\.\d+)?\s+/.test(line.trim()));
}

function extractSectionLines(formattedText: string) {
  const metadata: string[] = [];
  const layers: string[] = [];
  const temperatures: string[] = [];
  const stability: string[] = [];
  const notes: string[] = [];

  formattedText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      if (/^[^:]+:\s*.+$/.test(line)) {
        if (/^Notes:/i.test(line)) {
          notes.push(line);
          return;
        }
        metadata.push(line);
        return;
      }
      if (/^\d+(?:\.\d+)?-\d+(?:\.\d+)?\s+/.test(line)) {
        layers.push(line);
        return;
      }
      if (/^-?\d+(?:\.\d+)?\s+(?:surface|\d+(?:\.\d+)?cm)$/i.test(line)) {
        temperatures.push(line);
        return;
      }
      if (/^(CT|ECT|PST|HS|SS|DT|RB)/i.test(line)) {
        stability.push(line);
        return;
      }
      notes.push(line);
    });

  return { metadata, layers, temperatures, stability, notes };
}

function mergeMetadataLines(localLines: string[], aiLines: string[]) {
  const byLabel = new Map<string, string>();

  localLines.forEach((line) => {
    const label = line.split(':')[0]?.trim();
    if (label) {
      byLabel.set(label, line);
    }
  });

  aiLines.forEach((line) => {
    const label = line.split(':')[0]?.trim();
    if (label) {
      byLabel.set(label, line);
    }
  });

  const preferredOrder = [
    'Date',
    'Time',
    'Run Name',
    'Observer',
    'Organization',
    'Elevation',
    'Aspect',
    'Slope Angle',
    'Lat/Long',
    'Air Temperature',
    'Sky',
    'Precip',
    'Wind',
    'Total Hs',
    'Surface Grain',
    'Foot Pen',
    'Ski Pen',
  ];

  return preferredOrder.map((label) => byLabel.get(label)).filter((line): line is string => Boolean(line));
}

function mergeFormatterSections(formattedText: string, rawNotes: string) {
  const localParsedValues = extractDraftValuesFromRawNotes(rawNotes);
  const localFormatted = formatDraftToEngineText({
    rawNotes,
    values: localParsedValues,
    updatedAt: new Date().toISOString(),
  }).formattedText;

  const aiSections = extractSectionLines(formattedText);
  const localSections = extractSectionLines(localFormatted);

  const metadata = mergeMetadataLines(localSections.metadata, aiSections.metadata);
  const layers = mergeLayerLines(localSections.layers, aiSections.layers);
  const temperatures =
    aiSections.temperatures.length > 0 ? aiSections.temperatures : localSections.temperatures;
  const stability = mergeStabilityLines(localSections.stability, aiSections.stability);
  const notes =
    aiSections.notes.length > 0
      ? sanitizeNotes(aiSections.notes)
      : sanitizeNotes(localSections.notes);

  return [metadata.join('\n'), layers.join('\n'), temperatures.join('\n'), stability.join('\n'), notes.join('\n')]
    .filter((section) => section.trim().length > 0)
    .join('\n\n');
}

function layerRangeKey(line: string) {
  const match = line.trim().match(/^(\d+(?:\.\d+)?-\d+(?:\.\d+)?)\s+/);
  return match?.[1] ?? '';
}

function parseLayerRange(key: string) {
  const match = key.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
  if (!match) {
    return null;
  }
  return { top: Number(match[1]), bottom: Number(match[2]) };
}

function rangesOverlap(a: string, b: string) {
  const ra = parseLayerRange(a);
  const rb = parseLayerRange(b);
  if (!ra || !rb) {
    return false;
  }
  return ra.top < rb.bottom && rb.top < ra.bottom;
}

function mergeLayerLines(localLines: string[], aiLines: string[]) {
  if (aiLines.length === 0) {
    return localLines.map(sanitizeLayerLine);
  }
  if (localLines.length === 0) {
    return aiLines.map(sanitizeLayerLine);
  }

  const aiByRange = new Map(
    aiLines
      .map((line) => [layerRangeKey(line), sanitizeLayerLine(line)] as const)
      .filter(([key]) => Boolean(key))
  );

  const merged = localLines.map((localLineRaw) => {
    const localLine = sanitizeLayerLine(localLineRaw);
    const key = layerRangeKey(localLine);
    if (!key || !aiByRange.has(key)) {
      return localLine;
    }
    const aiLine = aiByRange.get(key)!;
    if (/\bEF\b/.test(aiLine) && !/\bEF\b/.test(localLine)) {
      return localLine;
    }
    if (/\blayer of concern\b/i.test(aiLine) && !/\blayer of concern\b/i.test(localLine)) {
      return localLine;
    }
    return aiLine;
  });

  const localRanges = new Set(localLines.map((line) => layerRangeKey(sanitizeLayerLine(line))).filter(Boolean));
  aiLines.forEach((aiLineRaw) => {
    const aiLine = sanitizeLayerLine(aiLineRaw);
    const key = layerRangeKey(aiLine);
    if (!key || localRanges.has(key)) {
      return;
    }
    for (const localRange of localRanges) {
      if (rangesOverlap(key, localRange)) {
        return;
      }
    }
    merged.push(aiLine);
  });

  return merged;
}

function stabilityLineKey(line: string) {
  const normalized = line.trim().replace(/\s+/g, ' ');
  const type = normalized.match(/^(CT(?:E|M|H)?|ECT[PNX]?|PST|HS|SS|RB|DT)\b/i)?.[1]?.toUpperCase() ?? normalized;
  const depth = normalized.match(/\bat\s+(\d+(?:\.\d+)?)\s*cm\b/i)?.[1] ?? '';
  return `${type}@${depth}`;
}

function stabilityDepth(line: string) {
  return line.trim().replace(/\s+/g, ' ').match(/\bat\s+(\d+(?:\.\d+)?)\s*cm\b/i)?.[1] ?? '';
}

function mergeStabilityLines(localLines: string[], aiLines: string[]) {
  const sanitizedLocalLines = localLines.filter((line) => !isMalformedPseudoStability(line));
  const sanitizedAiLines = aiLines.filter((line) => !isMalformedPseudoStability(line));

  if (sanitizedAiLines.length === 0) {
    return sanitizedLocalLines;
  }
  if (sanitizedLocalLines.length === 0) {
    return sanitizedAiLines;
  }

  const localByDepth = new Map(
    sanitizedLocalLines
      .map((line) => [stabilityDepth(line), line] as const)
      .filter(([depth]) => Boolean(depth))
  );

  const merged = sanitizedAiLines.filter((aiLine) => {
    const depth = stabilityDepth(aiLine);
    if (!depth) {
      return true;
    }
    const localLine = localByDepth.get(depth);
    if (!localLine) {
      return true;
    }
    return stabilityLineKey(aiLine) === stabilityLineKey(localLine);
  });

  const seen = new Set(merged.map((line) => stabilityLineKey(line)).filter(Boolean));

  sanitizedLocalLines.forEach((localLine) => {
    const key = stabilityLineKey(localLine);
    if (!key || seen.has(key)) {
      return;
    }
    merged.push(localLine);
    seen.add(key);
  });

  return merged;
}

function sanitizeLayerLine(line: string) {
  let sanitized = line.replace(/\bEF\b/gi, 'DF');
  if (!/\blayer of concern\b/i.test(sanitized)) {
    return sanitized;
  }

  const [mainPart, commentPart] = sanitized.split('|');
  const main = mainPart.replace(/\blayer of concern\b/gi, '').replace(/\s+/g, ' ').trim();
  const comment = (commentPart ?? '').replace(/\blayer of concern\b/gi, '').replace(/\s+/g, ' ').trim();
  const needsRed = !/\bred\b/i.test(main);
  const rebuiltMain = `${main}${needsRed ? ' red' : ''}`.replace(/\s+/g, ' ').trim();
  return [rebuiltMain, comment ? `| ${comment}` : ''].filter(Boolean).join(' ').trim();
}

function isMalformedPseudoStability(line: string) {
  const normalized = line.trim().replace(/\s+/g, ' ');
  const looksLikeDepthLine = /\bat\s+\d+(?:\.\d+)?\s*cm\b/i.test(normalized);
  const hasFracture = /\b(SC|SP|RP|PC|BRK)\b/i.test(normalized);
  const isValidPrefix = /^(CT(?:E|M|H)?\d*|ECT[PNX]?\d*|PST|HS|SS|RB\d*|DT\d*)\b/i.test(normalized);
  return looksLikeDepthLine && hasFracture && !isValidPrefix;
}

function sanitizeNotes(lines: string[]) {
  return lines.filter((line) => !/^Notes:\s*\.\.\.$/i.test(line) && !isMalformedPseudoStability(line));
}

function hasDualGrainAndDualSize(line: string) {
  return /\b[A-Z][A-Za-z]*\/[A-Z][A-Za-z]*\b/.test(line) && /\b\d+(?:\.\d+)?(?:mm|cm)\/\d+(?:\.\d+)?(?:mm|cm)\b/.test(line);
}

function isMissingSecondSize(aiLine: string, localLine: string) {
  const aiHasAnySlashSize = /\b\d+(?:\.\d+)?(?:mm|cm)\/\d+(?:\.\d+)?(?:mm|cm)\b/.test(aiLine);
  const localHasDualSize = hasDualGrainAndDualSize(localLine);
  return localHasDualSize && !aiHasAnySlashSize;
}

function patchDualSizeLayerLines(formattedText: string, rawNotes: string) {
  const localParsedValues = extractDraftValuesFromRawNotes(rawNotes);
  const localFormatted = formatDraftToEngineText({
    rawNotes,
    values: localParsedValues,
    updatedAt: new Date().toISOString(),
  }).formattedText;

  const localLayerMap = new Map(
    extractLayerLines(localFormatted)
      .map((line) => [layerRangeKey(line), line] as const)
      .filter(([key]) => Boolean(key))
  );

  return formattedText
    .split('\n')
    .map((line) => {
      const key = layerRangeKey(line);
      if (!key) {
        return line;
      }
      const localLine = localLayerMap.get(key);
      if (!localLine) {
        return line;
      }
      if (isMissingSecondSize(line, localLine)) {
        return localLine;
      }
      return line;
    })
    .join('\n');
}

function extractStructuredTextPayload(payload: any): string {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text;
  }

  const outputs = Array.isArray(payload?.output) ? payload.output : [];
  for (const item of outputs) {
    const contents = Array.isArray(item?.content) ? item.content : [];
    for (const content of contents) {
      if (typeof content?.text === 'string' && content.text.trim()) {
        return content.text;
      }
    }
  }

  throw new Error('OpenAI response did not include structured text output.');
}

async function formatWithOpenAI(rawNotes: string): Promise<FormatterResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(`${OPENAI_BASE_URL}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0,
        input: [
          {
            role: 'system',
            content: FORMATTER_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: `Raw notes:\n${rawNotes}`,
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            ...FORMATTER_SCHEMA,
          },
        },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`OpenAI formatter timed out after ${OPENAI_TIMEOUT_MS} ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI formatter request failed with status ${response.status}: ${text}`);
  }

  const payload = await response.json();
  const outputText = extractStructuredTextPayload(payload);
  const parsed = JSON.parse(outputText) as FormatterResponse;
  if (!parsed.formattedText?.trim()) {
    throw new Error('OpenAI formatter returned empty formattedText.');
  }

  const rawPostProcessedText = postProcessFormattedText(parsed.formattedText);
  const rawLayerLines = extractSectionLines(rawPostProcessedText).layers;
  const invalidHardnessFindings = collectInvalidLayerHardnessFindings(rawLayerLines);

  if (invalidHardnessFindings.length > 0) {
    await writeFormatterAuditRecord({
      rawNotes,
      rawAiFormattedText: parsed.formattedText,
      postProcessedText: rawPostProcessedText,
      invalidHardnessFindings,
    });
  }

  const resolvedValues = extractDraftValuesFromRawNotes(rawNotes);
  const sanitizedText = sanitizeAiOnlyFormattedText(parsed.formattedText, resolvedValues, rawNotes);

  return {
    formatterVersion: 'nivium-ai-v1',
    formattedText: sanitizedText,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    resolvedValues,
  };
}

function formatTranscriptDeterministic(transcript: string): FormatterResponse {
  const resolvedValues = extractDraftValuesFromRawNotes(transcript);
  const localDraft: ProfileDraft = {
    rawNotes: transcript,
    values: resolvedValues,
    updatedAt: new Date().toISOString(),
  };
  const localFormatted = formatDraftToEngineText(localDraft);
  const sanitizedText = sanitizeAiOnlyFormattedText(localFormatted.formattedText, resolvedValues, transcript);

  return {
    formatterVersion: 'nivium-ai-v1',
    formattedText: sanitizedText,
    warnings: localFormatted.warnings ?? [],
    resolvedValues,
  };
}

function hashAudioBuffer(input: Buffer) {
  return createHash('sha256').update(input).digest('hex');
}

function getCachedTranscribeResponse(key: string) {
  const cached = transcribeResponseCache.get(key);
  if (!cached) {
    return null;
  }
  // LRU touch
  transcribeResponseCache.delete(key);
  transcribeResponseCache.set(key, cached);
  return cached;
}

function setCachedTranscribeResponse(key: string, value: FormatterResponse & { transcript: string }) {
  transcribeResponseCache.set(key, value);
  if (transcribeResponseCache.size <= TRANSCRIBE_CACHE_MAX) {
    return;
  }
  const firstKey = transcribeResponseCache.keys().next().value;
  if (typeof firstKey === 'string') {
    transcribeResponseCache.delete(firstKey);
  }
}

function isCompleteStabilityLine(line: string) {
  const normalized = line.trim().replace(/\s+/g, ' ');
  if (!/^(CT|ECT|PST|HS|SS|DT|RB)\b/i.test(normalized)) {
    return true;
  }
  return /\bat\s+\d+(?:\.\d+)?\s*cm\b/i.test(normalized);
}

function normalizeStabilityFormatting(line: string) {
  return line
    .trim()
    .replace(/\bIn\s+a\s+PST\s+(\d+(?:\.\d+)?)\s*(?:\/|over)\s*(\d+(?:\.\d+)?)\s+and\s+at\s+(\d+(?:\.\d+)?)\s*cm\b/i, 'PST $1/$2 END at $3 cm')
    .replace(/\bPST\s+(\d+(?:\.\d+)?)\s+over\s+(\d+(?:\.\d+)?)(?=\b|$)/i, 'PST $1/$2')
    .replace(/\bECTP\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)(?=\b|$)/i, 'PST $1/$2')
    .replace(/\b(ECT[PNX])\s+(\d{1,2})\b/i, '$1$2')
    .replace(/\s+/g, ' ');
}

function dedupePreserveOrder(lines: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of lines) {
    const key = line.trim().toUpperCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(line);
  }
  return result;
}

function cleanupStabilityFalsePositives(lines: string[], rawNotes?: string) {
  const normalized = lines.map((line) => normalizeStabilityFormatting(line));
  const hasCt = normalized.some((line) => /^CT(?:E|M|H)\d+\b/i.test(line));
  const hasPst = normalized.some((line) => /^PST\s+\d+(?:\.\d+)?\/\d+(?:\.\d+)?\s+(?:END|ARR|SF)\s+at\s+\d+(?:\.\d+)?\s*cm\b/i.test(line));
  const rawMentionsPst = /\bpropagation\s+saw\s+test\b|\bPST\b/i.test(rawNotes ?? '');

  const filtered = normalized.filter((line) => {
    const compact = line.trim();
    if (!compact) return false;
    if (/^ECT[PNX]?\d*$/i.test(compact)) return false;
    if (hasCt && /^ECTP\d+\s+at\s+\d+(?:\.\d+)?\s*cm$/i.test(compact)) return false;
    if ((hasPst || rawMentionsPst) && /^ECTP\d+\s+at\s+\d+(?:\.\d+)?\s*cm$/i.test(compact)) return false;
    return true;
  });

  return dedupePreserveOrder(filtered);
}

function collectExplicitLayerSizeByBottom(rawNotes?: string) {
  const byBottom = new Map<number, string>();
  if (!rawNotes?.trim()) {
    return byBottom;
  }

  const clauses = splitCueClauses(rawNotes);
  let lastLayerBottom: number | null = null;
  let lastLayerClauseIndex = -9999;
  const appendSizes = (bottom: number, values: string[]) => {
    const existing = (byBottom.get(bottom) ?? '')
      .split('/')
      .map((value) => value.trim())
      .filter(Boolean);
    const merged = [...existing, ...values].slice(0, 2);
    byBottom.set(bottom, merged.join('/'));
  };
  for (let i = 0; i < clauses.length; i += 1) {
    const clause = clauses[i];
    const toMatches = Array.from(clause.matchAll(/\bto\s+(\d+(?:\.\d+)?)\s*(?:centimet(?:er|re)s?|cm)?\b/gi));
    const nearest = toMatches[toMatches.length - 1];
    const clauseBottom = nearest?.[1] ? Number(nearest[1]) : NaN;
    const isLayerLike = /\b(layer|grain|hardness|resistance|crust|facets|rounds|surface|pencil|knife|fist|finger)\b/i.test(
      clause
    );
    if (Number.isFinite(clauseBottom) && isLayerLike) {
      lastLayerBottom = clauseBottom;
      lastLayerClauseIndex = i;
    }
    const targetBottom = Number.isFinite(clauseBottom)
      ? clauseBottom
      : lastLayerBottom !== null && i - lastLayerClauseIndex <= 4
        ? lastLayerBottom
        : NaN;
    if (!Number.isFinite(targetBottom)) {
      continue;
    }

    const sizeCue1 =
      clause.match(/\b(?:grain\s*size\s*(?:1|one|first)|size\s*(?:1|one|first))\b[^0-9]{0,8}(\d+(?:\.\d+)?)\s*(mm|cm|millimeters?|centimet(?:er|re)s?)\b/i) ??
      null;
    const sizeCue2 =
      clause.match(/\b(?:grain\s*size\s*(?:2|two|second)|size\s*(?:2|two|second))\b[^0-9]{0,8}(\d+(?:\.\d+)?)\s*(mm|cm|millimeters?|centimet(?:er|re)s?)\b/i) ??
      null;
    const explicitSizeCues = [sizeCue1, sizeCue2]
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => `${match[1]}${/^cm|centimet/i.test(match[2]) ? 'cm' : 'mm'}`);
    if (explicitSizeCues.length > 0) {
      appendSizes(targetBottom, explicitSizeCues);
      continue;
    }

    const sizeMatches = Array.from(clause.matchAll(/\b(\d+(?:\.\d+)?)\s*(mm|cm|millimeters?|centimet(?:er|re)s?)\b/gi));
    const filteredSizeMatches = sizeMatches.filter((m) => {
      const unitIsCm = /^cm|centimet/i.test(m[2]);
      // Generic cm matches are usually layer/test depths, not grain sizes.
      // Keep cm only when explicitly captured via "grain size 1/2" cues above.
      if (unitIsCm) {
        return false;
      }
      return true;
    });
    if (filteredSizeMatches.length > 0) {
      const values = filteredSizeMatches.map((m) => `${m[1]}${/^cm|centimet/i.test(m[2]) ? 'cm' : 'mm'}`);
      appendSizes(targetBottom, values);
      continue;
    }

    if (Number.isFinite(clauseBottom) && isLayerLike && !byBottom.has(targetBottom)) {
      // Explicit layer clause with no size mention => clear any AI-carried size.
      byBottom.set(targetBottom, '');
    }
  }

  return byBottom;
}

function applyLayerSizeHints(lines: string[], rawNotes?: string) {
  const sizeByBottom = collectExplicitLayerSizeByBottom(rawNotes);
  if (sizeByBottom.size === 0) {
    return lines;
  }

  return lines.map((line) => {
    const range = parseLeadingLayerRange(line);
    if (!range) {
      return line;
    }
    if (!sizeByBottom.has(range.bottom)) {
      return line;
    }

    const [mainPart, ...commentParts] = line.split('|');
    const parts = mainPart.trim().split(/\s+/);
    if (parts.length < 3) {
      return line;
    }

    const explicit = sizeByBottom.get(range.bottom) ?? '';
    const withoutSizes = parts.filter((token, idx) => idx < 3 || !isSizeToken(token));
    if (explicit) {
      withoutSizes.splice(3, 0, explicit);
    }
    const rebuiltMain = withoutSizes.join(' ');
    if (commentParts.length === 0) {
      return rebuiltMain;
    }
    return `${rebuiltMain} | ${commentParts.join('|').trim()}`;
  });
}

function collectPstOutcomeByDepth(rawNotes?: string) {
  const byDepth = new Map<number, 'END' | 'ARR'>();
  if (!rawNotes?.trim()) {
    return byDepth;
  }

  const clauses = splitCueClauses(rawNotes);
  for (const clause of clauses) {
    if (!/\b(propagation\s+saw|pst)\b/i.test(clause)) {
      continue;
    }
    const depthMatch = clause.match(/\bat\s+(\d+(?:\.\d+)?)\s*(?:centimet(?:er|re)s?|cm)?\b/i);
    const depth = depthMatch?.[1] ? Number(depthMatch[1]) : NaN;
    if (!Number.isFinite(depth)) {
      continue;
    }
    if (/\bend\b/i.test(clause)) {
      byDepth.set(depth, 'END');
      continue;
    }
    if (/\barr(?:est)?\b/i.test(clause)) {
      byDepth.set(depth, 'ARR');
    }
  }

  return byDepth;
}

function applyPstOutcomeHints(lines: string[], rawNotes?: string) {
  const byDepth = collectPstOutcomeByDepth(rawNotes);
  if (byDepth.size === 0) {
    return lines;
  }

  return lines.map((line) => {
    const normalized = line.trim().replace(/\s+/g, ' ');
    if (!/^PST\b/i.test(normalized)) {
      return line;
    }
    const depthMatch = normalized.match(/\bat\s+(\d+(?:\.\d+)?)\s*cm\b/i);
    const depth = depthMatch?.[1] ? Number(depthMatch[1]) : NaN;
    if (!Number.isFinite(depth) || !byDepth.has(depth)) {
      return line;
    }
    const forced = byDepth.get(depth)!;
    return normalized.replace(/\b(END|ARR)\b/i, forced);
  });
}

type ParsedLayerRange = {
  top: number;
  bottom: number;
};

function parseLeadingLayerRange(line: string): ParsedLayerRange | null {
  const match = line.trim().match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)(?:\s+|$)/);
  if (!match) {
    return null;
  }
  const top = Number(match[1]);
  const bottom = Number(match[2]);
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) {
    return null;
  }
  return { top, bottom };
}

function isLayerHardnessToken(token: string) {
  return /^(?:F|4F|1F|P|K|I)(?:\+)?(?:-(?:F|4F|1F|P|K|I)(?:\+)?)?$/i.test(token);
}

function isBaseHardnessToken(token: string) {
  return /^(?:F|4F|1F|P|K|I)(?:\+)?$/i.test(token);
}

function normalizeLayerGrainToken(token: string) {
  return token
    .split('/')
    .map((part) => part.replace(/\+/g, ''))
    .join('/');
}

function normalizeLayerGrainPiece(piece: string) {
  const clean = piece.replace(/\+/g, '').trim();
  const upper = clean.toUpperCase();
  if (upper === 'DS' || upper === 'DFS') {
    return 'DF';
  }
  if (upper === 'PR') {
    return 'RG';
  }
  if (upper === 'SHOAR' || upper === 'SHORE' || upper === 'SWH') {
    return 'SH';
  }
  if (upper === 'FCXR') {
    return 'FCxr';
  }
  if (upper === 'IFRC') {
    return 'IFrc';
  }
  if (upper === 'IFCR') {
    return 'IFrc';
  }
  if (upper === 'MFCR') {
    return 'MFcr';
  }
  return upper;
}

function normalizeLayerGrainFromTokens(tokens: string[]) {
  const pieces = tokens
    .flatMap((token) => token.split('/'))
    .map((piece) => normalizeLayerGrainPiece(piece))
    .filter(Boolean);
  if (pieces.length === 0) {
    return '';
  }
  if (pieces.length === 1) {
    return pieces[0];
  }
  return `${pieces[0]}/${pieces[1]}`;
}

function isLikelyGrainToken(token: string) {
  const normalized = normalizeLayerGrainPiece(token);
  return /^(PP|DF|RG|FC|FCXR|IFRC|MFCR|SH|DH|MF|IF)$/i.test(normalized);
}

function isSizeToken(token: string) {
  return /^\d+(?:\.\d+)?(?:mm|cm)(?:\/\d+(?:\.\d+)?(?:mm|cm))?$/i.test(token);
}

function compactSlashArtifacts(tokens: string[]) {
  const compacted: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const current = tokens[i];
    const next = tokens[i + 1] ?? '';
    if (current.endsWith('/') && next) {
      compacted.push(`${current}${next}`);
      i += 1;
      continue;
    }
    compacted.push(current);
  }
  return compacted;
}

function normalizeLayerHardnessTokens(tokens: string[]) {
  if (tokens.length < 3) {
    return tokens;
  }

  let hardness = tokens[2];
  const next = tokens[3] ?? '';
  const nextNext = tokens[4] ?? '';

  // Normalize malformed delimiter variants such as "1F/P" -> "1F-P"
  if (/^(?:F|4F|1F|P|K|I)(?:\+)?\/(?:F|4F|1F|P|K|I)(?:\+)?$/i.test(hardness)) {
    hardness = hardness.replace('/', '-');
  }

  // Normalize split transitions such as "1F P" -> "1F-P"
  const looksLikeSizeToken = /\d+(?:\.\d+)?(?:mm|cm)?(?:\/\d+(?:\.\d+)?(?:mm|cm)?)?$/i.test(nextNext);
  if (
    isBaseHardnessToken(hardness) &&
    isBaseHardnessToken(next) &&
    (!nextNext || looksLikeSizeToken || /\bcrust\b/i.test(nextNext))
  ) {
    hardness = `${hardness}-${next}`;
    tokens.splice(3, 1);
  } else if (!isLayerHardnessToken(hardness) && isBaseHardnessToken(hardness) && isBaseHardnessToken(next)) {
    hardness = `${hardness}-${next}`;
    tokens.splice(3, 1);
  }

  // Map occasional single-letter corruption.
  if (/^S$/i.test(hardness)) {
    hardness = 'F';
  }

  tokens[2] = hardness;
  return tokens;
}

type InvalidLayerHardnessFinding = {
  line: string;
  range: string;
  hardnessToken: string;
};

function collectInvalidLayerHardnessFindings(lines: string[]) {
  const findings: InvalidLayerHardnessFinding[] = [];

  for (const line of lines) {
    const range = parseLeadingLayerRange(line);
    if (!range) {
      continue;
    }
    const main = line.split('|')[0]?.trim() ?? '';
    if (!main) {
      continue;
    }
    const tokens = main.split(/\s+/);
    if (tokens.length < 3) {
      continue;
    }
    const hardnessToken = tokens[2];
    if (isLayerHardnessToken(hardnessToken)) {
      continue;
    }
    findings.push({
      line,
      range: `${range.top}-${range.bottom}`,
      hardnessToken,
    });
  }

  return findings;
}

async function writeFormatterAuditRecord(args: {
  rawNotes: string;
  rawAiFormattedText: string;
  postProcessedText: string;
  invalidHardnessFindings: InvalidLayerHardnessFinding[];
}) {
  try {
    await mkdir(FORMATTER_AUDIT_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = join(FORMATTER_AUDIT_DIR, `invalid-hardness-${stamp}.json`);
    const payload = {
      createdAt: new Date().toISOString(),
      invalidHardnessFindings: args.invalidHardnessFindings,
      rawNotes: args.rawNotes,
      rawAiFormattedText: args.rawAiFormattedText,
      postProcessedText: args.postProcessedText,
    };
    await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
    console.warn(`[formatter][audit] invalid hardness token detected; record written: ${filePath}`);
  } catch (error) {
    console.warn(
      `[formatter][audit] failed to write invalid-hardness audit record: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

function fixInvalidSingleTokenHardness(line: string) {
  const [mainPart, ...commentParts] = line.split('|');
  const main = mainPart.trim();
  if (!main) {
    return line;
  }

  const rawTokens = main.split(/\s+/);
  if (rawTokens.length < 2) {
    return line;
  }

  // Recover ultra-short malformed layers like "127-154 P-P" by injecting a conservative grain.
  if (rawTokens.length === 2) {
    const shortRange = parseLeadingLayerRange(rawTokens[0] ?? '');
    const shortToken = rawTokens[1] ?? '';
    if (shortRange && isLayerHardnessToken(shortToken)) {
      return `${rawTokens[0]} RG ${shortToken}`.trim();
    }

    // Recover ultra-short malformed layers like "104-156 RG" by injecting
    // a conservative fallback hardness to keep output render-safe.
    if (shortRange) {
      const normalizedShortGrain = normalizeLayerGrainFromTokens([shortToken]);
      if (normalizedShortGrain && LAYER_GRAIN_TOKEN.test(normalizedShortGrain)) {
        const fallbackHardness =
          /^(IFrc|MFcr)$/i.test(normalizedShortGrain) ? 'K' : /(^|\/)RG(\/|$)/i.test(normalizedShortGrain) ? 'P' : '1F';
        const crustToken = /^(IFrc|MFcr)$/i.test(normalizedShortGrain) ? 'crust' : '';
        return [rawTokens[0], normalizedShortGrain, fallbackHardness, crustToken].filter(Boolean).join(' ').trim();
      }
    }
    return line;
  }

  const range = rawTokens[0];
  let tokens = compactSlashArtifacts(rawTokens.slice(1)).map((token) => token.trim()).filter(Boolean);
  if (tokens.length === 0) {
    return line;
  }

  // Pull out one size token if present.
  const sizeIndex = tokens.findIndex((token) => isSizeToken(token));
  const sizeToken = sizeIndex >= 0 ? tokens.splice(sizeIndex, 1)[0] : '';

  // Pull out hardness (or normalize split hardness variants).
  normalizeLayerHardnessTokens(tokens);
  let hardnessIndex = tokens.findIndex((token) => isLayerHardnessToken(token));
  let hardnessToken = hardnessIndex >= 0 ? tokens.splice(hardnessIndex, 1)[0] : '';

  if (!hardnessToken) {
    // Recover from patterns like "fist" that slipped through.
    const fistIndex = tokens.findIndex((token) => /^fist$/i.test(token));
    if (fistIndex >= 0) {
      hardnessToken = 'F';
      tokens.splice(fistIndex, 1);
    }
  }

  // Choose grain tokens, preferring post-hardness leftovers if they contain known grain terms.
  const grainCandidates = tokens.filter((token) => isLikelyGrainToken(token));
  let grainToken = normalizeLayerGrainFromTokens(grainCandidates);
  if (!grainToken) {
    grainToken = normalizeLayerGrainToken(tokens[0] ?? '');
  }

  const isCrustGrain = /^(IFrc|MFcr)$/i.test(grainToken);
  if (!hardnessToken) {
    // Recover from AI outputs that drop hardness and place size directly after grain.
    hardnessToken = isCrustGrain ? 'K' : '1F';
  }

  const crustToken = isCrustGrain ? 'crust' : '';

  const rebuiltMain = [range, grainToken, hardnessToken, crustToken, sizeToken]
    .filter(Boolean)
    .join(' ')
    .replace(/\s*\/\s*/g, '/')
    .trim();
  if (commentParts.length === 0) {
    return rebuiltMain;
  }
  return `${rebuiltMain} | ${commentParts.join('|').trim()}`.trim();
}

function normalizeLayerAliases(line: string) {
  const [mainPart, ...commentParts] = line.split('|');
  const main = mainPart.trim();
  if (!main) {
    return line;
  }

  const parts = main.split(/\s+/);
  if (parts.length < 2) {
    return line;
  }

  const grain = normalizeLayerGrainFromTokens([parts[1] ?? '']);
  if (!grain) {
    return line;
  }

  parts[1] = grain;
  const rebuiltMain = parts.join(' ');
  if (commentParts.length === 0) {
    return rebuiltMain;
  }
  return `${rebuiltMain} | ${commentParts.join('|').trim()}`;
}

function sanitizeAiLayerLines(lines: string[]) {
  const sanitized: string[] = [];
  const seenRanges = new Set<string>();
  const byBottom = new Map<number, { line: string; top: number; score: number }>();
  let previousBottom: number | null = null;

  const lineScore = (line: string) => {
    let score = 0;
    if (/\b(?:F|4F|1F|P|K|I)\+?-(?:F|4F|1F|P|K|I)\+?\b/.test(line)) score += 3;
    if (/\b\d+(?:\.\d+)?(?:mm|cm)\/\d+(?:\.\d+)?(?:mm|cm)\b/i.test(line)) score += 2;
    if (/\b[A-Z][A-Za-z]*\/[A-Z][A-Za-z]*\b/.test(line)) score += 1;
    if (/\bred\b/i.test(line)) score += 1;
    if (/\|/.test(line)) score += 1;
    return score;
  };

  for (const rawLine of lines) {
    const line = normalizeLayerAliases(fixInvalidSingleTokenHardness(rawLine.trim()));
    const range = parseLeadingLayerRange(line);
    if (!range) {
      continue;
    }

    if (range.bottom <= range.top) {
      continue;
    }

    const rangeKey = `${range.top}-${range.bottom}`;
    if (seenRanges.has(rangeKey)) {
      continue;
    }

    // Keep continuity strict in AI-only mode:
    // once a deeper layer is accepted, reject any later line that starts above that boundary.
    if (previousBottom !== null && range.top < previousBottom) {
      continue;
    }

    const candidateScore = lineScore(line);
    const existingByBottom = byBottom.get(range.bottom);
    if (existingByBottom) {
      const shouldReplace =
        candidateScore > existingByBottom.score ||
        (candidateScore === existingByBottom.score && range.top > existingByBottom.top);
      if (shouldReplace) {
        byBottom.set(range.bottom, { line, top: range.top, score: candidateScore });
      }
      continue;
    }

    sanitized.push(line);
    seenRanges.add(rangeKey);
    byBottom.set(range.bottom, { line, top: range.top, score: candidateScore });
    previousBottom = range.bottom;
  }

  const selected = new Set(Array.from(byBottom.values()).map((entry) => entry.line));
  return sanitized.filter((line) => selected.has(line));
}

function mapSpokenHardnessToCode(text: string) {
  const normalized = text.toLowerCase();
  if (/\bfist\b/.test(normalized)) return 'F';
  if (/\bfour\s+finger\b/.test(normalized)) return '4F';
  if (/\bone\s+finger\b/.test(normalized)) return '1F';
  if (/\bpencil\b/.test(normalized)) return 'P';
  if (/\bknife\b/.test(normalized)) return 'K';
  if (/\bice\b/.test(normalized)) return 'I';
  return '';
}

function extractExpectedTransitionFromLayerHint(hint: string) {
  const normalized = hint.toLowerCase();
  const hasSecondHardnessCue = /\b(second\s+hardness|hardness\s*2|hardness\s+two)\b/.test(normalized);
  if (!hasSecondHardnessCue) {
    return '';
  }

  const firstMatch = normalized.match(/\bfirst\s+hardness\b[^.]*?\b(fist|four\s+finger|one\s+finger|pencil|knife|ice)\b/);
  const secondMatch = normalized.match(/\bsecond\s+hardness\b[^.]*?\b(fist|four\s+finger|one\s+finger|pencil|knife|ice)\b/);
  if (!firstMatch?.[1] || !secondMatch?.[1]) {
    return '';
  }
  const first = mapSpokenHardnessToCode(firstMatch[1]);
  const second = mapSpokenHardnessToCode(secondMatch[1]);
  if (!first || !second) {
    return '';
  }
  return `${first}-${second}`;
}

function applyResolvedLayerTransitionHints(lines: string[], resolvedValues?: Record<string, string>) {
  if (!resolvedValues) {
    return lines;
  }

  const transitionByRange = new Map<string, string>();
  for (const [key, value] of Object.entries(resolvedValues)) {
    if (!/^layer_\d+$/i.test(key) || !value?.trim()) {
      continue;
    }
    const range = parseLeadingLayerRange(value);
    if (!range) {
      continue;
    }
    const transition = extractExpectedTransitionFromLayerHint(value);
    if (!transition) {
      continue;
    }
    transitionByRange.set(`${range.top}-${range.bottom}`, transition);
  }

  if (transitionByRange.size === 0) {
    return lines;
  }

  return lines.map((line) => {
    const [mainPart, ...commentParts] = line.split('|');
    const main = mainPart.trim();
    const parts = main.split(/\s+/);
    if (parts.length < 3) {
      return line;
    }
    const range = parseLeadingLayerRange(parts[0] ?? '');
    if (!range) {
      return line;
    }
    const key = `${range.top}-${range.bottom}`;
    const forcedTransition = transitionByRange.get(key);
    if (!forcedTransition) {
      return line;
    }
    if (isLayerHardnessToken(parts[2] ?? '') && (parts[2] ?? '').includes('-')) {
      return line;
    }

    parts[2] = forcedTransition;
    const rebuiltMain = parts.join(' ');
    if (commentParts.length === 0) {
      return rebuiltMain;
    }
    return `${rebuiltMain} | ${commentParts.join('|').trim()}`;
  });
}

function extractGlobalFirstSecondTransition(rawNotes?: string) {
  if (!rawNotes?.trim()) {
    return null;
  }
  const normalized = rawNotes.toLowerCase();
  const match = normalized.match(
    /\bfirst\s+hardness\b[\s,:-]*(fist|four\s+finger|one\s+finger|pencil|knife|ice)[\s\S]{0,140}?\b(?:second\s+hardness|hardness\s*2|hardness\s+two)\b[\s,:-]*(fist|four\s+finger|one\s+finger|pencil|knife|ice)\b/i
  );
  if (!match?.[1] || !match?.[2]) {
    return null;
  }
  const first = mapSpokenHardnessToCode(match[1]);
  const second = mapSpokenHardnessToCode(match[2]);
  if (!first || !second) {
    return null;
  }
  return { first, transition: `${first}-${second}` };
}

function applyRawNotesTransitionHints(lines: string[], rawNotes?: string) {
  const cue = extractGlobalFirstSecondTransition(rawNotes);
  if (!cue) {
    return lines;
  }

  return lines.map((line) => {
    const [mainPart, ...commentParts] = line.split('|');
    const main = mainPart.trim();
    const parts = main.split(/\s+/);
    if (parts.length < 3) {
      return line;
    }

    const grain = parts[1] ?? '';
    const hardness = parts[2] ?? '';
    if (!grain.includes('/')) {
      return line;
    }
    if (hardness.includes('-') || hardness !== cue.first) {
      return line;
    }

    const tail = parts.slice(3);
    const hasDualSize = tail.some((token) => isSizeToken(token) && token.includes('/'));
    if (!hasDualSize) {
      return line;
    }

    parts[2] = cue.transition;
    const rebuiltMain = parts.join(' ');
    if (commentParts.length === 0) {
      return rebuiltMain;
    }
    return `${rebuiltMain} | ${commentParts.join('|').trim()}`;
  });
}

function addRedToLayerLine(line: string) {
  if (/\bred\b/i.test(line)) {
    return line;
  }
  const [mainPart, ...commentParts] = line.split('|');
  const main = mainPart.trim();
  const rebuiltMain = `${main} red`.replace(/\s+/g, ' ').trim();
  if (commentParts.length === 0) {
    return rebuiltMain;
  }
  return `${rebuiltMain} | ${commentParts.join('|').trim()}`;
}

function removeRedFromLayerLine(line: string) {
  if (!/\bred\b/i.test(line)) {
    return line;
  }
  const [mainPart, ...commentParts] = line.split('|');
  const main = mainPart.replace(/\bred\b/gi, '').replace(/\s+/g, ' ').trim();
  if (commentParts.length === 0) {
    return main;
  }
  return `${main} | ${commentParts.join('|').trim()}`;
}

function applyResolvedRedHints(lines: string[], resolvedValues?: Record<string, string>) {
  if (!resolvedValues || lines.length === 0) {
    return lines;
  }

  const redRanges = new Set<string>();
  for (const [key, value] of Object.entries(resolvedValues)) {
    if (!/^layer_\d+$/i.test(key)) {
      continue;
    }
    const text = (value ?? '').trim();
    if (!text || !/\b(red|layer of concern)\b/i.test(text)) {
      continue;
    }
    const range = parseLeadingLayerRange(text);
    if (!range) {
      continue;
    }
    redRanges.add(`${range.top}-${range.bottom}`);
  }

  if (redRanges.size === 0) {
    return lines;
  }

  return lines.map((line) => {
    const range = parseLeadingLayerRange(line);
    if (!range) {
      return line;
    }
    const key = `${range.top}-${range.bottom}`;
    if (!redRanges.has(key)) {
      return line;
    }
    return addRedToLayerLine(line);
  });
}

function applyImplicitConcernCue(lines: string[], rawNotes?: string) {
  if (!rawNotes || lines.length === 0) {
    return lines;
  }
  if (!/\blayer of concern\b/i.test(rawNotes)) {
    return lines;
  }

  const concernIndex = rawNotes.toLowerCase().indexOf('layer of concern');
  const beforeConcern = rawNotes.slice(0, concernIndex);
  const rangeMatches = Array.from(beforeConcern.matchAll(/\bfrom\s+(\d+(?:\.\d+)?)\s+to\s+(\d+(?:\.\d+)?)/gi));
  const last = rangeMatches[rangeMatches.length - 1];
  let targetKey = '';

  if (last?.[1] && last?.[2]) {
    const top = Number(last[1]);
    const bottom = Number(last[2]);
    if (Number.isFinite(top) && Number.isFinite(bottom)) {
      targetKey = `${top}-${bottom}`;
    }
  }

  // Fallback: if no explicit "from X to Y" was captured before the concern cue,
  // map concern to the most recent "to Y" depth and apply red to that Y-bottom layer.
  if (!targetKey) {
    const toDepthMatches = Array.from(
      beforeConcern.matchAll(/\bto\s+(\d+(?:\.\d+)?)\s*(?:centimet(?:er|re)s?|cm)?\b/gi)
    );
    const lastToDepth = toDepthMatches[toDepthMatches.length - 1];
    const targetBottom = lastToDepth?.[1] ? Number(lastToDepth[1]) : NaN;
    if (Number.isFinite(targetBottom)) {
      const found = lines.find((line) => {
        const range = parseLeadingLayerRange(line);
        return Boolean(range) && range!.bottom === targetBottom;
      });
      if (found) {
        const range = parseLeadingLayerRange(found)!;
        targetKey = `${range.top}-${range.bottom}`;
      }
    }
  }

  if (!targetKey) {
    return lines;
  }

  return lines.map((line) => {
    const range = parseLeadingLayerRange(line);
    if (!range) {
      return line;
    }
    const key = `${range.top}-${range.bottom}`;
    if (key !== targetKey) {
      return line;
    }
    return addRedToLayerLine(line);
  });
}

function splitCueClauses(rawNotes?: string) {
  if (!rawNotes?.trim()) {
    return [] as string[];
  }

  // Voice dictation frequently arrives as one long sentence with commas.
  // Force clause boundaries around layer starters so cue/depth matching
  // binds to the intended layer instead of the last depth in the paragraph.
  const normalized = rawNotes
    .replace(/\bfirst\s+layer\b/gi, '. First layer')
    .replace(/\bnext\s+layer\b/gi, '. Next layer')
    .replace(/\blayer\s+\d+\b/gi, (m) => `. ${m}`);

  return normalized
    .split(/[.?!]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function collectRedCueBottomDepths(rawNotes?: string) {
  if (!rawNotes?.trim()) {
    return new Set<number>();
  }

  const bottoms = new Set<number>();
  const cueRegex =
    /\b(red|read|layer\s+of\s+concern(?:ed)?|layer\s+concern(?:ed)?|my\s+layer\s+of\s+concern(?:ed)?|this\s+is\s+my\s+layer\s+of\s+concern(?:ed)?|this\s+layer\s+is\s+of\s+concern(?:ed)?|of\s+concern(?:ed)?|make\s+this\s+layer\s+red|mark\s+this\s+layer\s+red)\b/i;
  const clauses = splitCueClauses(rawNotes);

  let lastLayerBottom: number | null = null;
  let lastLayerClauseIndex = -9999;

  for (let i = 0; i < clauses.length; i += 1) {
    const clause = clauses[i];
    const toMatches = Array.from(clause.matchAll(/\bto\s+(\d+(?:\.\d+)?)\s*(?:centimet(?:er|re)s?|cm)?\b/gi));
    const clauseBottom = toMatches.length > 0 ? Number(toMatches[toMatches.length - 1][1]) : NaN;
    const isLayerLike = /\b(layer|grain|hardness|resistance|crust|facets|rounds|surface)\b/i.test(clause);

    if (Number.isFinite(clauseBottom) && isLayerLike) {
      lastLayerBottom = clauseBottom;
      lastLayerClauseIndex = i;
    }

    if (!cueRegex.test(clause)) {
      continue;
    }

    if (Number.isFinite(clauseBottom)) {
      bottoms.add(clauseBottom);
      continue;
    }

    // Voice dictation often splits "red"/"layer of concern" into a short
    // follow-up sentence after 1-3 tiny clauses ("facets", "6 millimeters").
    // Allow a small lookback window so cue-only clauses still bind to the
    // just-described layer, while remaining narrow enough to avoid distant drift.
    if (lastLayerBottom !== null && i - lastLayerClauseIndex <= 4) {
      bottoms.add(lastLayerBottom);
    }
  }

  return bottoms;
}

function collectSurfaceHoarBottomDepths(rawNotes?: string) {
  if (!rawNotes?.trim()) {
    return new Set<number>();
  }

  const bottoms = new Set<number>();
  const clauses = splitCueClauses(rawNotes);
  let lastLayerBottom: number | null = null;
  let lastLayerClauseIndex = -9999;

  for (let i = 0; i < clauses.length; i += 1) {
    const clause = clauses[i];
    const toMatches = Array.from(clause.matchAll(/\bto\s+(\d+(?:\.\d+)?)\s*(?:centimet(?:er|re)s?|cm)?\b/gi));
    const nearest = toMatches[toMatches.length - 1];
    const clauseBottom = nearest?.[1] ? Number(nearest[1]) : NaN;
    const isLayerLike = /\b(layer|grain|hardness|resistance|crust|facets|rounds|surface)\b/i.test(clause);
    if (Number.isFinite(clauseBottom) && isLayerLike) {
      lastLayerBottom = clauseBottom;
      lastLayerClauseIndex = i;
    }

    if (!/\b(?:surface|service)\s+(?:hoar|whore|horror|score|war|wear|wore|oar|ore|hour|horde|hoer)\b/i.test(clause)) {
      continue;
    }
    const targetBottom = Number.isFinite(clauseBottom)
      ? clauseBottom
      : lastLayerBottom !== null && i - lastLayerClauseIndex <= 4
        ? lastLayerBottom
        : NaN;
    if (Number.isFinite(targetBottom)) {
      bottoms.add(targetBottom);
    }
  }

  return bottoms;
}

function detectPrimaryGrainFromClause(clause: string) {
  const normalized = clause.toLowerCase();
  if (/\bfacets?\b/.test(normalized)) {
    return 'FC';
  }
  if (/\brounds?\b/.test(normalized)) {
    return 'RG';
  }
  if (/\bstellars?\b|\bstellar crystals?\b/.test(normalized)) {
    return 'PP';
  }
  if (/\bdecomposing(?: fragments?)?\b|\bdf\b/.test(normalized)) {
    return 'DF';
  }
  if (/\bdepth\s+hoar\b/.test(normalized)) {
    return 'DH';
  }
  return '';
}

function collectSurfaceHoarOverridesByBottom(rawNotes?: string) {
  const overrides = new Map<number, string>();
  if (!rawNotes?.trim()) {
    return overrides;
  }

  const clauses = splitCueClauses(rawNotes);
  let lastLayerBottom: number | null = null;
  let lastLayerClauseIndex = -9999;

  for (let i = 0; i < clauses.length; i += 1) {
    const clause = clauses[i];
    const toMatches = Array.from(clause.matchAll(/\bto\s+(\d+(?:\.\d+)?)\s*(?:centimet(?:er|re)s?|cm)?\b/gi));
    const nearest = toMatches[toMatches.length - 1];
    const clauseBottom = nearest?.[1] ? Number(nearest[1]) : NaN;
    const isLayerLike = /\b(layer|grain|hardness|resistance|crust|facets|rounds|surface)\b/i.test(clause);
    if (Number.isFinite(clauseBottom) && isLayerLike) {
      lastLayerBottom = clauseBottom;
      lastLayerClauseIndex = i;
    }

    if (!/\b(?:surface|service)\s+(?:hoar|whore|horror|score|war|wear|wore|oar|ore|hour|horde|hoer)\b/i.test(clause)) {
      continue;
    }
    const targetBottom = Number.isFinite(clauseBottom)
      ? clauseBottom
      : lastLayerBottom !== null && i - lastLayerClauseIndex <= 4
        ? lastLayerBottom
        : NaN;
    if (!Number.isFinite(targetBottom)) {
      continue;
    }

    const primary = detectPrimaryGrainFromClause(clause);
    if (primary) {
      overrides.set(targetBottom, primary);
    }
  }

  return overrides;
}

function detectPrimaryGrainForBottom(rawNotes: string | undefined, bottom: number) {
  if (!rawNotes?.trim()) {
    return '';
  }

  const escapedBottom = String(bottom).replace('.', '\\.');
  const nearDepthRegex = new RegExp(
    `\\bto\\s+${escapedBottom}\\s*(?:centimet(?:er|re)s?|cm)?\\b([^.!?]{0,180})`,
    'i'
  );
  const match = rawNotes.match(nearDepthRegex);
  if (!match) {
    return '';
  }
  return detectPrimaryGrainFromClause(match[1] ?? '');
}

function applyInlineRedCueByBottom(lines: string[], rawNotes?: string) {
  const targetBottoms = collectRedCueBottomDepths(rawNotes);
  if (targetBottoms.size === 0) {
    return lines;
  }

  return lines.map((line) => {
    const range = parseLeadingLayerRange(line);
    if (!range) {
      return line;
    }
    if (targetBottoms.has(range.bottom)) {
      return addRedToLayerLine(line);
    }
    return removeRedFromLayerLine(line);
  });
}

function forceLayerGrain(line: string, grain: string) {
  const [mainPart, ...commentParts] = line.split('|');
  const main = mainPart.trim();
  if (!main) {
    return line;
  }
  const parts = main.split(/\s+/);
  if (parts.length < 3) {
    return line;
  }
  parts[1] = grain;
  const rebuiltMain = parts.join(' ');
  if (commentParts.length === 0) {
    return rebuiltMain;
  }
  return `${rebuiltMain} | ${commentParts.join('|').trim()}`;
}

function forcePrimaryLayerGrain(line: string, primary: string) {
  const [mainPart, ...commentParts] = line.split('|');
  const main = mainPart.trim();
  if (!main) {
    return line;
  }

  const parts = main.split(/\s+/);
  if (parts.length < 3) {
    return line;
  }

  const existing = normalizeLayerGrainFromTokens([parts[1] ?? '']);
  const grains = existing
    .split('/')
    .map((piece) => piece.trim())
    .filter(Boolean);
  const secondary = grains[1] ?? '';
  parts[1] = secondary ? `${primary}/${secondary}` : primary;

  const rebuiltMain = parts.join(' ');
  if (commentParts.length === 0) {
    return rebuiltMain;
  }
  return `${rebuiltMain} | ${commentParts.join('|').trim()}`;
}

function applyFacetsCueByBottom(lines: string[], rawNotes?: string) {
  if (!rawNotes?.trim()) {
    return lines;
  }

  return lines.map((line) => {
    const range = parseLeadingLayerRange(line);
    if (!range) {
      return line;
    }

    const primaryCue = detectPrimaryGrainForBottom(rawNotes, range.bottom);
    if (primaryCue !== 'FC') {
      return line;
    }

    // Targeted correction for "facets" misrendering as DF.
    const [main] = line.split('|');
    const parts = main.trim().split(/\s+/);
    if (parts.length < 2) {
      return line;
    }
    const existing = normalizeLayerGrainFromTokens([parts[1] ?? '']);
    const existingPrimary = existing.split('/')[0] ?? '';
    if (existingPrimary === 'DF') {
      return forcePrimaryLayerGrain(line, 'FC');
    }

    return line;
  });
}

function forceLayerIncludeSurfaceHoar(line: string) {
  const [mainPart, ...commentParts] = line.split('|');
  const main = mainPart.trim();
  if (!main) {
    return line;
  }
  const parts = main.split(/\s+/);
  if (parts.length < 3) {
    return line;
  }
  // Respect crust layers as single-grain crust rows.
  if (/\bcrust\b/i.test(main)) {
    return line;
  }

  const normalized = normalizeLayerGrainFromTokens([parts[1] ?? '']);
  const pieces = normalized
    .split('/')
    .map((piece) => piece.trim())
    .filter(Boolean);

  if (pieces.length === 0) {
    parts[1] = 'SH';
  } else if (pieces.includes('SH')) {
    if (pieces.length >= 2) {
      parts[1] = `${pieces[0]}/${pieces[1]}`;
    } else if (/\b\d+(?:\.\d+)?(?:mm|cm)\/\d+(?:\.\d+)?(?:mm|cm)\b/i.test(main)) {
      // Dual size with single SH usually indicates a dropped primary grain.
      // Default to FC/SH, matching common spoken pattern "facets, second grain surface hoar".
      parts[1] = 'FC/SH';
    } else {
      parts[1] = 'SH';
    }
  } else {
    // Keep existing primary grain and enforce SH as secondary when SH was spoken.
    parts[1] = `${pieces[0]}/SH`;
  }

  const rebuiltMain = parts.join(' ');
  if (commentParts.length === 0) {
    return rebuiltMain;
  }
  return `${rebuiltMain} | ${commentParts.join('|').trim()}`;
}

function applySurfaceHoarByBottom(lines: string[], rawNotes?: string) {
  const targetBottoms = collectSurfaceHoarBottomDepths(rawNotes);
  const primaryOverrides = collectSurfaceHoarOverridesByBottom(rawNotes);
  if (targetBottoms.size === 0) {
    return lines;
  }

  return lines.map((line) => {
    const range = parseLeadingLayerRange(line);
    if (!range) {
      return line;
    }
    if (!targetBottoms.has(range.bottom)) {
      return line;
    }
    const withSurfaceHoar = forceLayerIncludeSurfaceHoar(line);
    const primary = primaryOverrides.get(range.bottom) || detectPrimaryGrainForBottom(rawNotes, range.bottom);
    if (!primary) {
      return withSurfaceHoar;
    }
    return forceLayerGrain(withSurfaceHoar, `${primary}/SH`);
  });
}

function collectHardnessCueByBottom(rawNotes?: string) {
  const overrides = new Map<number, string>();
  if (!rawNotes?.trim()) {
    return overrides;
  }

  const normalizeSpokenHardnessToken = (token: string) => {
    const t = token.toLowerCase().replace(/\s+/g, ' ').trim();
    const isPlus = /\bplus\b/.test(t);
    let base = '';
    if (/\b(fist|fissure|fisher|fifth)\b/.test(t)) {
      base = 'F';
    } else if (/\bfour\s+finger\b/.test(t)) {
      base = '4F';
    } else if (/\bone\s+finger\b/.test(t)) {
      base = '1F';
    } else if (/\bpencil\b/.test(t)) {
      base = 'P';
    } else if (/\bknife\b/.test(t)) {
      base = 'K';
    } else if (/\bice\b/.test(t)) {
      base = 'I';
    }
    if (!base) {
      return '';
    }
    return `${base}${isPlus ? '+' : ''}`;
  };

  const extractSpokenHardnessMentions = (clause: string) => {
    const mentions: string[] = [];
    // ASR sometimes turns "fist resistance/hardness" into "first resistance/hardness".
    if (/\bfirst(?:\s+plus)?\s+(?:hardness|resistance)\b/i.test(clause)) {
      mentions.push(/\bfirst\s+plus\s+(?:hardness|resistance)\b/i.test(clause) ? 'F+' : 'F');
    }
    const regex = /\b(?:fist|fissure|fisher|fifth|four\s+finger|one\s+finger|pencil|knife|ice)(?:\s+plus)?\b/gi;
    for (const match of clause.matchAll(regex)) {
      const normalized = normalizeSpokenHardnessToken(match[0] ?? '');
      if (normalized) {
        mentions.push(normalized);
      }
    }
    return mentions;
  };

  const clauses = splitCueClauses(rawNotes);
  let lastLayerBottom: number | null = null;
  let lastLayerClauseIndex = -9999;
  const firstMentionByBottom = new Map<number, string>();

  for (let i = 0; i < clauses.length; i += 1) {
    const clause = clauses[i];
    const toMatches = Array.from(clause.matchAll(/\bto\s+(\d+(?:\.\d+)?)\s*(?:centimet(?:er|re)s?|cm)?\b/gi));
    const nearest = toMatches[toMatches.length - 1];
    const bottom = nearest?.[1] ? Number(nearest[1]) : NaN;
    if (Number.isFinite(bottom)) {
      lastLayerBottom = bottom;
      lastLayerClauseIndex = i;
    }

    const normalized = clause.toLowerCase();
    const targetBottom = Number.isFinite(bottom)
      ? bottom
      : lastLayerBottom !== null && i - lastLayerClauseIndex <= 2
        ? lastLayerBottom
        : NaN;
    if (!Number.isFinite(targetBottom)) {
      continue;
    }

    const spokenMentions = extractSpokenHardnessMentions(clause);
    const hasTransitionCue =
      /\bto\b/.test(normalized) ||
      /\bhardness\s*2\b/.test(normalized) ||
      /\bhardness\s*two\b/.test(normalized) ||
      /\bsecond\s+hardness\b/.test(normalized);

    if (spokenMentions.length > 0 && !firstMentionByBottom.has(targetBottom)) {
      firstMentionByBottom.set(targetBottom, spokenMentions[0]);
    }

    // Single spoken hardness cues should still win over AI drift.
    if (spokenMentions.length === 1 && !hasTransitionCue && /\b(hardness|resistance)\b/.test(normalized)) {
      overrides.set(targetBottom, spokenMentions[0]);
      continue;
    }

    if (spokenMentions.length >= 2 && hasTransitionCue) {
      const first = spokenMentions[0];
      const second = spokenMentions[1];
      if (first && second) {
        overrides.set(targetBottom, `${first}-${second}`);
        continue;
      }
    }

    if (spokenMentions.length === 1 && hasTransitionCue) {
      const first = firstMentionByBottom.get(targetBottom) ?? '';
      const second = spokenMentions[0];
      if (first && second && first !== second) {
        overrides.set(targetBottom, `${first}-${second}`);
        continue;
      }
    }

    if (/\bfist\s+plus\b/.test(normalized)) {
      overrides.set(targetBottom, 'F+');
      continue;
    }
    if (/\bfour\s+finger\s+plus\b/.test(normalized)) {
      overrides.set(targetBottom, '4F+');
      continue;
    }
    if (/\bone\s+finger\s+plus\b/.test(normalized)) {
      overrides.set(targetBottom, '1F+');
      continue;
    }
    if (/\bpencil\s+plus\b/.test(normalized)) {
      overrides.set(targetBottom, 'P+');
      continue;
    }
    if (/\bknife\s+plus\b/.test(normalized)) {
      overrides.set(targetBottom, 'K+');
      continue;
    }
  }

  return overrides;
}

function applyHardnessCueByBottom(lines: string[], rawNotes?: string) {
  const overrides = collectHardnessCueByBottom(rawNotes);
  if (overrides.size === 0) {
    return lines;
  }

  return lines.map((line) => {
    const range = parseLeadingLayerRange(line);
    if (!range) {
      return line;
    }
    const forced = overrides.get(range.bottom);
    if (!forced) {
      return line;
    }

    const [mainPart, ...commentParts] = line.split('|');
    const parts = mainPart.trim().split(/\s+/);
    if (parts.length < 3) {
      return line;
    }
    // If we extracted an explicit spoken hardness override (including transitions
    // like P-1F+), always apply it, even when AI already emitted a transition.
    parts[2] = forced;
    const rebuiltMain = parts.join(' ');
    if (commentParts.length === 0) {
      return rebuiltMain;
    }
    return `${rebuiltMain} | ${commentParts.join('|').trim()}`;
  });
}

function sanitizeLayerComments(lines: string[]) {
  const stripPhrasePatterns = [
    /\b(?:hardness\s*2|hardness\s*two|second\s+hardness)\b/gi,
  ];
  const dropCommentPatterns = [
    /^another\s+crust$/i,
    /^a\s+crust$/i,
    /^crust$/i,
  ];

  return lines.map((line) => {
    const [mainPart, ...commentParts] = line.split('|');
    if (commentParts.length === 0) {
      return line.trim();
    }

    const main = mainPart.trim().replace(/\s+/g, ' ');
    let comment = commentParts.join('|').replace(/\s+/g, ' ').trim();

    for (const pattern of stripPhrasePatterns) {
      comment = comment.replace(pattern, ' ');
    }

    comment = comment
      .replace(/\s*,\s*/g, ', ')
      .replace(/^[,\s]+|[,\s]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!comment || dropCommentPatterns.some((pattern) => pattern.test(comment))) {
      return main;
    }

    return `${main} | ${comment}`;
  });
}

function canonicalizeLayerSchema(lines: string[]) {
  type Parsed = {
    top: number;
    bottom: number;
    grain: string;
    hardness: string;
    size: string;
    crust: boolean;
    red: boolean;
    comment: string;
  };

  const grainFromToken = (token: string) => {
    const clean = normalizeLayerGrainPiece(token);
    return /^(?:PP|DF|RG|FC|FCxr|IFrc|MFcr|SH|DH|MF|IF)$/.test(clean) ? clean : '';
  };

  const parseOne = (line: string): Parsed | null => {
    const [mainPart, ...commentParts] = line.split('|');
    const main = mainPart.trim();
    const range = parseLeadingLayerRange(main);
    if (!range) return null;

    const raw = main
      .replace(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)(?:\s+|$)/, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    let hardness = '';
    const grains: string[] = [];
    let size = '';
    let crust = false;
    let red = false;

    for (let i = 0; i < raw.length; i += 1) {
      const token = raw[i];
      const norm = token.trim();
      if (!norm) continue;
      if (/^red$/i.test(norm)) {
        red = true;
        continue;
      }
      if (/^crust$/i.test(norm)) {
        crust = true;
        continue;
      }
      if (!hardness && isLayerHardnessToken(norm)) {
        hardness = norm.toUpperCase();
        continue;
      }
      if (!size && isSizeToken(norm)) {
        size = norm.toLowerCase().replace(/\s+/g, '');
        continue;
      }
      if (norm.includes('/')) {
        const parts = norm
          .split('/')
          .map((piece) => grainFromToken(piece))
          .filter(Boolean);
        if (parts.length > 0) {
          grains.push(...parts);
          continue;
        }
      }
      const grain = grainFromToken(norm);
      if (grain) {
        grains.push(grain);
      }
    }

    if (!hardness) hardness = '1F';
    const dedupedGrains = grains.filter((g, idx) => grains.indexOf(g) === idx);
    let grain = dedupedGrains.slice(0, 2).join('/');
    if (!grain) grain = 'RG';
    if (!grain.includes('/') && dedupedGrains.length >= 2) {
      grain = `${dedupedGrains[0]}/${dedupedGrains[1]}`;
    }
    if (grain.includes('/')) {
      const [g1, g2] = grain.split('/');
      if (g1 && g2) {
        grain = `${g1}/${g2}`;
      }
    }
    if (/^(IFrc|MFcr)$/.test(grain)) {
      crust = true;
      hardness = hardness || 'K';
    }

    return {
      top: range.top,
      bottom: range.bottom,
      grain,
      hardness,
      size,
      crust,
      red,
      comment: commentParts.join('|').trim(),
    };
  };

  const parsed = lines.map(parseOne).filter((value): value is Parsed => Boolean(value));
  parsed.sort((a, b) => (a.top === b.top ? a.bottom - b.bottom : a.top - b.top));

  const rebuilt: string[] = [];
  let prevBottom: number | null = null;
  for (const entry of parsed) {
    let top = entry.top;
    let bottom = entry.bottom;
    if (prevBottom !== null) {
      if (top < prevBottom) {
        top = prevBottom;
      }
      if (top > prevBottom) {
        top = prevBottom;
      }
    }
    if (bottom <= top) continue;

    const parts = [
      `${top}-${bottom}`,
      entry.grain,
      entry.hardness,
      entry.crust ? 'crust' : '',
      entry.size,
      entry.red ? 'red' : '',
    ].filter(Boolean);
    const main = parts.join(' ').replace(/\s+/g, ' ').trim();
    rebuilt.push(entry.comment ? `${main} | ${entry.comment}` : main);
    prevBottom = bottom;
  }

  return rebuilt;
}

const LAYER_GRAIN_TOKEN = /^(?:PP|DF|RG|FC|FCxr|IFrc|MFcr|SH|DH|MF|IF)(?:\/(?:PP|DF|RG|FC|FCxr|IFrc|MFcr|SH|DH|MF|IF))?$/;

type ValidatedLayerLine = {
  line: string;
  top: number;
  bottom: number;
};

function parseAndValidateLayerLine(line: string): ValidatedLayerLine {
  const normalized = line.trim().replace(/\s+/g, ' ');
  const split = normalized.split('|');
  const main = split[0]?.trim() ?? '';
  if (!main) {
    throw new Error(`Layer validator rejected empty layer line.`);
  }

  const tokens = main.split(' ');
  if (tokens.length < 3) {
    throw new Error(`Layer validator rejected malformed line: "${line}"`);
  }

  const range = parseLeadingLayerRange(tokens[0] ?? '');
  if (!range) {
    throw new Error(`Layer validator rejected invalid range: "${line}"`);
  }
  if (range.bottom <= range.top) {
    throw new Error(`Layer validator rejected non-positive thickness: "${line}"`);
  }

  const grain = tokens[1] ?? '';
  if (!LAYER_GRAIN_TOKEN.test(grain)) {
    throw new Error(`Layer validator rejected invalid grain token "${grain}" in "${line}"`);
  }

  const hardness = tokens[2] ?? '';
  if (!isLayerHardnessToken(hardness)) {
    throw new Error(`Layer validator rejected invalid hardness token "${hardness}" in "${line}"`);
  }

  const tail = tokens.slice(3);
  for (const token of tail) {
    if (token === 'red' || token === 'crust') {
      continue;
    }
    if (isSizeToken(token)) {
      continue;
    }
    throw new Error(`Layer validator rejected unknown token "${token}" in "${line}"`);
  }

  if (split.length > 1) {
    const comment = split.slice(1).join('|').trim();
    if (!comment) {
      throw new Error(`Layer validator rejected empty comment section in "${line}"`);
    }
  }

  return {
    line,
    top: range.top,
    bottom: range.bottom,
  };
}

function validateLayerBlockOrThrow(lines: string[]) {
  const validated = lines.map((line) => parseAndValidateLayerLine(line));
  const seenRanges = new Set<string>();
  let previousBottom: number | null = null;

  for (const layer of validated) {
    const key = `${layer.top}-${layer.bottom}`;
    if (seenRanges.has(key)) {
      throw new Error(`Layer validator rejected duplicate range "${key}".`);
    }
    seenRanges.add(key);

    if (previousBottom !== null && layer.top < previousBottom) {
      throw new Error(
        `Layer validator rejected overlapping or out-of-order range "${layer.top}-${layer.bottom}" after "${previousBottom}".`
      );
    }

    previousBottom = layer.bottom;
  }
}

function isLayerValidationError(error: unknown) {
  return error instanceof Error && error.message.startsWith('Layer validator rejected');
}

function sanitizeAiOnlyFormattedText(formattedText: string, resolvedValues?: Record<string, string>, rawNotes?: string) {
  const postProcessed = postProcessFormattedText(formattedText);
  const sections = extractSectionLines(postProcessed);

  // Deterministic anchor:
  // when we have parsed resolvedValues from transcript/raw-notes, rebuild a canonical
  // draft and prefer its layer/stability blocks over free-form AI text.
  let canonicalSections = sections;
  if (resolvedValues && Object.keys(resolvedValues).length > 0) {
    const canonicalDraft: ProfileDraft = {
      rawNotes: rawNotes ?? '',
      values: resolvedValues,
      updatedAt: new Date().toISOString(),
    };
    const canonicalFormatted = formatDraftToEngineText(canonicalDraft).formattedText;
    canonicalSections = extractSectionLines(canonicalFormatted);
  }

  const metadataLines = canonicalSections.metadata.map((line) => {
    if (!/^Total Hs:/i.test(line)) {
      return line;
    }
    const totalHs = (resolvedValues?.total_hs ?? '').trim();
    if (!totalHs) {
      return line;
    }
    return `Total Hs: ${totalHs.replace(/[^\d.]/g, '')} cm`;
  });
  const layers = applyImplicitConcernCue(
    applyResolvedRedHints(
      applyRawNotesTransitionHints(
        applyResolvedLayerTransitionHints(sanitizeAiLayerLines(canonicalSections.layers), resolvedValues),
        rawNotes
      ),
      resolvedValues
    ),
    rawNotes
  );
  const layersWithInlineCues = applyInlineRedCueByBottom(
    applyFacetsCueByBottom(applyHardnessCueByBottom(applySurfaceHoarByBottom(layers, rawNotes), rawNotes), rawNotes),
    rawNotes
  );
  const layersWithSizeHints = applyLayerSizeHints(layersWithInlineCues, rawNotes);
  const layersWithCleanComments = canonicalizeLayerSchema(sanitizeLayerComments(layersWithSizeHints));
  validateLayerBlockOrThrow(layersWithCleanComments);
  const stability = canonicalSections.stability
    .filter((line) => !isMalformedPseudoStability(line))
    .filter((line) => isCompleteStabilityLine(line));
  const normalizedStability = cleanupStabilityFalsePositives(
    applyPstOutcomeHints(stability.map((line) => normalizeStabilityFormatting(line)), rawNotes),
    rawNotes
  );
  const notes = sanitizeNotes(canonicalSections.notes);

  return [
    metadataLines.join('\n'),
    layersWithCleanComments.join('\n'),
    canonicalSections.temperatures.join('\n'),
    normalizedStability.join('\n'),
    notes.join('\n'),
  ]
    .filter((section) => section.trim().length > 0)
    .join('\n\n');
}

function formatWithLocalMock(rawNotes: string): FormatterResponse {
  const localParsedValues = extractDraftValuesFromRawNotes(rawNotes);
  const formatted = formatRawNotesToEngineText(rawNotes);
  return {
    formatterVersion: 'nivium-ai-v1',
    formattedText: formatted.formattedText,
    resolvedValues: localParsedValues,
    warnings: formatted.warnings,
  };
}

type ParsedMultipartField = {
  name: string;
  value: string;
};

type ParsedMultipartFile = {
  name: string;
  filename: string;
  mimeType: string;
  content: Buffer;
};

function splitBuffer(source: Buffer, separator: Buffer) {
  const chunks: Buffer[] = [];
  let start = 0;
  let index = source.indexOf(separator, start);

  while (index !== -1) {
    chunks.push(source.slice(start, index));
    start = index + separator.length;
    index = source.indexOf(separator, start);
  }

  chunks.push(source.slice(start));
  return chunks;
}

function trimLeadingCrlf(buffer: Buffer) {
  if (buffer.length >= 2 && buffer[0] === 13 && buffer[1] === 10) {
    return buffer.slice(2);
  }
  return buffer;
}

function trimTrailingCrlf(buffer: Buffer) {
  if (buffer.length >= 2 && buffer[buffer.length - 2] === 13 && buffer[buffer.length - 1] === 10) {
    return buffer.slice(0, -2);
  }
  return buffer;
}

function parseMultipartFormData(body: Buffer, contentTypeHeader: string) {
  const boundaryMatch = contentTypeHeader.match(/boundary=([^;]+)/i);
  if (!boundaryMatch?.[1]) {
    throw new Error('Missing multipart boundary.');
  }

  const boundary = boundaryMatch[1].trim().replace(/^"|"$/g, '');
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const headerSeparator = Buffer.from('\r\n\r\n');
  const parts = splitBuffer(body, boundaryBuffer);
  const fields: ParsedMultipartField[] = [];
  const files: ParsedMultipartFile[] = [];

  parts.forEach((rawPart) => {
    const part = trimTrailingCrlf(trimLeadingCrlf(rawPart));
    if (part.length === 0 || part.equals(Buffer.from('--'))) {
      return;
    }

    const headerIndex = part.indexOf(headerSeparator);
    if (headerIndex === -1) {
      return;
    }

    const headerText = part.slice(0, headerIndex).toString('utf8');
    const content = trimTrailingCrlf(part.slice(headerIndex + headerSeparator.length));
    const headerLines = headerText.split('\r\n');
    const disposition = headerLines.find((line) => /^content-disposition:/i.test(line));
    if (!disposition) {
      return;
    }

    const nameMatch = disposition.match(/name="([^"]+)"/i);
    if (!nameMatch?.[1]) {
      return;
    }
    const name = nameMatch[1];
    const filenameMatch = disposition.match(/filename="([^"]*)"/i);
    const contentTypeLine = headerLines.find((line) => /^content-type:/i.test(line));
    const mimeType = contentTypeLine?.split(':')[1]?.trim() || 'application/octet-stream';

    if (filenameMatch) {
      files.push({
        name,
        filename: filenameMatch[1] || 'upload.bin',
        mimeType,
        content,
      });
      return;
    }

    fields.push({
      name,
      value: content.toString('utf8'),
    });
  });

  return { fields, files };
}

async function transcribeAudioWithOpenAI(args: {
  audio: Buffer;
  filename: string;
  mimeType: string;
}) {
  const form = new FormData();
  const blob = new Blob([new Uint8Array(args.audio)], { type: args.mimeType || 'audio/mp4' });
  form.append('file', blob, args.filename || 'voice-note.m4a');
  form.append('model', OPENAI_TRANSCRIBE_MODEL);
  form.append('temperature', '0');
  form.append(
    'prompt',
    [
      'Snow profile dictation domain.',
      'Prefer exact terms: facets, rounds, surface hoar, depth hoar, decomposing fragments, rain crust, melt-freeze crust.',
      'Keep numeric depths and sizes exact.',
      'Keep stability test terms exact: compression test, propagation saw test, ECT, PST, END, ARR.',
      'Do not paraphrase technical terms.',
    ].join(' ')
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(`${OPENAI_BASE_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: form,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`OpenAI transcription timed out after ${OPENAI_TIMEOUT_MS} ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI transcription request failed with status ${response.status}: ${text}`);
  }

  const payload = (await response.json()) as { text?: string };
  const transcript = String(payload.text ?? '').trim();
  if (!transcript) {
    throw new Error('OpenAI transcription returned empty text.');
  }
  return transcript;
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    json(res, 200, {
      ok: true,
      service: 'nivium-formatter',
      formatterVersion: 'nivium-ai-v1',
      mode: OPENAI_API_KEY ? `openai (${OPENAI_MODEL})` : 'openai-unconfigured',
      transcribeModel: OPENAI_TRANSCRIBE_MODEL,
      transcribeRoute: '/transcribe-format',
    });
    return;
  }

  if (req.method !== 'POST' || (req.url !== '/' && req.url !== '/format' && req.url !== '/transcribe-format')) {
    json(res, 404, { error: 'Not found.' });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const bodyBuffer = Buffer.concat(chunks);
    const startedAt = Date.now();

    if (req.url === '/transcribe-format') {
      if (!OPENAI_API_KEY) {
        json(res, 503, { error: 'Audio transcription requires OPENAI_API_KEY in formatter service.' });
        return;
      }

      const contentType = String(req.headers['content-type'] ?? '');
      if (!contentType.toLowerCase().includes('multipart/form-data')) {
        json(res, 400, { error: 'multipart/form-data with an audio file is required.' });
        return;
      }

      const parsed = parseMultipartFormData(bodyBuffer, contentType);
      const audioFile = parsed.files.find((file) => file.name === 'audio');
      if (!audioFile) {
        json(res, 400, { error: 'audio file field is required.' });
        return;
      }

      const formatterVersionField = parsed.fields.find((field) => field.name === 'formatterVersion')?.value?.trim() ?? '';
      if (formatterVersionField && formatterVersionField !== 'nivium-ai-v1') {
        json(res, 400, { error: `Unsupported formatterVersion: ${formatterVersionField}.` });
        return;
      }

      const audioHash = hashAudioBuffer(audioFile.content);
      const cached = getCachedTranscribeResponse(audioHash);
      if (cached) {
        console.log(
          `[transcribe] cache hit in ${Date.now() - startedAt}ms bytes=${audioFile.content.length} outputChars=${cached.formattedText.length}`
        );
        json(res, 200, cached);
        return;
      }

      console.log(`[transcribe] request start model=${OPENAI_TRANSCRIBE_MODEL} bytes=${audioFile.content.length}`);
      const transcript = await transcribeAudioWithOpenAI({
        audio: audioFile.content,
        filename: audioFile.filename || 'voice-note.m4a',
        mimeType: audioFile.mimeType || 'audio/mp4',
      });
      const formatted = formatTranscriptDeterministic(transcript);
      const payload = {
        ...formatted,
        transcript,
      };
      setCachedTranscribeResponse(audioHash, payload);
      console.log(
        `[transcribe] request ok in ${Date.now() - startedAt}ms transcriptChars=${transcript.length} outputChars=${formatted.formattedText.length}`
      );
      json(res, 200, payload);
      return;
    }

    const payload = JSON.parse(bodyBuffer.toString('utf8')) as FormatterRequest;
    const rawNotes = String(payload.rawNotes ?? '').trim();
    const formatterVersion = String(payload.formatterVersion ?? '').trim();
    console.log(`[formatter] request start mode=${OPENAI_API_KEY ? 'openai' : 'openai-unconfigured'} chars=${rawNotes.length}`);

        if (!rawNotes) {
          json(res, 400, { error: 'rawNotes is required.' });
          return;
        }
        if (formatterVersion && formatterVersion !== 'nivium-ai-v1') {
      json(res, 400, { error: `Unsupported formatterVersion: ${formatterVersion}.` });
      return;
    }

        if (!OPENAI_API_KEY) {
          json(res, 503, { error: 'Raw-notes formatting requires OPENAI_API_KEY in formatter service.' });
          return;
        }

        const response = await formatWithOpenAI(rawNotes);

        if (!response.formattedText.trim()) {
          json(res, 422, { error: 'Formatter could not produce engine-ready text from these raw notes.' });
          return;
        }

        console.log(`[formatter] request ok in ${Date.now() - startedAt}ms outputChars=${response.formattedText.length}`);
        json(res, 200, response);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown formatter error.';
        const status = isLayerValidationError(error) ? 422 : 500;
        console.error(`[formatter] request failed: ${message}`);
        json(res, status, {
          error: `Formatter failed: ${message}`,
        });
  }
});

const port = Number(process.env.NIVIUM_FORMATTER_PORT || 8788);
const host = process.env.NIVIUM_FORMATTER_HOST || '0.0.0.0';

server.listen(port, host, () => {
  console.log(`Nivium formatter service listening on http://${host}:${port}`);
  console.log(`Mode: ${OPENAI_API_KEY ? `openai (${OPENAI_MODEL})` : 'openai-unconfigured'}`);
});
