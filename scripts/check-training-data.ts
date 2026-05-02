import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { formatRawNotesToEngineText } from '../utils/formatter';

type TrainingCase = {
  raw: string;
  expected: string;
};

const ZIP_PATH = '/Users/robertreindl/Desktop/skeena_formatter_training_data.txt.zip';
const RTF_NAME = 'skeena_formatter_training_data.txt.rtf';

function loadTrainingCases(): TrainingCase[] {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skeena-training-'));
  try {
    const rtfPath = path.join(tmpDir, RTF_NAME);
    execFileSync('python3', [
      '-c',
      [
        'import zipfile, sys',
        `z=zipfile.ZipFile(${JSON.stringify(ZIP_PATH)})`,
        `open(${JSON.stringify(rtfPath)}, "wb").write(z.read(${JSON.stringify(RTF_NAME)}))`,
      ].join(';'),
    ]);
    const txt = execFileSync('textutil', ['-convert', 'txt', '-stdout', rtfPath], { encoding: 'utf8' });
    return parseTrainingCases(txt);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function parseTrainingCases(txt: string): TrainingCase[] {
  const start = txt.indexOf('Ready for raw field notes.');
  const body = start >= 0 ? txt.slice(start + 'Ready for raw field notes.'.length) : txt;
  const blocks = body.split(/\n\s*\n+/).map((block) => block.trim()).filter(Boolean);
  const cases: TrainingCase[] = [];

  let i = 0;
  while (i < blocks.length) {
    const raw = blocks[i];
    if (!isRawBlock(raw)) {
      i += 1;
      continue;
    }

    const next = blocks[i + 1];
    if (!next || !isFormattedMetadataBlock(next)) {
      i += 1;
      continue;
    }

    const outputParts = [next];
    let j = i + 2;
    while (j < blocks.length && !isRawBlock(blocks[j]) && !isFormattedMetadataBlock(blocks[j])) {
      outputParts.push(blocks[j]);
      j += 1;
    }
    cases.push({
      raw,
      expected: outputParts.join('\n\n'),
    });
    i = j;
  }

  return cases;
}

function isRawBlock(block: string) {
  const lower = block.toLowerCase();
  return (lower.includes('run name') || lower.includes('observer')) && !isFormattedMetadataBlock(block);
}

function isFormattedMetadataBlock(block: string) {
  return block.startsWith('Date: ') && block.includes('\nTime:');
}

function normalizeBlock(value: string) {
  return sanitizeExpectedOutput(value)
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

function sanitizeExpectedOutput(value: string) {
  return value
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .filter((line) => isExpectedOutputLine(line.trim()))
    .join('\n');
}

function isExpectedOutputLine(line: string) {
  return (
    /^([A-Z][A-Za-z/ ]+): /.test(line) ||
    /^\d+(?:\.\d+)?-\d+(?:\.\d+)?\s+/.test(line) ||
    /^-?\d+(?:\.\d+)?\s+(?:surface|\d+(?:\.\d+)?cm)$/.test(line) ||
    /^(?:CT|SS|HS|ECT|PST)/.test(line) ||
    /^The layer \d+(?:\.\d+)? to \d+(?:\.\d+)? is a layer of concern/i.test(line)
  );
}

function runTrainingRegression() {
  const cases = loadTrainingCases();
  assert.ok(cases.length >= 10, 'Expected to load many training cases');

  const failures: { index: number; raw: string; expected: string; actual: string }[] = [];

  cases.forEach((trainingCase, index) => {
    const actual = normalizeBlock(formatRawNotesToEngineText(trainingCase.raw).formattedText);
    const expected = normalizeBlock(trainingCase.expected);
    if (actual !== expected) {
      failures.push({
        index: index + 1,
        raw: trainingCase.raw,
        expected,
        actual,
      });
    }
  });

  if (failures.length > 0) {
    console.log(`Training regression: ${cases.length - failures.length}/${cases.length} exact matches`);
    failures.slice(0, 5).forEach((failure) => {
      console.log(`\n--- Failure ${failure.index} ---`);
      console.log('RAW:', failure.raw.slice(0, 220));
      console.log('EXPECTED:\n' + failure.expected.slice(0, 600));
      console.log('ACTUAL:\n' + failure.actual.slice(0, 600));
    });
    process.exitCode = 1;
    return;
  }

  console.log(`Training regression passed: ${cases.length}/${cases.length} exact matches`);
}

runTrainingRegression();
