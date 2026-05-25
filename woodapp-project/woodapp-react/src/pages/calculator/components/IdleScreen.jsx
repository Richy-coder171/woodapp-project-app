export default function IdleScreen({ userInfo, userScans, startCamera, setScreen, logout }) {
  return (
    <div className="screen idle-screen">
      <div className="idle-icon">📷</div>

      <div className="idle-hint">
        <div style={{ marginTop: 12 }}>
          <span style={{
            display: 'inline-block',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '2px 8px',
            color: 'var(--text-primary)',
            fontWeight: 600,
            fontSize: 13,
          }}>
            Point camera at your measurements
          </span>
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 6 }}>
          AI reads handwritten numbers and calculates volume
        </div>
      </div>

      <button className="btn-cta" onClick={() => startCamera()}>
        <span>📷</span> Open Camera
      </button>

      <div className="idle-actions">
        <button className="btn-ghost" onClick={() => setScreen('history')}>
          📋 View History
        </button>
        <div className="user-badge">
          <span className="dot" />
          <span>{userInfo}</span>
        </div>
        <div className="scan-badge">
          📊 {userScans.remaining} scans left today
        </div>
        <button className="btn-ghost" onClick={() => setScreen('admin')}>
          ⚙️ Admin Dashboard
        </button>
        <button className="btn-ghost" onClick={logout}>Sign Out</button>
      </div>
    </div>
  );
}

