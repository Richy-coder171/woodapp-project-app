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

      {/* Entries List */}
      {entries.length === 0 ? (
        <div className="no-data">
          <span className="icon">⚠️</span>
          <div>No measurements found</div>
          <div style={{ fontSize: 12, marginTop: 4, color: 'var(--text-tertiary)' }}>
            Try retaking in better light, or add entries manually below
          </div>
        </div>
      ) : (
        <div className="entries-panel">
          <div className="entries-label">ENTRIES</div>
          {entries.map((e, i) => (
            <div className="entry-row" key={i}>
              <span className="entry-tag">MANUAL</span>
              <span className="entry-num">#{i + 1}</span>
              <span className="entry-dims">{e.a_raw} × {e.b_raw}</span>
              <span className="entry-vol">{(+e.volume).toFixed(3)} ft³</span>
              <button className="entry-rm" onClick={() => removeEntry(i)} aria-label="Remove">✕</button>
            </div>
          ))}
        </div>
      )}

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
          <strong>Format:</strong> Radius in inches, Height in ft.in (e.g. 12 = 1ft 2in)
        </div>
      </div>

      {/* Actions */}
      <div style={{ padding: '0 14px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="action-btn" onClick={handleSave} disabled={saveDisabled}>{saveLabel}</button>
        <button className="action-btn scan" onClick={retake}>📷 Scan Another</button>
        <button className="action-btn danger" onClick={resetAll}>✕ Start Over</button>
      </div>
    </div>
  );
}
