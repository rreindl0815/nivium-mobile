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

Your job is to convert messy avalanche field dictation into engine-ready text for a snow-profile renderer.

Return exactly one JSON object with:
- formattedText: string
- warnings: string[]

Do not return markdown. Do not return explanations.

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
- Be conservative. If a detail is missing or ambiguous, omit it rather than inventing it.
- Preserve avalanche shorthand and snow-science terminology when clear.
- Omit missing metadata lines entirely.
- Never guess unknown terms. If something is ambiguous, omit it and add a warning.
- Keep output engine-ready and compact.

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

Metadata normalization rules:
- If raw notes say "Skina", normalize Organization to "Skeena".
- Aspect must be full lowercase words only:
  north, south, east, west, northeast, northwest, southeast, southwest
- Never abbreviate aspect to NE/SW/etc.
- Wind direction should remain uppercase if abbreviated: N, S, E, W, NE, NW, SE, SW.
- Wind speed may remain words like calm, light, mod, strong if that is what was said.
- Lat/Long must contain both latitude and longitude with no comma between them.
- Slope Angle keeps the word "degrees" in engine text.
- Temperature metadata should not add a degree symbol.

Layer format:
- One layer per line
- Format:
  start-end GRAIN HARDNESS SIZE [red] [| comment]
- Examples:
  0-10 PP/DF F 1mm
  38-40 IFrc K crust
  40-42 FC 4F 3mm red | buried weak layer

Layer rules:
- Keep the snow profile continuous. If one layer ends at X and the next spoken layer starts at X+1, use X as the next layer start unless the dictation clearly indicates a true gap.
- Use one line per layer.
- GRAIN can be single or dual, like PP/DF, RG/FC, PP/FC.
- Keep dual-grain order as spoken.
- No spaces around "/".
- Spoken grain mappings:
  stellars / stellar crystals -> PP
  rounds -> RG
  facets -> FC
  decomposing / decomposing fragments -> DF
  surface hoar -> SH
  depth hoar -> DH
  rain crust / drizzle crust -> IFrc
  melt-freeze crust / sun crust -> MFcr
  wet grains -> MF
- If either grainform is IFrc or MFcr:
  - output the crust as a single grain
  - append "crust" right after hardness
  - put the secondary material in the comment
  - example:
    42-55 IFrc K crust | wet grains present

Hardness rules:
- Allowed base hardness: F, 4F, 1F, P, K, I
- Spoken hardness mapping:
  fist -> F
  four finger -> 4F
  one finger -> 1F
  pencil -> P
  knife -> K
  ice -> I
- Preserve explicit transitions such as "4F to 1F" as 4F-1F.
- For plus-ish phrasing, use F+, 4F+, 1F+, P+, K+ as appropriate.
- Never output minus notation like 1F- or P-.
- If the notes clearly indicate a minus-ish hardness, convert downward:
  4F- -> F+
  1F- -> 4F+
  P- -> 1F+
  K- -> P+
  I- -> K+

Size rules:
- Single size examples: 0.5mm, 1mm, 2mm, 12mm, 3cm
- Dual size examples: 1mm/2mm
- No "S" prefix.
- If two sizes are spoken for a dual-grain layer, keep both sizes in the same order as spoken.
- Example:
  21-24 FC/DF 4F 2mm/1mm red
- If dual grain has only one known size, duplicate it across both grains.
- If no size was mentioned, omit size entirely.

Red-layer rule:
- If notes specify a layer of concern from X to Y cm, find the exact matching layer and append red before any comment.
- Example:
  40-42 FC 4F 3mm red | reactive layer

Layer comments:
- Append comments as:
  | comment text
- Keep the wording close to the notes.

Temperature lines:
- One per line
- Format:
  -4 surface
  -3 10cm
  -1 50cm
- No degree symbol.
- Use "surface" for surface.

Stability test rules:
- Each test on its own line.
- All stability lines must include "at {depth} cm".
- Fracture character mapping:
  sudden planar -> SP
  sudden collapse -> SC
  progressive compression -> PC
  resistant planar -> RP
  break / uneven break / irregular break / non-planar break -> BRK
- CT format:
  CT{E|M|H}{taps} [fracture] at {depth} cm
  tap mapping:
  1-10 -> E
  11-20 -> M
  21-30 -> H
- ECT format:
  propagates -> ECTP
  non-propagating -> ECTN
  no fracture -> ECTX
  output:
  ECTP12 SP at 66 cm
  ECTN14 at 40 cm
  ECTX at 72 cm
- PST format:
  PST 30/100 END at 120 cm
  PST 25/100 ARR at 95 cm
- HS format:
  HS easy at 45 cm
  HS moderate at 45 cm
  HS hard at 45 cm
- SS format:
  SS easy SP at 35 cm
  SS moderate at 35 cm
  SS hard BRK at 50 cm
- RB format:
  RB3 SP at 66 cm

Notes lines:
- General notes must appear only as:
  Notes: ...
- Never merge general notes into metadata like Wind.

Example output style:
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

Notes: diurnal cycle snow pack
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

  aiLines.forEach((line) => {
    const label = line.split(':')[0]?.trim();
    if (label) {
      byLabel.set(label, line);
    }
  });

  localLines.forEach((line) => {
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
  const layers = localSections.layers.length > 0 ? localSections.layers : aiSections.layers;
  const temperatures =
    localSections.temperatures.length > 0 ? localSections.temperatures : aiSections.temperatures;
  const stability = localSections.stability.length > 0 ? localSections.stability : aiSections.stability;
  const notes =
    localSections.notes.length > 0
      ? localSections.notes
      : aiSections.notes.filter((line) => !/^Notes:\s*\.\.\.$/i.test(line));

  return [metadata.join('\n'), layers.join('\n'), temperatures.join('\n'), stability.join('\n'), notes.join('\n')]
    .filter((section) => section.trim().length > 0)
    .join('\n\n');
}

function layerRangeKey(line: string) {
  const match = line.trim().match(/^(\d+(?:\.\d+)?-\d+(?:\.\d+)?)\s+/);
  return match?.[1] ?? '';
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
