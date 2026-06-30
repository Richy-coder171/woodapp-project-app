const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('scan route uses the OCR service endpoint', () => {
  assert.match(serverSource, /OCR_SERVICE_URL/);
  assert.match(serverSource, /DOMAIN_OCR_SERVICE_URL/);
  assert.match(serverSource, /NVIDIA_OCR_SERVICE_URL/);
  assert.match(serverSource, /NVIDIA_OCR_TIMEOUT_MS/);
  assert.match(serverSource, /SCANNER_ENGINE/);
  assert.match(serverSource, /\/recognize/);
  assert.match(serverSource, /\/recognize-domain/);
  assert.match(serverSource, /\/recognize-nvidia/);
  assert.match(serverSource, /nvidia-tao-ocdnet-ocrnet-v1/);
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
  assert.match(serverSource, /status: ocr\.status/);
  assert.match(serverSource, /failedColumns: ocr\.failedColumns/);
  assert.match(serverSource, /diagnostics: ocr\.diagnostics/);
  assert.doesNotMatch(serverSource, /entries: parsed\.entries/);
});

test('node preserves OCR dimensions and logs returned detection count safely', () => {
  assert.match(serverSource, /imageWidth: ocr\.imageWidth/);
  assert.match(serverSource, /imageHeight: ocr\.imageHeight/);
  assert.match(serverSource, /console\.info\('OCR returned detections:', normalized\.detections\.length\)/);
});

test('node maps OCR timeout and processing failures distinctly', () => {
  assert.match(serverSource, /OCR_TIMEOUT/);
  assert.match(serverSource, /OCR_SERVICE_UNAVAILABLE/);
  assert.match(serverSource, /OCR_PROCESSING_FAILED/);
  assert.match(serverSource, /INVALID_IMAGE/);
  assert.match(serverSource, /return 'OCR processing failed\. Please try again\.'/);
});

test('node forwards multipart file field with safe filename and mime type', () => {
  assert.match(serverSource, /form\.append\('file'/);
  assert.match(serverSource, /new Blob\(\[buffer\], \{ type: mimeType \|\| 'image\/jpeg' \}\)/);
  assert.match(serverSource, /safeImageFilename/);
  assert.match(serverSource, /filename/);
});
