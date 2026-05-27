/**
 * Converts a raw value to inches.
 *
 * isFirst = true  → a_raw = radius in PLAIN INCHES (e.g. "4" = 4 inches)
 * isFirst = false → b_raw = height in ft.in format (e.g. "36" = 3ft 6in = 42 inches)
 *
 * ft.in decoding rules:
 *   - Single digit "7" → 7 feet → 84 inches
 *   - Multi-digit "12" → 1ft 2in → 14 inches
 *   - Multi-digit "36" → 3ft 6in → 42 inches
 */
export function ftinToInches(raw, isFirst) {
  const s = String(raw).trim();
  if (isFirst) {
    // Radius: plain inches (e.g. "4" = 4 inches)
    return parseInt(s) || 0;
  } else {
    // Height: ft.in format (e.g. "36" = 3ft 6in = 42 inches)
    if (s.length === 1) return (parseInt(s) || 0) * 12;
    const feet   = parseInt(s[0])      || 0;
    const inches = parseInt(s.slice(1)) || 0;
    return feet * 12 + inches;
  }
}

/**
 * Volume formula: V = (radius_inches × height_inches²) / 2304
 *
 * aRaw = radius in plain inches (first number from scan)
 * bRaw = height in ft.in notation (second number from scan)
 * Result is in cubic feet.
 */
export function calcVolume(aRaw, bRaw) {
  const aIn = ftinToInches(aRaw, true);   // radius → plain inches
  const bIn = ftinToInches(bRaw, false);  // height → ft.in decoded to total inches
  return (aIn * bIn * bIn) / 2304;
}
