const VERSION = 6;
const SIZE = 17 + VERSION * 4;
const DATA_CODEWORDS = 136;
const BLOCK_DATA_CODEWORDS = 68;
const ECC_CODEWORDS = 18;
const MASK = 0;

const ALIGNMENT_POSITIONS = [6, 34];

let gfExp = null;
let gfLog = null;

function initGalois() {
  if (gfExp && gfLog) return;

  gfExp = Array(255);
  gfLog = Array(256).fill(0);

  let x = 1;
  for (let i = 0; i < 255; i++) {
    gfExp[i] = x;
    gfLog[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
}

function gfMultiply(a, b) {
  if (a === 0 || b === 0) return 0;
  initGalois();
  return gfExp[(gfLog[a] + gfLog[b]) % 255];
}

function reedSolomonDivisor(degree) {
  const result = Array(degree).fill(0);
  result[degree - 1] = 1;

  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 2);
  }

  return result;
}

function reedSolomonRemainder(data, divisor) {
  const result = Array(divisor.length).fill(0);

  for (const value of data) {
    const factor = value ^ result[0];
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;

    for (let i = 0; i < result.length; i++) {
      result[i] ^= gfMultiply(divisor[i], factor);
    }
  }

  return result;
}

function appendBits(bits, value, length) {
  for (let i = length - 1; i >= 0; i--) {
    bits.push(((value >>> i) & 1) === 1);
  }
}

function encodeDataCodewords(text) {
  const bytes = Array.from(new TextEncoder().encode(text));
  if (bytes.length > 119) {
    throw new Error('UPI QR text is too long. Use the Pay in UPI App button or shorten UPI/payee details.');
  }

  const bits = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);
  bytes.forEach((byte) => appendBits(bits, byte, 8));

  const capacityBits = DATA_CODEWORDS * 8;
  appendBits(bits, 0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(false);

  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j++) value = (value << 1) | (bits[i + j] ? 1 : 0);
    data.push(value);
  }

  for (let pad = 0xec; data.length < DATA_CODEWORDS; pad ^= 0xec ^ 0x11) {
    data.push(pad);
  }

  return data;
}

function makeCodewords(text) {
  const data = encodeDataCodewords(text);
  const divisor = reedSolomonDivisor(ECC_CODEWORDS);
  const blocks = [
    data.slice(0, BLOCK_DATA_CODEWORDS),
    data.slice(BLOCK_DATA_CODEWORDS, BLOCK_DATA_CODEWORDS * 2),
  ];
  const ecc = blocks.map((block) => reedSolomonRemainder(block, divisor));
  const result = [];

  for (let i = 0; i < BLOCK_DATA_CODEWORDS; i++) {
    result.push(blocks[0][i], blocks[1][i]);
  }
  for (let i = 0; i < ECC_CODEWORDS; i++) {
    result.push(ecc[0][i], ecc[1][i]);
  }

  return result;
}

function makeMatrix() {
  return {
    modules: Array.from({ length: SIZE }, () => Array(SIZE).fill(false)),
    reserved: Array.from({ length: SIZE }, () => Array(SIZE).fill(false)),
  };
}

function setFunction(matrix, x, y, dark) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  matrix.modules[y][x] = dark;
  matrix.reserved[y][x] = true;
}

function drawFinder(matrix, x, y) {
  for (let dy = -1; dy <= 7; dy++) {
    for (let dx = -1; dx <= 7; dx++) {
      const xx = x + dx;
      const yy = y + dy;
      const inFinder = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
      const dark = inFinder && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
      setFunction(matrix, xx, yy, dark);
    }
  }
}

function drawAlignment(matrix, cx, cy) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      setFunction(matrix, cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
}

function formatBits() {
  let data = (1 << 3) | MASK;
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ (((rem >>> 9) & 1) ? 0x537 : 0);
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function getBit(value, index) {
  return ((value >>> index) & 1) !== 0;
}

function drawFormatBits(matrix) {
  const bits = formatBits();

  for (let i = 0; i <= 5; i++) setFunction(matrix, 8, i, getBit(bits, i));
  setFunction(matrix, 8, 7, getBit(bits, 6));
  setFunction(matrix, 8, 8, getBit(bits, 7));
  setFunction(matrix, 7, 8, getBit(bits, 8));
  for (let i = 9; i < 15; i++) setFunction(matrix, 14 - i, 8, getBit(bits, i));

  for (let i = 0; i < 8; i++) setFunction(matrix, SIZE - 1 - i, 8, getBit(bits, i));
  for (let i = 8; i < 15; i++) setFunction(matrix, 8, SIZE - 15 + i, getBit(bits, i));

  setFunction(matrix, 8, SIZE - 8, true);
}

function drawFunctionPatterns(matrix) {
  drawFinder(matrix, 0, 0);
  drawFinder(matrix, SIZE - 7, 0);
  drawFinder(matrix, 0, SIZE - 7);

  for (let i = 8; i < SIZE - 8; i++) {
    setFunction(matrix, i, 6, i % 2 === 0);
    setFunction(matrix, 6, i, i % 2 === 0);
  }

  for (const x of ALIGNMENT_POSITIONS) {
    for (const y of ALIGNMENT_POSITIONS) {
      if (matrix.reserved[y][x]) continue;
      drawAlignment(matrix, x, y);
    }
  }

  drawFormatBits(matrix);
}

function shouldMask(x, y) {
  return ((x + y) & 1) === 0;
}

function drawCodewords(matrix, codewords) {
  const bits = [];
  codewords.forEach((word) => appendBits(bits, word, 8));

  let bitIndex = 0;
  let upward = true;

  for (let right = SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right--;

    for (let vert = 0; vert < SIZE; vert++) {
      const y = upward ? SIZE - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        if (matrix.reserved[y][x]) continue;

        let dark = bitIndex < bits.length ? bits[bitIndex] : false;
        if (shouldMask(x, y)) dark = !dark;
        matrix.modules[y][x] = dark;
        bitIndex++;
      }
    }

    upward = !upward;
  }
}

function encodeQr(text) {
  const matrix = makeMatrix();
  drawFunctionPatterns(matrix);
  drawCodewords(matrix, makeCodewords(text));
  drawFormatBits(matrix);
  return matrix.modules;
}

export function createQrDataUrl(text, scale = 4, margin = 3) {
  const modules = encodeQr(text);
  const dim = modules.length + margin * 2;
  const size = dim * scale;
  const cells = [];

  modules.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) cells.push(`M${x + margin},${y + margin}h1v1h-1z`);
    });
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path fill="#111" d="${cells.join('')}"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
