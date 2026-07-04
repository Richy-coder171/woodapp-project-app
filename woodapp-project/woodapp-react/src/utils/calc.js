/**
 * Converts a raw value to inches.
 *
 * isFirst = true: a_raw is radius in plain inches, for example "4" = 4 in.
 * isFirst = false: b_raw is height in ft.in format, for example "36" = 3 ft 6 in.
 */
export function ftinToInches(raw, isFirst) {
  const s = String(raw).trim().replace(',', '.');

  if (isFirst) {
    return Number(s) || 0;
  }

  if (/^\d+\.\d+$/.test(s)) {
    const [feetRaw, inchesRaw] = s.split('.');
    return (parseInt(feetRaw, 10) || 0) * 12 + (parseInt(inchesRaw, 10) || 0);
  }

  if (s.length === 1) return (parseInt(s, 10) || 0) * 12;

  const feet = parseInt(s[0], 10) || 0;
  const inches = parseInt(s.slice(1), 10) || 0;
  return feet * 12 + inches;
}

/**
 * Volume formula: V = (radius_inches * height_inches^2) / 2304.
 */
export function calcVolume(aRaw, bRaw) {
  const aIn = ftinToInches(aRaw, true);
  const bIn = ftinToInches(bRaw, false);
  return (aIn * bIn * bIn) / 2304;
}

const MEASUREMENT_RE = /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i;
const NUMBER_RE = /\d+(?:\.\d+)?/g;

export function normalizeMeasurementText(text) {
  return String(text || '')
    .trim()
    .replace(/[×✕✖Ã—X*]/g, 'x')
    .replace(/[–—−â€“â€”âˆ’]/g, '-')
    .replace(/,/g, '.')
    .replace(/(\d)[Oo](?=\d|\s*x)/g, (_, prefix) => `${prefix}0`)
    .replace(/(x\s*)[Oo](?=\d)/g, (_, prefix) => `${prefix}0`)
    .replace(/(\d)[Il](?=\d|\s*x)/g, (_, prefix) => `${prefix}1`)
    .replace(/(x\s*)[Il](?=\d)/g, (_, prefix) => `${prefix}1`)
    .replace(/\s*x\s*/gi, ' x ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseMeasurementText(text) {
  const normalizedText = normalizeMeasurementText(text);
  const match = normalizedText.match(MEASUREMENT_RE);

  if (match) {
    return {
      a_raw: match[1],
      b_raw: match[2],
      normalizedText: `${match[1]} x ${match[2]}`,
    };
  }

  const numbers = normalizedText.match(NUMBER_RE);
  if (!numbers || numbers.length < 2) return null;

  return {
    a_raw: numbers[0],
    b_raw: numbers[1],
    normalizedText: `${numbers[0]} x ${numbers[1]}`,
  };
}
