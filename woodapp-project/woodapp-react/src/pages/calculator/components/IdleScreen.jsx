import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const RADIUS_CHOICES = Array.from({ length: 73 }, (_, i) => 12 + i);
const HEIGHT_CHOICES = [
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
  { label: '5', value: 5 },
  { label: '6', value: 6 },
  { label: '7', value: 7 },
  { label: '8', value: 8 },
  { label: '9', value: 9 },
  { label: '10', value: 10 },
  { label: '4.3', value: 4.25 },
  { label: '3.3', value: 3.25 },
  { label: '2.3', value: 2.25 },
  { label: '0.6', value: 0.5 },
];

function radiusLabel(inches) {
  const feet = Math.floor(inches / 12);
  const rest = inches % 12;
  return `${feet}.${rest}`;
}

function totalOf(items) {
  return items.reduce((sum, item) => sum + item.value, 0);
}

export default function IdleScreen({ userInfo, userScans, startCamera, setScreen, logout }) {
  const navigate = useNavigate();
  const [selectedRadius, setSelectedRadius] = useState(null);
  const [selectedHeight, setSelectedHeight] = useState(null);
  const [manualEntries, setManualEntries] = useState([]);
  const [calculatedTotal, setCalculatedTotal] = useState(null);

  const liveTotal = useMemo(() => totalOf(manualEntries), [manualEntries]);

  function addManualEntry(radius, height) {
    const value = ((radius.inches * radius.inches) / 2304) * height.value;
    const entry = {
      radiusLabel: radius.label,
      heightLabel: height.label,
      value,
    };

    setManualEntries(prev => [...prev, entry]);
    setCalculatedTotal(current => current === null ? null : current + value);
    setSelectedRadius(null);
    setSelectedHeight(null);
  }

  function pickRadius(inches) {
    const nextRadius = { inches, label: radiusLabel(inches) };
    if (selectedHeight) {
      addManualEntry(nextRadius, selectedHeight);
      return;
    }
    setSelectedRadius(nextRadius);
  }

  function pickHeight(choice) {
    if (selectedRadius) {
      addManualEntry(selectedRadius, choice);
      return;
    }
    setSelectedHeight(choice);
  }

  function removeManualEntry(index) {
    setManualEntries(prev => {
      const next = prev.filter((_, i) => i !== index);
      setCalculatedTotal(current => current === null ? null : (next.length ? totalOf(next) : null));
      return next;
    });
  }

  function undoManualEntry() {
    setManualEntries(prev => {
      if (!prev.length) return prev;
      const next = prev.slice(0, -1);
      setCalculatedTotal(current => current === null ? null : (next.length ? totalOf(next) : null));
      return next;
    });
  }

  function clearManualCalculator() {
    setManualEntries([]);
    setCalculatedTotal(null);
    setSelectedRadius(null);
    setSelectedHeight(null);
  }

  return (
    <div className="screen idle-screen">
      <div className="idle-panel">
        <div className="eyebrow"></div>
        <h2>calculator</h2>
        <div className="instrument-strip" aria-hidden="true">
          {Array.from({ length: 18 }).map((_, i) => (
            <span key={i} className={i % 3 === 0 ? 'major' : ''} />
          ))}
        </div>
        <div className="idle-hint">Camera scan, editable rows, saved history.</div>
      </div>

      <button className="btn-cta" onClick={() => startCamera()}>
        <i aria-hidden="true">[]</i>
        Open Camera
      </button>

      <div className="idle-actions">
        <button className="btn btn-secondary" onClick={() => setScreen('history')}>
          <i aria-hidden="true">#</i>
          View History
        </button>
        <div className="user-badge">
          <span className="dot" />
          <span>{userInfo}</span>
        </div>
        <div className="scan-badge">
          <i aria-hidden="true">=</i>
          {userScans.remaining} scans left today
        </div>
        <button className="btn-ghost" onClick={() => navigate('/admindashboard')}>
          <i aria-hidden="true">*</i>
          Admin Dashboard
        </button>
        <button className="btn-ghost" onClick={logout}>
          <i aria-hidden="true">&lt;</i>
          Sign Out
        </button>
      </div>

      <section className="idle-calculator" aria-label="Manual volume calculator">
        <div className="idle-calc-head">
          <div>
            <span className="eyebrow">Manual calculator</span>
            <h3>Quick Volume</h3>
          </div>
          <button className="btn-ghost idle-calc-clear" onClick={clearManualCalculator}>
            <i aria-hidden="true">x</i>
            Clear
          </button>
        </div>

        <div className="calc-pending">
          <span className={`calc-chip ${selectedRadius ? 'set' : ''}`}>
            Radius {selectedRadius ? selectedRadius.label : '-'}
          </span>
          <span className={`calc-chip ${selectedHeight ? 'set' : ''}`}>
            Height {selectedHeight ? selectedHeight.label : '-'}
          </span>
        </div>

        <div className="calc-panel">
          <div className="calc-label">Height (ft)</div>
          <div className="calc-button-grid calc-height-grid">
            {HEIGHT_CHOICES.map(choice => (
              <button
                className={`calc-pick ${selectedHeight?.label === choice.label ? 'active' : ''}`}
                key={choice.label}
                onClick={() => pickHeight(choice)}
                type="button"
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>

        <div className="calc-panel">
          <div className="calc-label">Radius (ft.in)</div>
          <div className="calc-button-grid calc-radius-grid">
            {RADIUS_CHOICES.map(inches => {
              const label = radiusLabel(inches);
              return (
                <button
                  className={`calc-pick ${selectedRadius?.inches === inches ? 'active' : ''}`}
                  key={inches}
                  onClick={() => pickRadius(inches)}
                  type="button"
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="calc-log-panel">
          <div className="calc-label">Entries</div>
          {manualEntries.length ? (
            <ul className="calc-log-list">
              {manualEntries.map((entry, index) => (
                <li className="calc-log-item" key={`${entry.radiusLabel}-${entry.heightLabel}-${index}`}>
                  <span className="calc-log-tag">MANUAL</span>
                  <span className="calc-log-measure">
                    #{index + 1} {entry.radiusLabel} x {entry.heightLabel}
                  </span>
                  <span className="calc-log-value">{entry.value.toFixed(3)} ft3</span>
                  <button
                    className="calc-log-remove"
                    onClick={() => removeManualEntry(index)}
                    type="button"
                    aria-label={`Remove manual entry ${index + 1}`}
                  >
                    x
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="calc-empty">No entries yet</div>
          )}
        </div>

        <div className="calc-footer">
          <div className="calc-result-box">
            <span>Total Volume</span>
            <strong>{calculatedTotal === null ? '-' : calculatedTotal.toFixed(3)}</strong>
            <small>{manualEntries.length ? `${liveTotal.toFixed(3)} ft3 ready` : 'cubic feet'}</small>
          </div>
          <div className="calc-actions">
            <button className="calc-action calc" onClick={() => setCalculatedTotal(liveTotal)} type="button">
              Calculate
            </button>
            <button className="calc-action undo" onClick={undoManualEntry} type="button">
              Undo Last
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
