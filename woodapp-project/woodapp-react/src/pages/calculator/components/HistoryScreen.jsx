import { useState, useEffect } from 'react';
import { API_BASE } from '../../../config';

export default function HistoryScreen({ authToken, setScreen }) {
  const [history, setHistory] = useState(null); // null = loading
  const [error, setError]     = useState(false);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    setHistory(null);
    setError(false);
    try {
      const res  = await fetch(`${API_BASE}/history`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      setHistory(data);
    } catch {
      setError(true);
    }
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  return (
    <div className="screen history-screen">
      <div className="history-header">
        <h2><i aria-hidden="true">📋</i>Scan History</h2>
      </div>

      {/* Loading */}
      {history === null && !error && (
        <div className="no-data">
          <i aria-hidden="true">⏳</i>
          <div>Loading history…</div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="no-data">
          <i aria-hidden="true">❌</i>
          <div>Failed to load history</div>
          <div style={{ fontSize: 12, marginTop: 4, color: 'var(--text-tertiary)' }}>
            Please check your connection and try again
          </div>
        </div>
      )}

      {/* Empty */}
      {history !== null && !error && history.length === 0 && (
        <div className="no-data">
          <i aria-hidden="true">📋</i>
          <div>No scans yet</div>
          <div style={{ fontSize: 12, marginTop: 4, color: 'var(--text-tertiary)' }}>
            Your scanned measurements will appear here
          </div>
        </div>
      )}

      {/* List */}
      {history?.map((h, i) => {
        const count = h.entries.length;
        return (
          <div className="history-item" key={i}>
            <div className="date"><i aria-hidden="true">🕒</i>{formatDate(h.scanned_at)}</div>
            <div className="vol">
              {h.total_volume.toFixed(3)}{' '}
              <span style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 600 }}>ft³</span>
            </div>
            <div className="entries">
              <i aria-hidden="true">📏</i>
              {h.entries.map(e => `${e.a_raw}×${e.b_raw}`).join(', ')}
            </div>
            <div className="meta">
              <span className="count"><i aria-hidden="true">#</i>{count} {count === 1 ? 'entry' : 'entries'}</span>
            </div>
          </div>
        );
      })}

      <button
        className="action-btn"
        style={{ marginTop: 20, marginBottom: 20 }}
        onClick={() => setScreen('idle')}
      >
        <i aria-hidden="true">←</i>
        Back to Home
      </button>
    </div>
  );
}
