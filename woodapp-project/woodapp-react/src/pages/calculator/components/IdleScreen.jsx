export default function IdleScreen({ userInfo, userScans, startCamera, setScreen, logout }) {
  return (
    <div className="screen idle-screen">
      <div className="idle-panel">
        <div className="eyebrow"></div>
        <h2>Calculator</h2>
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
        <button className="btn-ghost" onClick={() => setScreen('history')}>
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
        <button className="btn-ghost" onClick={() => setScreen('admin')}>
          <i aria-hidden="true">*</i>
          Admin Dashboard
        </button>
        <button className="btn-ghost" onClick={logout}>
          <i aria-hidden="true">&lt;</i>
          Sign Out
        </button>
      </div>
    </div>
  );
}
