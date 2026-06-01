import { useState, useEffect } from 'react';
import { API_BASE, checkServerConnection } from '../../../config';

export default function AuthScreen({ setAuthToken, validateSession, setScreen }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin]   = useState(true);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [serverStatus, setServerStatus] = useState('checking');

  useEffect(() => {
    testConnection();
  }, []);

  async function testConnection() {
    setServerStatus('checking');
    const result = await checkServerConnection();
    setServerStatus(result.connected ? 'online' : 'offline');
    if (!result.connected) {
      setError(`Server unreachable!\n${result.error}`);
    } else {
      setError('');
    }
  }

  async function handleAuth() {
    setError('');
    if (!email || !password)  { setError('Please enter both email and password'); return; }
    if (password.length < 6)  { setError('Password must be at least 6 characters'); return; }

    setLoading(true);
    try {
      const endpoint = isLogin ? '/login' : '/register';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res  = await fetch(`${API_BASE}${endpoint}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
        signal:  controller.signal,
      });
      clearTimeout(timeout);

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');

      const token = data.token;
      localStorage.setItem('wood_auth_token', token);
      setAuthToken(token);

      if (!data.user.subscription.active) {
        setScreen('sub');
      } else {
        validateSession(token);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Connection timed out. Make sure:\n1. Backend server is running\n2. Phone and PC are on the same WiFi\n3. Check your PC IP address');
      } else if (err.message === 'Failed to fetch' || err.message.includes('NetworkError')) {
        setError('Cannot connect to server!\n\nMake sure:\n1. Backend is running (node server.js)\n2. Phone & PC are on same WiFi\n3. Windows Firewall allows port 3001');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter') handleAuth();
  }

  const statusText = serverStatus === 'online' ? 'Server online' : serverStatus === 'offline' ? 'Server offline' : 'Checking server';

  return (
    <div className="screen auth-screen">
      <div className="auth-hero">
        <span className="eyebrow">Secure field access</span>
        <h2>Wood Volume Calculator</h2>
      </div>

      <div className="auth-card">
        <div className={`server-status ${serverStatus}`}>
          <span className="server-dot" aria-hidden="true" />
          {statusText}
          {serverStatus === 'offline' && (
            <button onClick={testConnection} className="server-retry">
              Retry
            </button>
          )}
        </div>

        <div className="input-group">
          <i aria-hidden="true">@</i>
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={handleKey}
            autoComplete="email"
          />
        </div>
        <div className="input-group">
          <i aria-hidden="true">*</i>
          <input
            type="password"
            placeholder="Password (min 6 characters)"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={handleKey}
            autoComplete="current-password"
          />
        </div>

        <button className="btn-primary" onClick={handleAuth} disabled={loading}>
          <i aria-hidden="true">{loading ? '...' : (isLogin ? '>' : '+')}</i>
          {loading
            ? (isLogin ? 'Signing in...' : 'Creating account...')
            : (isLogin ? 'Sign In'     : 'Create Account')}
        </button>

        <p className="auth-toggle" onClick={() => { setIsLogin(!isLogin); setError(''); }}>
          {isLogin ? 'Need an account? Create one' : 'Already have an account? Sign in'}
        </p>

        {error && (
          <p className="auth-err">
            <i aria-hidden="true">!</i>
            <span>{error}</span>
          </p>
        )}
      </div>
    </div>
  );
}
