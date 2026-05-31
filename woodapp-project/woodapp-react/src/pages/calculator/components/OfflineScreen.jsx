export default function OfflineScreen({ validateSession, authToken, logout }) {
  return (
    <div className="screen offline-screen">
      <div className="offline-signal" aria-hidden="true">!</div>
      <h2>Can't reach server</h2>
      <p>
        Your login is saved. Make sure the backend server is running and you're on the same WiFi network.
      </p>

      <button className="btn-cta" onClick={() => validateSession(authToken)}>
        <i aria-hidden="true">?</i>
        Try Again
      </button>

      <div className="offline-actions">
        <button className="btn-ghost" onClick={logout}>
          <i aria-hidden="true">&lt;</i>
          Sign in with a different account
        </button>
      </div>
    </div>
  );
}
