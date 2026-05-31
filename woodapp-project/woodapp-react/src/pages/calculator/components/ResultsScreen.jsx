import { useState } from 'react';

export default function ResultsScreen({
  entries, capturedPreview, userScans,
  removeEntry, addManual, saveScan,
  retake, resetAll,
}) {
  const [mR, setMR] = useState('');
  const [mH, setMH] = useState('');
  const [saveLabel, setSaveLabel] = useState('Save to History');
  const [saveDisabled, setSaveDisabled] = useState(false);

  const total = entries.reduce((s, e) => s + (+e.volume), 0);
  const fmtIn = value => {
    const n = Number(value);
    return Number.isFinite(n) ? `${n.toFixed(1)} in` : 'n/a';
  };

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
    setSaveLabel('Saving…');
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
      {/* Thumbnail */}
      <div className="thumb-wrap">
        <img src={capturedPreview} alt="" />
        <div className="thumb-label">
          <i aria-hidden="true">✅</i>
          {entries.length} entr{entries.length === 1 ? 'y' : 'ies'} found
        </div>
      </div>

      {/* Rate warning */}
      {userScans.remaining <= 20 && (
        <div className="rate-warn">
          <i aria-hidden="true">⚠️</i>
          {userScans.remaining} scans remaining today
        </div>
      )}

      {/* Entries List */}
      {entries.length === 0 ? (
        <div className="no-data">
          <i aria-hidden="true">⚠️</i>
          <div>No measurements found</div>
          <div style={{ fontSize: 12, marginTop: 4, color: 'var(--text-tertiary)' }}>
            Try retaking in better light, or add entries manually below
          </div>
        </div>
      ) : (
        <>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th><i aria-hidden="true">#</i>Entry</th>
                  <th><i aria-hidden="true">↔</i>Radius</th>
                  <th><i aria-hidden="true">↕</i>Height</th>
                  <th><i aria-hidden="true">∑</i>Volume</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={i}>
                    <td className="index-cell">#{i + 1}</td>
                    <td>
                      <div className="raw-val">{e.a_raw}</div>
                      <div className="in-val">{fmtIn(e.a_in)}</div>
                    </td>
                    <td>
                      <div className="raw-val">{e.b_raw}</div>
                      <div className="in-val">{fmtIn(e.b_in)}</div>
                    </td>
                    <td className="vol-cell">{(+e.volume).toFixed(3)} ft³</td>
                    <td>
                      <button className="rm-btn" onClick={() => removeEntry(i)} aria-label={`Remove entry ${i + 1}`}>
                        <i aria-hidden="true">✕</i>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="total-bar">
            <span className="total-label"><i aria-hidden="true">∑</i>Total Volume</span>
            <span className="total-value">{total.toFixed(3)}<small>ft³</small></span>
          </div>
        </>
      )}

      {/* Manual entry */}
      <div className="manual-box">
        <h3><i aria-hidden="true">➕</i>Add entry manually</h3>
        <div className="manual-row">
          <input
            type="number" step="0.1" placeholder="Radius (e.g. 4)"
            value={mR} onChange={e => setMR(e.target.value)}
          />
          <input
            type="number" step="1" placeholder="Height (e.g. 12)"
            value={mH} onChange={e => setMH(e.target.value)}
          />
          <button onClick={handleAddManual}>
            <i aria-hidden="true">+</i>
            Add
          </button>
        </div>
        <div className="manual-hint">
          <strong>Format:</strong> Radius in inches, Height in ft.in (e.g. 12 = 1ft 2in)
        </div>
      </div>

      {/* Actions */}
      <div style={{ padding: '0 14px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="action-btn hist" onClick={handleSave} disabled={saveDisabled}>
          <i aria-hidden="true">{saveDisabled ? '⏳' : saveLabel === 'Saved!' ? '✅' : '💾'}</i>
          {saveLabel}
        </button>
        <button className="action-btn scan" onClick={retake}>
          <i aria-hidden="true">📷</i>
          Scan Another
        </button>
        <button className="action-btn danger" onClick={resetAll}>
          <i aria-hidden="true">✕</i>
          Start Over
        </button>
      </div>
    </div>
  );
}
