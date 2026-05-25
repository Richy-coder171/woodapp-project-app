import { useState } from 'react';

export default function ResultsScreen({
  entries, capturedPreview, userScans,
  removeEntry, addManual, saveScan,
  retake, resetAll,
}) {
  const [mR, setMR] = useState('');
  const [mH, setMH] = useState('');
  const [saveLabel, setSaveLabel] = useState('💾 Save to History');
  const [saveDisabled, setSaveDisabled] = useState(false);

  const total = entries.reduce((s, e) => s + (+e.volume), 0);

  function handleAddManual() {
    const rRaw = mR.trim();
    const hRaw = mH.trim();
    if (!rRaw || !hRaw) return;
    if (isNaN(parseFloat(rRaw)) || isNaN(parseFloat(hRaw))) return;
    addManual(rRaw, hRaw);
    setMR('');
    setMH('');
  }

  async function handleSave() {
    setSaveDisabled(true);
    setSaveLabel('💾 Saving…');
    try {
      await saveScan();
      setSaveLabel('✅ Saved!');
      setTimeout(() => { setSaveLabel('💾 Save to History'); setSaveDisabled(false); }, 1500);
    } catch {
      setSaveLabel('💾 Save to History');
      setSaveDisabled(false);
      alert('❌ Save failed — check connection');
    }
  }

  return (
    <div className="screen results-screen">
      {/* Thumbnail */}
      <div className="thumb-wrap">
        <img src={capturedPreview} alt="" />
        <div className="thumb-label">
          ✅ {entries.length} entr{entries.length === 1 ? 'y' : 'ies'} found
        </div>
      </div>

      {/* Rate warning */}
      {userScans.remaining <= 20 && (
        <div className="rate-warn">⚠️ {userScans.remaining} scans remaining today</div>
      )}

      {/* Table */}
      {entries.length === 0 ? (
        <div className="no-data">
          <span className="icon">⚠️</span>
          <div>No measurements found</div>
          <div style={{ fontSize: 12, marginTop: 4, color: 'var(--text-tertiary)' }}>
            Try retaking in better light, or add entries manually below
          </div>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>A (raw)</th>
                <th>→ in</th>
                <th>B (raw)</th>
                <th>→ in</th>
                <th>Vol ft³</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i}>
                  <td className="index-cell">{i + 1}</td>
                  <td className="raw-val">{e.a_raw}</td>
                  <td className="in-val">{e.a_in}"</td>
                  <td className="raw-val">{e.b_raw}</td>
                  <td className="in-val">{e.b_in}"</td>
                  <td className="vol-cell">{(+e.volume).toFixed(3)}</td>
                  <td>
                    <button className="rm-btn" onClick={() => removeEntry(i)} aria-label="Remove entry">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Total */}
      <div className="total-bar">
        <span className="total-label">Total Volume</span>
        <span className="total-value">
          {total.toFixed(3)}<small>ft³</small>
        </span>
      </div>

      {/* Manual entry */}
      <div className="manual-box">
        <h3>➕ Add entry manually</h3>
        <div className="manual-row">
          <input
            type="number" step="0.1" placeholder="Radius (e.g. 4)"
            value={mR} onChange={e => setMR(e.target.value)}
          />
          <input
            type="number" step="1" placeholder="Height (e.g. 12)"
            value={mH} onChange={e => setMH(e.target.value)}
          />
          <button onClick={handleAddManual}>Add</button>
        </div>
        <div className="manual-hint">
          <strong>Format guide:</strong> 1.6 = 1ft 6in = 1.5ft &nbsp;|&nbsp; 2.3 = 2ft 3in = 2.25ft
        </div>
      </div>

      {/* Actions */}
      <button className="action-btn" onClick={handleSave} disabled={saveDisabled}>{saveLabel}</button>
      <button className="action-btn" onClick={retake}>📷 Scan Another</button>
      <button className="action-btn danger" style={{ marginTop: 6, marginBottom: 20 }} onClick={resetAll}>
        ✕ Start Over
      </button>
    </div>
  );
}
