export default function OfflineScreen({ validateSession, authToken, logout }) {
  return (
    <div className="screen" style={{ textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ fontSize: 60, marginBottom: 16 }}>📡</div>
      <h2 style={{ color: 'var(--text-primary)', marginBottom: 10 }}>Can't reach server</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
        Your login is saved — just make sure the backend server is running and you're on the same WiFi network.
      </p>

      <button
        className="btn-cta"
        onClick={() => validateSession(authToken)}
        style={{ marginBottom: 12 }}
      >
        🔄 Try Again
      </button>

      <div style={{ marginTop: 20 }}>
        <button className="btn-ghost" onClick={logout}>
          Sign in with a different account
        </button>
      </div>
    </div>
  );
}
