/**
 * Converts raw ft.in notation to total inches.
 * isFirst=true  → treats as plain integer (height in feet)
 * isFirst=false → treats as ft.in code (e.g. "16" = 1ft 6in)
 */
export function ftinToInches(raw, isFirst) {
  const s = String(raw).trim();
  if (isFirst) {
    return parseInt(s) || 0;
  } else {
    if (s.length === 1) return (parseInt(s) || 0) * 12;
    const feet   = parseInt(s[0])      || 0;
    const inches = parseInt(s.slice(1)) || 0;
    return feet * 12 + inches;
  }
}

/**
 * V = (a × b²) / 2304
 * where a = height in inches, b = radius in inches (from ft.in notation)
 * Result is in cubic feet.
 */
export function calcVolume(aRaw, bRaw) {
  const aIn = ftinToInches(aRaw, true);
  const bIn = ftinToInches(bRaw, false);
  return (aIn * bIn * bIn) / 2304;
}
