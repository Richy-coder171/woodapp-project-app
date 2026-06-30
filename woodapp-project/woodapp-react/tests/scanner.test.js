import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { calcVolume, ftinToInches, parseMeasurementText } from '../src/utils/calc.js';
import {
  calculateSelectedDetections,
  clearAllMeasurements,
  getMeasurementBoxClass,
  getOverlayViewBox,
  normalizeDetections,
  selectAllMeasurements,
  toggleMeasurement,
} from '../src/utils/scanSelection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const cssSource = fs.readFileSync(path.join(projectRoot, 'src/styles/calculator.css'), 'utf8');
const appSource = fs.readFileSync(path.join(projectRoot, 'src/pages/calculator/CalculatorApp.jsx'), 'utf8');
const cameraSource = fs.readFileSync(path.join(projectRoot, 'src/pages/calculator/components/CameraScreen.jsx'), 'utf8');
const reviewSource = fs.readFileSync(path.join(projectRoot, 'src/pages/calculator/components/ScanReviewScreen.jsx'), 'utf8');
const fixturePath = path.resolve(projectRoot, '../ocr-service/tests/fixtures/five-measurements.svg');

const fortyDetections = Array.from({ length: 40 }, (_, index) => ({
  id: `measurement-${index + 1}`,
  rawText: `${index + 4} x 36`,
  normalizedText: `${index + 4} x 36`,
  selected: true,
  box: { x: 10 + index, y: 20 + index, width: 80, height: 30 },
}));

const fiveDetections = ['4 x 12', '5 x 14', '3 x 17', '2 x 13', '6 x 12'].map((text, index) => ({
  id: `measurement-${index + 1}`,
  rawText: text,
  normalizedText: text,
  box: { x: 120, y: 120 + index * 90, width: 170, height: 46 },
}));

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cssBlock(selector) {
  const match = cssSource.match(new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`, 'm'));
  return match?.[1] || '';
}

test('existing calc.js conversion and volume remain correct', () => {
  assert.equal(ftinToInches('36', false), 42);
  assert.equal(ftinToInches('4', true), 4);
  assert.equal(calcVolume('4', '36'), 3.0625);
});

test('parser normalizes OCR measurement separators and split numeric text', () => {
  assert.deepEqual(parseMeasurementText('4 X 36'), {
    a_raw: '4',
    b_raw: '36',
    normalizedText: '4 x 36',
  });
  assert.deepEqual(parseMeasurementText('4,5 x 3.6'), {
    a_raw: '4.5',
    b_raw: '3.6',
    normalizedText: '4.5 x 3.6',
  });
  assert.deepEqual(parseMeasurementText('4 12'), {
    a_raw: '4',
    b_raw: '12',
    normalizedText: '4 x 12',
  });
});

test('forty OCR boxes are selected by default', () => {
  const normalized = normalizeDetections(fortyDetections.map(item => ({ ...item, selected: undefined })));
  assert.equal(normalized.length, 40);
  assert.equal(normalized.every(item => item.selected === true), true);
});

test('tap selected box changes it to grey and tapping again changes it to green', () => {
  const [first] = normalizeDetections(fortyDetections.slice(0, 1));
  const grey = toggleMeasurement([first], first.id);
  assert.equal(grey[0].selected, false);
  assert.equal(getMeasurementBoxClass(grey[0]), 'measurement-box unselected');

  const green = toggleMeasurement(grey, first.id);
  assert.equal(green[0].selected, true);
  assert.equal(getMeasurementBoxClass(green[0]), 'measurement-box selected');
});

test('select all and clear all update selected state', () => {
  const cleared = clearAllMeasurements(fortyDetections);
  assert.equal(cleared.every(item => item.selected === false), true);

  const selected = selectAllMeasurements(cleared);
  assert.equal(selected.every(item => item.selected === true), true);
});

test('invalid scanner detections stay grey and unselected', () => {
  const normalized = normalizeDetections([
    { id: 'valid', rawText: '43x24', normalizedText: '43x24', valid: true, selected: false },
    { id: 'invalid', rawText: '43?24', normalizedText: null, valid: false, selected: true },
  ]);
  assert.equal(normalized[0].selected, false);
  assert.equal(normalized[1].selected, false);
  assert.equal(getMeasurementBoxClass(normalized[1]), 'measurement-box unselected');
  assert.equal(toggleMeasurement(normalized, 'invalid')[1].selected, false);
  assert.deepEqual(selectAllMeasurements(normalized).map(item => item.selected), [true, false]);
  assert.equal(calculateSelectedDetections(selectAllMeasurements(normalized)).entries.length, 1);
});

test('five-line fixture detections are selected and calculate selected only', () => {
  assert.equal(fs.existsSync(fixturePath), true);
  const normalized = normalizeDetections(fiveDetections);
  assert.equal(normalized.length, 5);
  assert.equal(normalized.every(item => item.selected === true), true);

  const toggled = toggleMeasurement(normalized, 'measurement-2');
  assert.equal(getMeasurementBoxClass(toggled[1]), 'measurement-box unselected');
  assert.equal(getMeasurementBoxClass(toggleMeasurement(toggled, 'measurement-2')[1]), 'measurement-box selected');

  const result = calculateSelectedDetections(toggled);
  assert.equal(result.entries.length, 4);
  assert.equal(result.entries.some(entry => entry.normalizedText === '5 x 14'), false);
});

test('calculation includes only selected measurements', () => {
  const detections = [
    { id: 'a', rawText: '4 x 36', normalizedText: '4 x 36', selected: true },
    { id: 'b', rawText: '9 x 36', normalizedText: '9 x 36', selected: false },
  ];

  const result = calculateSelectedDetections(detections);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].a_raw, '4');
  assert.equal(result.total, 3.063);
});

test('calculation is blocked when no measurements are selected', () => {
  const result = calculateSelectedDetections(clearAllMeasurements(fortyDetections));
  assert.equal(result.entries.length, 0);
  assert.equal(result.error, 'Select at least one measurement before calculating.');
});

test('overlay viewBox keeps original OCR coordinate system', () => {
  assert.equal(getOverlayViewBox(1920, 1080), '0 0 1920 1080');
});

test('scanner preview keeps the full photo visible', () => {
  const previewBlock = cssBlock('.scan-preview');
  const imageBlock = cssBlock('.scan-preview img');
  const overlayBlock = cssBlock('.scan-overlay');

  assert.match(previewBlock, /position:\s*relative/);
  assert.match(previewBlock, /width:\s*100%/);
  assert.doesNotMatch(previewBlock, /height:\s*(?:220px|min\(62dvh|max-height)/);
  assert.doesNotMatch(previewBlock, /overflow:\s*hidden/);
  assert.match(imageBlock, /display:\s*block/);
  assert.match(imageBlock, /width:\s*100%/);
  assert.match(imageBlock, /height:\s*auto/);
  assert.match(imageBlock, /object-fit:\s*contain/);
  assert.doesNotMatch(imageBlock, /object-fit:\s*cover/);
  assert.match(overlayBlock, /position:\s*absolute/);
  assert.match(overlayBlock, /inset:\s*0/);
});

test('review uses original image dimensions and hides zero error when boxes exist', () => {
  assert.match(reviewSource, /viewBox=\{getOverlayViewBox\(imageMeta\.width,\s*imageMeta\.height\)\}/);
  assert.match(reviewSource, /preserveAspectRatio="xMidYMid meet"/);
  assert.match(reviewSource, /scannerStage === 'ready'/);
  assert.match(reviewSource, /scannerStage === 'empty'/);
});

test('detection stores boxes and does not automatically calculate', () => {
  const scanStart = appSource.indexOf('async function scanImage');
  const scanEnd = appSource.indexOf('function toggleMeasurement', scanStart);
  const scanBody = appSource.slice(scanStart, scanEnd);

  assert.match(scanBody, /const nextDetections = normalizeDetections\(data\.detections \|\| \[\]\)/);
  assert.match(scanBody, /scannerEngine: import\.meta\.env\.DEV \? import\.meta\.env\.VITE_SCANNER_ENGINE : undefined/);
  assert.match(scanBody, /setDetections\(nextDetections\)/);
  assert.doesNotMatch(scanBody, /setScreen\('results'\)/);
  assert.doesNotMatch(scanBody, /calculateSelected\(/);
});

test('scanner failure and ready states are mutually exclusive', () => {
  assert.match(appSource, /setScannerStage\('ready'\)/);
  assert.match(appSource, /setScannerStage\('timeout'\)/);
  assert.match(appSource, /setScannerStage\('service-error'\)/);
  assert.match(appSource, /setScannerStage\('processing-error'\)/);
  assert.doesNotMatch(appSource, /setScannerStage\('Ready to select'\)/);
  assert.match(reviewSource, /const ready = !isDetecting && totalCount > 0 && scannerStage === 'ready'/);
  assert.match(reviewSource, /const hasScannerError = Boolean\(scannerError\)/);
  assert.match(reviewSource, /!\hasScannerError && \(/);
  assert.match(reviewSource, /const actionsDisabled = !ready \|\| hasScannerError/);
});

test('partial OCR results keep successful boxes ready for review', () => {
  assert.match(appSource, /data\.status === 'partial'/);
  assert.match(appSource, /setCalculationNotice\(failedCount \? `\$\{failedCount\} area/);
  assert.match(appSource, /setScannerStage\('ready'\)/);
  assert.match(appSource, /setDetections\(nextDetections\)/);
});

test('frontend preserves scanner upload filename, mime type, and size diagnostics', () => {
  assert.match(appSource, /capturedFilename/);
  assert.match(appSource, /filename: photo\.filename/);
  assert.match(appSource, /mimeType: photo\.mimeType/);
  assert.match(appSource, /size: file\.size/);
  assert.match(cameraSource, /wood-scan-\$\{Date\.now\(\)\}\.jpeg/);
  assert.match(appSource, /scanner API origin/);
  assert.match(appSource, /scanner HTTP status/);
});
