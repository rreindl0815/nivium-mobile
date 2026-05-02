import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';

import type { SavedProfile } from '@/types/profile';

export type ParsedProfile = {
  metadata: { label: string; value: string }[];
  layers: string[];
  temperatures: string[];
  stabilityTests: string[];
  notes: string[];
};

export type ParsedLayer = {
  line: string;
  top: number;
  bottom: number;
  grain: string;
  hardness: string;
  size: string;
  comment: string;
  isRed: boolean;
};

export type ProfileHighlights = {
  layerCount: number;
  redLayerCount: number;
  temperatureCount: number;
  stabilityCount: number;
  noteCount: number;
  date: string;
  observer: string;
  aspect: string;
  slopeAngle: string;
  totalHs: string;
  surfaceGrain: string;
};

export function parseFormattedProfile(formattedText: string): ParsedProfile {
  const metadata: { label: string; value: string }[] = [];
  const layers: string[] = [];
  const temperatures: string[] = [];
  const stabilityTests: string[] = [];
  const notes: string[] = [];

  const stabilityPattern =
    /\b(?:CT(?:E|M|H)?\d*(?:\s+(?:SP|SC|PC|RP|BRK))?\s+at\s+\d+(?:\.\d+)?\s*cm|ECT[PNX]?\d*(?:\s+(?:SP|SC|PC|RP|BRK))?\s*(?:at\s+\d+(?:\.\d+)?\s*cm)?|PST\s+\d+(?:\.\d+)?\/\d+(?:\.\d+)?(?:\s+(?:END|ARR))?\s+at\s+\d+(?:\.\d+)?\s*cm|HS\s+(?:easy|moderate|hard)\s+at\s+\d+(?:\.\d+)?\s*cm|SS\s+(?:easy|moderate|hard)(?:\s+(?:SP|SC|PC|RP|BRK))?\s+at\s+\d+(?:\.\d+)?\s*cm|RB\d+\s+at\s+\d+(?:\.\d+)?\s*cm)\b/gi;

  const splitInlineStability = (line: string) => {
    const found = Array.from(line.matchAll(stabilityPattern)).map((match) => match[0].replace(/\s+/g, ' ').trim());
    const cleaned = line
      .replace(stabilityPattern, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return {
      cleaned,
      tests: found,
    };
  };

  formattedText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const metadataMatch = line.match(/^([^:]+):\s*(.+)$/);
      if (metadataMatch) {
        metadata.push({
          label: metadataMatch[1],
          value: metadataMatch[2],
        });
        return;
      }

      if (/^-?\d+(?:\.\d+)?\s+(?:surface|\d+(?:\.\d+)?cm)$/i.test(line)) {
        temperatures.push(line);
        return;
      }

      if (/^(CT|ECT|PST|HS|SS|DT|RB)/i.test(line)) {
        const split = splitInlineStability(line);
        if (split.tests.length > 0) {
          split.tests.forEach((test) => stabilityTests.push(test));
        } else {
          stabilityTests.push(line);
        }
        return;
      }

      if (/^\d+(?:\.\d+)?-\d+(?:\.\d+)?\s+/i.test(line)) {
        const split = splitInlineStability(line);
        if (/^\d+(?:\.\d+)?-\d+(?:\.\d+)?\s+/i.test(split.cleaned)) {
          layers.push(split.cleaned);
        } else {
          layers.push(line);
        }
        split.tests.forEach((test) => stabilityTests.push(test));
        return;
      }

      notes.push(line);
    });

  return {
    metadata,
    layers,
    temperatures,
    stabilityTests,
    notes,
  };
}

export function getMetadataValue(parsed: ParsedProfile, label: string) {
  return parsed.metadata.find((item) => item.label === label)?.value ?? '';
}

export function getProfileHighlights(parsed: ParsedProfile): ProfileHighlights {
  return {
    layerCount: parsed.layers.length,
    redLayerCount: parsed.layers.filter((line) => /\bred\b/i.test(line)).length,
    temperatureCount: parsed.temperatures.length,
    stabilityCount: parsed.stabilityTests.length,
    noteCount: parsed.notes.length,
    date: getMetadataValue(parsed, 'Date'),
    observer: getMetadataValue(parsed, 'Observer'),
    aspect: getMetadataValue(parsed, 'Aspect'),
    slopeAngle: getMetadataValue(parsed, 'Slope Angle'),
    totalHs: getMetadataValue(parsed, 'Total Hs'),
    surfaceGrain: getMetadataValue(parsed, 'Surface Grain'),
  };
}

export function parseLayerLine(line: string): ParsedLayer | null {
  const match = line.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\s+(.+)$/);
  if (!match) {
    return null;
  }

  const top = Number(match[1]);
  const bottom = Number(match[2]);
  const rawTail = match[3].trim();
  const [main, comment] = rawTail.split('|').map((part) => part.trim());
  const cleanedMain = (main ?? '').replace(/\bred\b/gi, '').replace(/\s+/g, ' ').trim();
  const tokens = cleanedMain.split(' ').filter(Boolean);

  return {
    line,
    top,
    bottom,
    grain: tokens[0] ?? '',
    hardness: tokens[1] ?? '',
    size: tokens.find((token) => /\d+(?:\.\d+)?mm(?:\/\d+(?:\.\d+)?mm)?/i.test(token)) ?? '',
    comment: comment ?? '',
    isRed: /\bred\b/i.test(rawTail),
  };
}

export function parseLayers(parsed: ParsedProfile) {
  return parsed.layers.map((line) => parseLayerLine(line)).filter((layer): layer is ParsedLayer => Boolean(layer));
}

export function buildProfileChartHtml(parsed: ParsedProfile) {
  const layers = parseLayers(parsed);
  const totalHs = Number.parseFloat(getMetadataValue(parsed, 'Total Hs').replace(/[^\d.]/g, ''));
  const maxDepth = Math.max(totalHs || 0, ...layers.map((layer) => layer.bottom), 1);

  const layerMarkup = layers
    .map((layer) => {
      const height = Math.max(((layer.bottom - layer.top) / maxDepth) * 420, 16);
      const label = [layer.grain, layer.hardness, layer.size].filter(Boolean).join(' ');
      return `
        <div class="chart-layer ${layer.isRed ? 'chart-layer-red' : ''}" style="height:${height}px">
          <div class="chart-depth">${formatDepth(layer.top)}-${formatDepth(layer.bottom)}</div>
          <div class="chart-layer-label">${escapeHtml(label || layer.line)}</div>
        </div>
      `;
    })
    .join('');

  return `
    <div class="chart-panel">
      <div class="section-label">Snow Profile Chart</div>
      <div class="chart-shell">
        <div class="chart-depth-scale">
          ${buildDepthTicks(maxDepth)
            .map(
              (tick) => `
                <div class="chart-tick" style="bottom:${tick.position}%">
                  <span>${tick.label}</span>
                </div>
              `
            )
            .join('')}
        </div>
        <div class="chart-column">
          ${layerMarkup || '<div class="chart-empty">No parsed layers yet.</div>'}
        </div>
      </div>
    </div>
  `;
}

function buildDepthTicks(maxDepth: number) {
  const step = maxDepth <= 120 ? 20 : 50;
  const ticks = [];
  for (let depth = 0; depth <= maxDepth; depth += step) {
    ticks.push({
      label: `${depth} cm`,
      position: 100 - (depth / maxDepth) * 100,
    });
  }
  if (ticks.at(-1)?.label !== `${formatDepth(maxDepth)} cm`) {
    ticks.push({
      label: `${formatDepth(maxDepth)} cm`,
      position: 0,
    });
  }
  return ticks;
}

function formatDepth(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

export function buildProfileHtml(profile: SavedProfile) {
  const parsed = parseFormattedProfile(profile.formattedText);
  const highlights = getProfileHighlights(parsed);
  const chartHtml = buildProfileChartHtml(parsed);

  const metadataHtml = parsed.metadata
    .map(
      (item) => `
        <div class="meta-card">
          <div class="meta-label">${escapeHtml(item.label)}</div>
          <div class="meta-value">${escapeHtml(item.value)}</div>
        </div>
      `
    )
    .join('');

  const sectionList = (items: string[]) =>
    items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');

  const importantMeta = parsed.metadata.filter((item) =>
    ['Date', 'Observer', 'Aspect', 'Slope Angle', 'Total Hs', 'Surface Grain'].includes(item.label)
  );

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background: #f4efe5;
            color: #173248;
            margin: 0;
            padding: 24px;
          }
          .hero {
            background: linear-gradient(135deg, #173248, #284c66);
            color: #fff8ee;
            padding: 28px;
            border-radius: 28px;
            margin-bottom: 22px;
          }
          .eyebrow {
            text-transform: uppercase;
            letter-spacing: 1.6px;
            font-size: 11px;
            opacity: 0.78;
            margin-bottom: 10px;
          }
          h1 {
            margin: 0;
            font-size: 30px;
            line-height: 1.1;
          }
          .subtitle {
            margin-top: 10px;
            font-size: 15px;
            color: #d9e4ea;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
            margin-bottom: 22px;
          }
          .summary-strip {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 12px;
            margin-bottom: 18px;
          }
          .metrics-strip {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 12px;
            margin-bottom: 18px;
          }
          .summary-chip {
            background: #dfe8ed;
            border-radius: 18px;
            padding: 14px;
          }
          .metric-chip {
            background: #efe3cc;
            border-radius: 18px;
            padding: 14px;
          }
          .summary-label {
            text-transform: uppercase;
            letter-spacing: 1px;
            font-size: 10px;
            color: #5f7380;
            margin-bottom: 6px;
            font-weight: 700;
          }
          .summary-value {
            font-size: 15px;
            line-height: 1.3;
            font-weight: 800;
            color: #173248;
          }
          .metric-value {
            font-size: 24px;
            line-height: 1;
            font-weight: 800;
            color: #173248;
          }
          .metric-copy {
            margin-top: 6px;
            font-size: 12px;
            color: #715a38;
            line-height: 1.35;
          }
          .meta-card, .section {
            background: #fffaf2;
            border-radius: 20px;
            padding: 16px;
          }
          .meta-label, .section-label {
            text-transform: uppercase;
            letter-spacing: 1.1px;
            font-size: 11px;
            color: #876a46;
            margin-bottom: 8px;
            font-weight: 700;
          }
          .meta-value {
            font-size: 15px;
            line-height: 1.35;
            font-weight: 700;
          }
          .section {
            margin-bottom: 14px;
          }
          ul {
            margin: 0;
            padding-left: 18px;
          }
          li {
            margin-bottom: 6px;
            line-height: 1.4;
          }
          .notes {
            white-space: pre-wrap;
            font-family: Menlo, ui-monospace, monospace;
            font-size: 12px;
            line-height: 1.45;
          }
          .columns {
            display: grid;
            grid-template-columns: 1.4fr 0.9fr;
            gap: 14px;
          }
          .chart-panel {
            background: #fffaf2;
            border-radius: 20px;
            padding: 16px;
            margin-bottom: 14px;
          }
          .chart-shell {
            display: grid;
            grid-template-columns: 66px 1fr;
            gap: 14px;
            align-items: stretch;
          }
          .chart-depth-scale {
            position: relative;
            min-height: 420px;
          }
          .chart-tick {
            position: absolute;
            left: 0;
            right: 0;
            border-top: 1px dashed #d9c8aa;
            font-size: 10px;
            color: #7f6d53;
          }
          .chart-tick span {
            position: absolute;
            top: -8px;
            left: 0;
            background: #fffaf2;
            padding-right: 4px;
          }
          .chart-column {
            min-height: 420px;
            border-radius: 18px;
            overflow: hidden;
            border: 1px solid #d8c8b0;
            background: linear-gradient(180deg, #fbf5ea 0%, #efe2ce 100%);
            display: flex;
            flex-direction: column;
          }
          .chart-layer {
            position: relative;
            padding: 8px 10px;
            border-bottom: 1px solid rgba(77, 60, 35, 0.12);
            background: rgba(214, 198, 168, 0.68);
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .chart-layer:nth-child(odd) {
            background: rgba(230, 214, 184, 0.76);
          }
          .chart-layer-red {
            background: rgba(196, 86, 58, 0.78);
            color: #fff8ee;
          }
          .chart-depth {
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.4px;
          }
          .chart-layer-label {
            margin-top: 4px;
            font-size: 12px;
            line-height: 1.25;
            font-weight: 700;
          }
          .chart-empty {
            padding: 16px;
            font-size: 14px;
            color: #6f6658;
          }
          @media print {
            body {
              padding: 16px;
            }
          }
        </style>
      </head>
      <body>
        <div class="hero">
          <div class="eyebrow">Skeena Profile Snapshot</div>
          <h1>${escapeHtml(profile.title)}</h1>
          <div class="subtitle">${escapeHtml(profile.subtitle)}</div>
        </div>

        <div class="summary-strip">
          ${importantMeta
            .slice(0, 3)
            .map(
              (item) => `
                <div class="summary-chip">
                  <div class="summary-label">${escapeHtml(item.label)}</div>
                  <div class="summary-value">${escapeHtml(item.value)}</div>
                </div>
              `
            )
            .join('')}
        </div>

        <div class="metrics-strip">
          <div class="metric-chip">
            <div class="summary-label">Layers</div>
            <div class="metric-value">${highlights.layerCount}</div>
            <div class="metric-copy">${highlights.redLayerCount} marked red</div>
          </div>
          <div class="metric-chip">
            <div class="summary-label">Temps</div>
            <div class="metric-value">${highlights.temperatureCount}</div>
            <div class="metric-copy">profile samples</div>
          </div>
          <div class="metric-chip">
            <div class="summary-label">Tests</div>
            <div class="metric-value">${highlights.stabilityCount}</div>
            <div class="metric-copy">stability entries</div>
          </div>
          <div class="metric-chip">
            <div class="summary-label">Surface</div>
            <div class="metric-value">${escapeHtml(highlights.surfaceGrain || '—')}</div>
            <div class="metric-copy">${escapeHtml(highlights.totalHs || 'Total Hs missing')}</div>
          </div>
        </div>

        <div class="grid">${metadataHtml}</div>

        ${chartHtml}

        <div class="columns">
          <div>
            <div class="section">
              <div class="section-label">Snowpack Layers</div>
              <ul>${sectionList(parsed.layers)}</ul>
            </div>

            <div class="section">
              <div class="section-label">Additional Notes</div>
              <div class="notes">${escapeHtml(parsed.notes.join('\n') || profile.rawNotes || 'No extra notes.')}</div>
            </div>
          </div>

          <div>
            <div class="section">
              <div class="section-label">Temperature Profile</div>
              <ul>${sectionList(parsed.temperatures)}</ul>
            </div>

            <div class="section">
              <div class="section-label">Stability Tests</div>
              <ul>${sectionList(parsed.stabilityTests)}</ul>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

export async function createProfilePdfAsync(profile: SavedProfile) {
  const html = buildProfileHtml(profile);
  const result = await Print.printToFileAsync({
    html,
    base64: false,
  });
  const safeName = sanitizeFileName(`${profile.title}-${profile.id}.pdf`);
  const destination = `${FileSystem.documentDirectory}${safeName}`;
  await FileSystem.copyAsync({
    from: result.uri,
    to: destination,
  });
  return {
    ...result,
    uri: destination,
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sanitizeFileName(value: string) {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-');
}
