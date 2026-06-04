import { Capacitor, registerPlugin } from '@capacitor/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE, checkServerConnection } from '../../../config';

const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const GoogleAuth = registerPlugin('GoogleAuth');

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.id) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GOOGLE_SCRIPT_SRC}"]`);

    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export default function AuthScreen({ setAuthToken, validateSession, setScreen }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin]   = useState(true);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleStatus, setGoogleStatus] = useState('checking');
  const [googleConfig, setGoogleConfig] = useState({ enabled: false, clientId: '' });
  const [serverStatus, setServerStatus] = useState('checking');
  const googleButtonRef = useRef(null);

  useEffect(() => {
    testConnection();
  }, []);

  const finishAuth = useCallback((data) => {
    const token = data.token;
    localStorage.setItem('wood_auth_token', token);
    setAuthToken(token);

    if (!data.user.subscription.active) {
      setScreen('sub');
    } else {
      validateSession(token);
    }
  }, [setAuthToken, setScreen, validateSession]);

  const completeGoogleCredential = useCallback(async (credential) => {
    setError('');
    setGoogleLoading(true);

    try {
      if (!credential) throw new Error('Google sign-in was cancelled');

      const res = await fetch(`${API_BASE}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Google sign-in failed');
      finishAuth(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setGoogleLoading(false);
    }
  }, [finishAuth]);

  const handleGoogleCredential = useCallback((response) => {
    completeGoogleCredential(response?.credential);
  }, [completeGoogleCredential]);

  useEffect(() => {
    let cancelled = false;

    async function setupGoogle() {
      setGoogleStatus('checking');

      try {
        const res = await fetch(`${API_BASE}/auth/google/config`);
        const config = await res.json();

        if (!res.ok || !config.enabled || !config.clientId) {
          if (!cancelled) setGoogleStatus('missing');
          return;
        }

        if (!cancelled) setGoogleConfig(config);

        if (Capacitor.isNativePlatform()) {
          if (!cancelled) setGoogleStatus('native');
          return;
        }

        await loadGoogleIdentityScript();
        if (cancelled) return;

        window.google.accounts.id.initialize({
          client_id: config.clientId,
          callback: handleGoogleCredential,
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        setGoogleStatus('ready');
      } catch (err) {
        if (!cancelled) {
          setGoogleStatus('error');
          setError(`Google sign-in could not load: ${err.message || 'check internet and Google OAuth origin'}`);
        }
      }
    }

    setupGoogle();

    return () => {
      cancelled = true;
    };
  }, [handleGoogleCredential]);

  useEffect(() => {
    if (googleStatus !== 'ready' || !googleButtonRef.current || !window.google?.accounts?.id) return;

    googleButtonRef.current.innerHTML = '';
    window.google.accounts.id.renderButton(googleButtonRef.current, {
      theme: 'outline',
      size: 'large',
      shape: 'rectangular',
      text: isLogin ? 'signin_with' : 'signup_with',
      width: Math.min(360, googleButtonRef.current.offsetWidth || 320),
    });
  }, [googleStatus, isLogin]);

  async function handleNativeGoogleAuth() {
    setError('');

    if (!googleConfig.enabled || !googleConfig.clientId) {
      setError('Google sign-in is not configured on the backend.');
      return;
    }

    setGoogleLoading(true);

    try {
      const result = await GoogleAuth.signIn({ clientId: googleConfig.clientId });
      await completeGoogleCredential(result.credential);
    } catch (err) {
      setError(err.message || 'Google sign-in failed');
      setGoogleLoading(false);
    }
  }

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

      finishAuth(data);
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

        <div className="auth-divider"><span>or</span></div>

        <div className="google-auth-slot" aria-busy={googleLoading}>
          <div ref={googleButtonRef} />
          {googleStatus === 'native' && (
            <button className="google-auth-btn" onClick={handleNativeGoogleAuth} disabled={googleLoading}>
              <i aria-hidden="true">G</i>
              Continue with Google
            </button>
          )}
          {googleStatus !== 'ready' && googleStatus !== 'native' && (
            <button className="google-auth-placeholder" disabled={googleStatus !== 'checking'}>
              {googleStatus === 'checking' ? 'Loading Google...' : 'Google sign-in unavailable'}
            </button>
          )}
          {googleLoading && <span className="google-auth-loading">Signing in...</span>}
        </div>

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
