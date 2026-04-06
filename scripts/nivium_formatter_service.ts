import { createServer } from 'node:http';

import { formatDraftToEngineText, formatRawNotesToEngineText } from '../utils/formatter';
import { extractDraftValuesFromRawNotes } from '../utils/raw-note-parser';
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
const OPENAI_MODEL = process.env.OPENAI_FORMATTER_MODEL?.trim() || 'gpt-4o-mini';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1';

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
- surface hoar -> SH
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
      ? aiSections.notes.filter((line) => !/^Notes:\s*\.\.\.$/i.test(line))
      : localSections.notes.filter((line) => !/^Notes:\s*\.\.\.$/i.test(line));

  return [metadata.join('\n'), layers.join('\n'), temperatures.join('\n'), stability.join('\n'), notes.join('\n')]
    .filter((section) => section.trim().length > 0)
    .join('\n\n');
}

function layerRangeKey(line: string) {
  const match = line.trim().match(/^(\d+(?:\.\d+)?-\d+(?:\.\d+)?)\s+/);
  return match?.[1] ?? '';
}

function mergeLayerLines(localLines: string[], aiLines: string[]) {
  if (aiLines.length === 0) {
    return localLines;
  }
  if (localLines.length === 0) {
    return aiLines;
  }

  const aiByRange = new Map(
    aiLines
      .map((line) => [layerRangeKey(line), line] as const)
      .filter(([key]) => Boolean(key))
  );

  const merged = localLines.map((localLine) => {
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

  const localRanges = new Set(localLines.map((line) => layerRangeKey(line)).filter(Boolean));
  aiLines.forEach((aiLine) => {
    const key = layerRangeKey(aiLine);
    if (!key || localRanges.has(key)) {
      return;
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
  if (aiLines.length === 0) {
    return localLines;
  }
  if (localLines.length === 0) {
    return aiLines;
  }

  const localByDepth = new Map(
    localLines
      .map((line) => [stabilityDepth(line), line] as const)
      .filter(([depth]) => Boolean(depth))
  );

  const merged = aiLines.filter((aiLine) => {
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

  localLines.forEach((localLine) => {
    const key = stabilityLineKey(localLine);
    if (!key || seen.has(key)) {
      return;
    }
    merged.push(localLine);
    seen.add(key);
  });

  return merged;
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

  return {
    formatterVersion: 'nivium-ai-v1',
    formattedText: mergeFormatterSections(
      patchDualSizeLayerLines(postProcessFormattedText(parsed.formattedText), rawNotes),
      rawNotes
    ),
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    resolvedValues: extractDraftValuesFromRawNotes(rawNotes),
  };
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
      mode: OPENAI_API_KEY ? `openai (${OPENAI_MODEL})` : 'local-mock',
    });
    return;
  }

  if (req.method !== 'POST' || (req.url !== '/' && req.url !== '/format')) {
    json(res, 404, { error: 'Not found.' });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as FormatterRequest;
    const rawNotes = String(payload.rawNotes ?? '').trim();
    const formatterVersion = String(payload.formatterVersion ?? '').trim();
    const startedAt = Date.now();
    console.log(`[formatter] request start mode=${OPENAI_API_KEY ? 'openai' : 'local-mock'} chars=${rawNotes.length}`);

        if (!rawNotes) {
          json(res, 400, { error: 'rawNotes is required.' });
          return;
        }
        if (formatterVersion && formatterVersion !== 'nivium-ai-v1') {
      json(res, 400, { error: `Unsupported formatterVersion: ${formatterVersion}.` });
      return;
    }

        const response =
          OPENAI_API_KEY
            ? await formatWithOpenAI(rawNotes)
            : formatWithLocalMock(rawNotes);

        if (!response.formattedText.trim()) {
          json(res, 422, { error: 'Formatter could not produce engine-ready text from these raw notes.' });
          return;
        }

        console.log(`[formatter] request ok in ${Date.now() - startedAt}ms outputChars=${response.formattedText.length}`);
        json(res, 200, response);
      } catch (error) {
        console.error(`[formatter] request failed: ${error instanceof Error ? error.message : 'Unknown formatter error.'}`);
        json(res, 500, {
          error: `Formatter failed: ${error instanceof Error ? error.message : 'Unknown formatter error.'}`,
        });
  }
});

const port = Number(process.env.NIVIUM_FORMATTER_PORT || 8788);
const host = process.env.NIVIUM_FORMATTER_HOST || '0.0.0.0';

server.listen(port, host, () => {
  console.log(`Nivium formatter service listening on http://${host}:${port}`);
  console.log(`Mode: ${OPENAI_API_KEY ? `openai (${OPENAI_MODEL})` : 'local-mock'}`);
});
