import { useState } from 'react';

export default function ResultsScreen({
  entries,
  capturedPreview,
  userScans,
  resultNotice,
  saveScan,
  retake,
  resetAll,
}) {
  const [saveLabel, setSaveLabel] = useState('Save to History');
  const [saveDisabled, setSaveDisabled] = useState(false);

  const total = entries.reduce((sum, entry) => sum + (+entry.volume), 0);
  const fmtIn = value => {
    const n = Number(value);
    return Number.isFinite(n) ? `${n.toFixed(1)} in` : 'n/a';
  };

  async function handleSave() {
    setSaveDisabled(true);
    setSaveLabel('Saving...');
    try {
      await saveScan();
      setSaveLabel('Saved!');
      setTimeout(() => { setSaveLabel('Save to History'); setSaveDisabled(false); }, 1500);
    } catch {
      setSaveLabel('Save to History');
      setSaveDisabled(false);
      alert('Save failed - check connection');
    }
  }

  return (
    <div className="screen results-screen">
      <div className="thumb-wrap">
        <img src={capturedPreview} alt="" />
        <div className="thumb-label">
          <i aria-hidden="true">+</i>
          {entries.length} selected entr{entries.length === 1 ? 'y' : 'ies'} calculated
        </div>
      </div>

      {resultNotice && (
        <div className="scan-message results-note">{resultNotice}</div>
      )}

      {userScans.remaining <= 20 && (
        <div className="rate-warn">
          <i aria-hidden="true">!</i>
          {userScans.remaining} scans remaining today
        </div>
      )}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th><i aria-hidden="true">#</i>Entry</th>
              <th><i aria-hidden="true">r</i>Radius</th>
              <th><i aria-hidden="true">h</i>Height</th>
              <th><i aria-hidden="true">=</i>Volume</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <tr key={entry.id || index}>
                <td className="index-cell">#{index + 1}</td>
                <td>
                  <div className="raw-val">{entry.a_raw}</div>
                  <div className="in-val">{fmtIn(entry.a_in)}</div>
                </td>
                <td>
                  <div className="raw-val">{entry.b_raw}</div>
                  <div className="in-val">{fmtIn(entry.b_in)}</div>
                </td>
                <td className="vol-cell">{(+entry.volume).toFixed(3)} ft3</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-entry-list" aria-label="Calculated measurements">
        {entries.map((entry, index) => (
          <div className="mobile-entry-card" key={entry.id || index}>
            <div className="mobile-entry-head">
              <span>Entry #{index + 1}</span>
            </div>
            <div className="mobile-entry-grid">
              <div>
                <span>Radius</span>
                <strong>{entry.a_raw}</strong>
                <small>{fmtIn(entry.a_in)}</small>
              </div>
              <div>
                <span>Height</span>
                <strong>{entry.b_raw}</strong>
                <small>{fmtIn(entry.b_in)}</small>
              </div>
              <div>
                <span>Volume</span>
                <strong>{(+entry.volume).toFixed(3)}</strong>
                <small>ft3</small>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="total-bar">
        <span className="total-label"><i aria-hidden="true">=</i>Total Volume</span>
        <span className="total-value">{total.toFixed(3)}<small>ft3</small></span>
      </div>

      <div className="results-actions">
        <button className="action-btn hist" onClick={handleSave} disabled={saveDisabled}>
          <i aria-hidden="true">{saveDisabled ? '...' : saveLabel === 'Saved!' ? '+' : '#'}</i>
          {saveLabel}
        </button>
        <button className="action-btn scan" onClick={retake}>
          <i aria-hidden="true">[]</i>
          Retake Photo
        </button>
        <button className="action-btn danger" onClick={resetAll}>
          <i aria-hidden="true">x</i>
          Start Over
        </button>
      </div>
    </div>
  );
}
