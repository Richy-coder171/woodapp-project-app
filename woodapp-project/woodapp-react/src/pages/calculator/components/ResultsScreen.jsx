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
          {entries.length} entr{entries.length === 1 ? 'y' : 'ies'} found
        </div>
      </div>

      {userScans.remaining <= 20 && (
        <div className="rate-warn">
          <i aria-hidden="true">!</i>
          {userScans.remaining} scans remaining today
        </div>
      )}

      {entries.length === 0 ? (
        <div className="no-data">
          <i aria-hidden="true">!</i>
          <div>No measurements found</div>
          <div className="no-data-note">
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
                  <th><i aria-hidden="true">r</i>Radius</th>
                  <th><i aria-hidden="true">h</i>Height</th>
                  <th><i aria-hidden="true">=</i>Volume</th>
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
                    <td className="vol-cell">{(+e.volume).toFixed(3)} ft3</td>
                    <td>
                      <button className="rm-btn" onClick={() => removeEntry(i)} aria-label={`Remove entry ${i + 1}`}>
                        <i aria-hidden="true">x</i>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="total-bar">
            <span className="total-label"><i aria-hidden="true">=</i>Total Volume</span>
            <span className="total-value">{total.toFixed(3)}<small>ft3</small></span>
          </div>
        </>
      )}

      <div className="manual-box">
        <h3><i aria-hidden="true">+</i>Add entry manually</h3>
        <div className="manual-row">
          <input
            type="number" step="0.1" placeholder="Radius"
            value={mR} onChange={e => setMR(e.target.value)}
          />
          <input
            type="number" step="1" placeholder="Height"
            value={mH} onChange={e => setMH(e.target.value)}
          />
          <button onClick={handleAddManual}>
            <i aria-hidden="true">+</i>
            Add
          </button>
        </div>
        <div className="manual-hint">
          Radius in inches. Height in ft.in notation, for example 36 is 3 ft 6 in.
        </div>
      </div>

      <div className="results-actions">
        <button className="action-btn hist" onClick={handleSave} disabled={saveDisabled}>
          <i aria-hidden="true">{saveDisabled ? '...' : saveLabel === 'Saved!' ? '+' : '#'}</i>
          {saveLabel}
        </button>
        <button className="action-btn scan" onClick={retake}>
          <i aria-hidden="true">[]</i>
          Scan Another
        </button>
        <button className="action-btn danger" onClick={resetAll}>
          <i aria-hidden="true">x</i>
          Start Over
        </button>
      </div>
    </div>
  );
}
