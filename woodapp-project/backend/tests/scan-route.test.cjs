const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('scan route uses the OCR service endpoint', () => {
  assert.match(serverSource, /OCR_SERVICE_URL/);
  assert.match(serverSource, /\/recognize/);
  assert.match(serverSource, /scanner: 'paddleocr'/);
});

test('Gemini and Groq are removed from the backend scanner path', () => {
  assert.doesNotMatch(serverSource, /GEMINI_API_KEY/);
  assert.doesNotMatch(serverSource, /GROQ_API_KEY/);
  assert.doesNotMatch(serverSource, /generativelanguage\.googleapis\.com/);
  assert.doesNotMatch(serverSource, /api\.groq\.com/);
});

test('one uploaded page increments the daily scan count once', () => {
  const increments = serverSource.match(/incrementScanCountAsync\(user\.id\)/g) || [];
  assert.equal(increments.length, 1);
  assert.match(serverSource, /scansRemainingAfterPage\(limit\)/);
});

test('scan route returns detections instead of calculated entries', () => {
  assert.match(serverSource, /detections: ocr\.detections/);
  assert.doesNotMatch(serverSource, /entries: parsed\.entries/);
});
