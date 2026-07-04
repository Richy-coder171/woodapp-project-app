import { calcVolume, ftinToInches, parseMeasurementText } from './calc.js';

export function normalizeDetections(items = []) {
  return items.map((item, index) => ({
    ...item,
    id: item.id || `measurement-${index + 1}`,
    valid: item.valid !== false,
    selected: item.valid === false ? false : item.selected !== false,
  }));
}

export function toggleMeasurement(items, id) {
  return items.map(item =>
    item.id === id && item.valid !== false ? { ...item, selected: !item.selected } : item
  );
}

export function selectAllMeasurements(items) {
  return items.map(item => ({ ...item, selected: item.valid !== false }));
}

export function clearAllMeasurements(items) {
  return items.map(item => ({ ...item, selected: false }));
}

export function getSelectedCount(items) {
  return items.filter(item => item.selected).length;
}

export function getMeasurementBoxClass(item) {
  return item.selected && item.valid !== false ? 'measurement-box selected' : 'measurement-box unselected';
}

export function getOverlayViewBox(imageWidth, imageHeight) {
  const width = Number(imageWidth) || 1;
  const height = Number(imageHeight) || 1;
  return `0 0 ${width} ${height}`;
}

export function calculateSelectedDetections(items) {
  const selected = items.filter(item => item.selected && item.valid !== false);

  if (selected.length === 0) {
    return {
      entries: [],
      invalid: [],
      total: 0,
      error: 'Select at least one measurement before calculating.',
    };
  }

  const entries = [];
  const invalid = [];

  selected.forEach((item) => {
    const parsed = parseMeasurementText(item.normalizedText || item.rawText);
    if (!parsed) {
      invalid.push(item);
      return;
    }

    const volume = calcVolume(parsed.a_raw, parsed.b_raw);
    entries.push({
      id: item.id,
      rawText: item.rawText,
      normalizedText: parsed.normalizedText,
      a_raw: parsed.a_raw,
      b_raw: parsed.b_raw,
      a_in: ftinToInches(parsed.a_raw, true),
      b_in: ftinToInches(parsed.b_raw, false),
      volume: +volume.toFixed(3),
    });
  });

  if (!entries.length) {
    return {
      entries: [],
      invalid,
      total: 0,
      error: 'No selected measurements used a valid wood measurement format.',
    };
  }

  return {
    entries,
    invalid,
    total: entries.reduce((sum, entry) => sum + entry.volume, 0),
    error: invalid.length ? `${invalid.length} selected measurement${invalid.length === 1 ? '' : 's'} could not be calculated.` : '',
  };
}
