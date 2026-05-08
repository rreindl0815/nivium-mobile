#!/usr/bin/env node
/* global __dirname */

const fs = require('fs');
const path = require('path');

const CASES_PATH = path.join(__dirname, 'med-roundtrip-cases.json');

function parseFormattedProfile(formattedText) {
  const metadata = [];
  const layers = [];
  const temperatures = [];
  const stabilityTests = [];
  const notes = [];

  const stabilityPattern =
    /\b(?:CT(?:E|M|H)?\d*(?:\s+(?:SP|SC|PC|RP|BRK))?\s+at\s+\d+(?:\.\d+)?\s*cm|ECT[PNX]?\d*(?:\s+(?:SP|SC|PC|RP|BRK))?\s*(?:at\s+\d+(?:\.\d+)?\s*cm)?|PST\s+\d+(?:\.\d+)?\/\d+(?:\.\d+)?(?:\s+(?:END|ARR|SF))?\s+at\s+\d+(?:\.\d+)?\s*cm|HS\s+(?:easy|moderate|hard)\s+at\s+\d+(?:\.\d+)?\s*cm|SS\s+(?:easy|moderate|hard)(?:\s+(?:SP|SC|PC|RP|BRK))?\s+at\s+\d+(?:\.\d+)?\s*cm|RB\d+\s+at\s+\d+(?:\.\d+)?\s*cm)\b/gi;

  const splitInlineStability = (line) => {
    const found = Array.from(line.matchAll(stabilityPattern)).map((m) => m[0].replace(/\s+/g, ' ').trim());
    const cleaned = line.replace(stabilityPattern, ' ').replace(/\s{2,}/g, ' ').trim();
    return { cleaned, tests: found };
  };

  formattedText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const metadataMatch = line.match(/^([^:]+):\s*(.+)$/);
      if (metadataMatch) {
        metadata.push({ label: metadataMatch[1], value: metadataMatch[2] });
        return;
      }
      if (/^-?\d+(?:\.\d+)?\s+(?:surface|\d+(?:\.\d+)?cm)$/i.test(line)) {
        temperatures.push(line);
        return;
      }
      if (/^(CT|ECT|PST|HS|SS|DT|RB)/i.test(line)) {
        const split = splitInlineStability(line);
        (split.tests.length > 0 ? split.tests : [line]).forEach((test) => stabilityTests.push(test));
        return;
      }
      if (/^\d+(?:\.\d+)?-\d+(?:\.\d+)?\s+/i.test(line)) {
        const split = splitInlineStability(line);
        layers.push(/^\d+(?:\.\d+)?-\d+(?:\.\d+)?\s+/i.test(split.cleaned) ? split.cleaned : line);
        split.tests.forEach((test) => stabilityTests.push(test));
        return;
      }
      notes.push(line);
    });

  return { metadata, layers, temperatures, stabilityTests, notes };
}

function parseLegacyLayerLine(line) {
  const match = line.trim().match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\s+(.+)$/);
  if (!match) return null;
  const top = match[1];
  const bottom = match[2];
  const [main, comment] = match[3].split('|').map((s) => s.trim());
  const isRed = /\bred\b/i.test(main);
  const tokens = main
    .replace(/\bred\b/gi, '')
    .replace(/(\d+(?:\.\d+)?)\s*(mm|cm)\b/gi, '$1$2')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  const grain = tokens.find((t) => /^(PP|DF|RG|FC|FCxr|SH|DH|MF|IF|IFrc|MFcr)(\/(PP|DF|RG|FC|FCxr|SH|DH|MF|IF|IFrc|MFcr))?$/i.test(t)) || '';
  const hardness = tokens.find((t) => /^(F|F\+|4F|4F\+|1F|1F\+|P|P\+|K|K\+|I)(-(F|F\+|4F|4F\+|1F|1F\+|P|P\+|K|K\+|I))?$/i.test(t)) || '';
  const size = tokens.find((t) => /^\d+(?:\.\d+)?(mm|cm)(\/\d+(?:\.\d+)?(mm|cm))?$/i.test(t)) || '';
  return { top, bottom, grain, hardness, size, comment: comment || '', concern: isRed ? 'yes' : 'no' };
}

function parseStabilityLine(line) {
  const normalized = line.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const upper = normalized.toUpperCase();
  const type = upper.startsWith('ECT')
    ? 'ECT'
    : upper.startsWith('CT')
      ? 'CT'
      : upper.startsWith('PST')
        ? 'PST'
        : upper.startsWith('SS')
          ? 'SS'
          : upper.startsWith('HS')
            ? 'HS'
            : upper.startsWith('RB')
              ? 'RB'
              : '';
  if (!type) return null;

  const test = {
    type,
    depth: (normalized.match(/\bat\s+(\d+(?:\.\d+)?)\s*cm\b/i) || [])[1] || '',
    taps: (normalized.match(/\b(\d{1,2})\s*taps?\b/i) || [])[1] || '',
    character: ((normalized.match(/\b(SC|SP|PC|RP|BRK)\b/i) || [])[1] || '').toUpperCase(),
    result: '',
    pstCut: '',
    pstColumn: '',
  };

  if (type === 'CT') {
    const ctCode = (normalized.match(/\bCT([EMH])\b/i) || [])[1];
    if (ctCode === 'E' || ctCode === 'e') test.result = 'easy';
    if (ctCode === 'M' || ctCode === 'm') test.result = 'moderate';
    if (ctCode === 'H' || ctCode === 'h') test.result = 'hard';
    if (!test.taps) {
      const compact = normalized.match(/\bCT(?:E|M|H)?\s*(\d{1,2})\b/i);
      if (compact && compact[1]) test.taps = compact[1];
    }
  }
  if (type === 'ECT') {
    const ect = normalized.match(/\bECT([NPX])(\d{1,2})?\b/i);
    if (ect && ect[1]) test.result = `ECT${ect[1].toUpperCase()}`;
    if (ect && ect[2] && !test.taps) test.taps = ect[2];
  }
  if (type === 'PST') {
    const pst = normalized.match(/\b(END|ARR|SF)\b/i);
    if (pst && pst[1]) test.result = pst[1].charAt(0).toUpperCase() + pst[1].slice(1).toLowerCase();
    const col = normalized.match(/\b(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\b/);
    if (col) {
      test.pstCut = col[1];
      test.pstColumn = col[2];
    }
  }
  if (type === 'RB') {
    const rb = normalized.match(/\b(RB[1-7])\b/i);
    if (rb && rb[1]) test.result = rb[1].toUpperCase();
  }

  return test;
}

function serializeLayer(layer) {
  const main = [`${layer.top}-${layer.bottom}`, layer.grain, layer.hardness, layer.size, layer.concern === 'yes' ? 'red' : '']
    .filter(Boolean)
    .join(' ')
    .trim();
  return layer.comment ? `${main} | ${layer.comment}` : main;
}

function serializeStability(test) {
  if (test.type === 'CT') {
    const resultCode = test.result === 'easy' ? 'CTE' : test.result === 'moderate' ? 'CTM' : test.result === 'hard' ? 'CTH' : 'CT';
    const tapsPart = test.taps ? `${test.taps} taps` : '';
    const charPart = test.character || '';
    const depthPart = test.depth ? `at ${test.depth} cm` : '';
    return [resultCode, tapsPart, charPart, depthPart].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }
  if (test.type === 'ECT') {
    const resultPart = test.result || 'ECT';
    const tapsPart = test.taps || '';
    const charPart = test.character || '';
    const depthPart = test.depth ? `at ${test.depth} cm` : '';
    return [resultPart, tapsPart, charPart, depthPart].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }
  if (test.type === 'PST') {
    const ratio = test.pstCut && test.pstColumn ? `${test.pstCut}/${test.pstColumn}` : '';
    const resultPart = test.result ? test.result.toUpperCase() : '';
    const depthPart = test.depth ? `at ${test.depth} cm` : '';
    return ['PST', ratio, resultPart, depthPart].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }
  if (test.type === 'RB') {
    const resultPart = test.result || 'RB';
    const depthPart = test.depth ? `at ${test.depth} cm` : '';
    return [resultPart, depthPart].filter(Boolean).join(' ').trim();
  }
  const depthPart = test.depth ? `at ${test.depth} cm` : '';
  return [test.type, test.result, test.taps ? `${test.taps} taps` : '', test.character, depthPart]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLine(line) {
  return line.replace(/\s+/g, ' ').trim().toUpperCase();
}

function runCase(testCase) {
  const parsed = parseFormattedProfile(testCase.formattedText);
  const hydratedLayers = parsed.layers.map(parseLegacyLayerLine).filter(Boolean);
  const hydratedTests = parsed.stabilityTests.map(parseStabilityLine).filter(Boolean);
  const reserializedLayers = hydratedLayers.map(serializeLayer);
  const reserializedTests = hydratedTests.map(serializeStability);

  const layerLoss = reserializedLayers.length !== parsed.layers.length;
  const testLoss = reserializedTests.length !== parsed.stabilityTests.length;
  const layerDiff = reserializedLayers.some((line, i) => normalizeLine(line) !== normalizeLine(parsed.layers[i] || ''));

  return {
    name: testCase.name,
    pass: !(layerLoss || testLoss || layerDiff),
    details: {
      inputLayers: parsed.layers.length,
      outputLayers: reserializedLayers.length,
      inputTests: parsed.stabilityTests.length,
      outputTests: reserializedTests.length,
      layerDiff,
    },
  };
}

function main() {
  const raw = fs.readFileSync(CASES_PATH, 'utf8');
  const cases = JSON.parse(raw);
  const results = cases.map(runCase);
  const failed = results.filter((r) => !r.pass);

  console.log(`MED roundtrip regression: ${cases.length} case(s)`);
  for (const result of results) {
    if (result.pass) {
      console.log(`[PASS] ${result.name}`);
    } else {
      console.log(`[FAIL] ${result.name} ${JSON.stringify(result.details)}`);
    }
  }

  if (failed.length > 0) {
    process.exit(1);
  }
  console.log('All MED roundtrip checks passed.');
}

main();
