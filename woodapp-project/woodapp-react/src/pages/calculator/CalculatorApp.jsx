import { useState, useEffect, useRef } from 'react';
import '../../styles/calculator.css';
import { API_BASE } from '../../config';
import { calcVolume, ftinToInches } from '../../utils/calc';

import AuthScreen    from './components/AuthScreen';
import SubScreen     from './components/SubScreen';
import IdleScreen    from './components/IdleScreen';
import CameraScreen  from './components/CameraScreen';
import PreviewScreen from './components/PreviewScreen';
import LoadingScreen from './components/LoadingScreen';
import ResultsScreen from './components/ResultsScreen';
import HistoryScreen from './components/HistoryScreen';
import OfflineScreen from './components/OfflineScreen';
import SkeletonScreen from './components/SkeletonScreen';

export default function CalculatorApp() {
  const [screen, setScreen]               = useState(() => localStorage.getItem('wood_auth_token') ? 'skeleton' : 'auth');
  const [authToken, setAuthToken]         = useState(() => localStorage.getItem('wood_auth_token'));
  const [entries, setEntries]             = useState([]);
  const [capturedB64, setCapturedB64]     = useState(null);
  const [capturedPreview, setCapturedPreview] = useState(null);
  const [userScans, setUserScans]         = useState({ used: 0, limit: 200, remaining: 200 });
  const [userInfo, setUserInfo]           = useState('Loading...');
  const [subStatus, setSubStatus]         = useState({ status: 'Inactive', cls: 'status-inactive', title: 'Activate Subscription' });
  const [previewError, setPreviewError]   = useState('');
  const streamRef = useRef(null);
  const [facing, setFacing]               = useState('environment');

  // On mount: validate existing session
  useEffect(() => {
    const token = localStorage.getItem('wood_auth_token');
    if (token) {
      setAuthToken(token);
      validateSession(token);
    } else {
      setScreen('auth');
    }
  }, []);

  /* Session */
  async function validateSession(token = authToken) {
    if (!token) { setScreen('auth'); return; }
    try {
      // Add timeout so it doesn't hang forever
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res  = await fetch(`${API_BASE}/me`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      // Token is invalid, expired, or points at a user no longer in this DB.
      if (res.status === 401 || res.status === 404) {
        localStorage.removeItem('wood_auth_token');
        setAuthToken(null);
        setScreen('auth');
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server returned status ${res.status}`);
      }
      const data = await res.json();

      if (!data.subscription.active) {
        const isExpired = data.subscription.reason === 'expired';
        setSubStatus(isExpired
          ? { status: 'Expired',  cls: 'status-expired',  title: 'Subscription Expired' }
          : { status: 'Inactive', cls: 'status-inactive', title: 'Activate Subscription' });
        setScreen('sub');
        return;
      }

      const scans = data.scans || { used: 0, limit: 200, remaining: 200 };
      setUserScans(scans);
      setUserInfo(`${data.email} | ${data.subscription.daysLeft} days remaining`);
      setScreen('idle');
    } catch (err) {
      const isNetworkError = err.name === 'AbortError'
        || err.message === 'Failed to fetch'
        || err.message.includes('NetworkError');

      if (isNetworkError) {
        // Network error / timeout: keep the token and show a retry option.
        console.log('Session validation failed (network):', err.message);
        setScreen('offline');
        return;
      }

      console.log('Session validation failed:', err.message);
      localStorage.removeItem('wood_auth_token');
      setAuthToken(null);
      setScreen('auth');
    }
  }

  function logout() {
    stopStream();
    localStorage.removeItem('wood_auth_token');
    setAuthToken(null);
    setEntries([]);
    setCapturedB64(null);
    setScreen('auth');
  }

  /* Camera */
  async function startCamera(facingMode = facing) {
    try {
      stopStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      setScreen('camera');
    } catch (e) {
      alert('Camera error: ' + e.message);
    }
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  function flipCamera() {
    const newFacing = facing === 'environment' ? 'user' : 'environment';
    setFacing(newFacing);
    startCamera(newFacing);
  }

  function handleCapture(b64, preview) {
    setCapturedB64(b64);
    setCapturedPreview(preview);
    stopStream();
    setPreviewError('');
    setScreen('preview');
  }

  function retake() { startCamera(); }

  function resetAll() {
    stopStream();
    setCapturedB64(null);
    setEntries([]);
    setScreen('idle');
  }

  /* Scan */
  async function scanImage() {
    if (!capturedB64) return;

    if (userScans.remaining <= 0) {
      setPreviewError('Daily scan limit reached (200/day). Resets at midnight UTC.');
      setScreen('preview');
      return;
    }

    setScreen('loading');

    try {
      const res = await fetch(`${API_BASE}/scan`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body:    JSON.stringify({ imageBase64: capturedB64 }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'RATE_LIMIT')  { setPreviewError('Daily scan limit reached (200/day). Resets at midnight UTC.'); setScreen('preview'); return; }
        if (data.code === 'SUB_EXPIRED') { setScreen('sub'); return; }
        throw new Error(data.error || 'Scan failed');
      }

      setUserScans(prev => ({ ...prev, remaining: data.scansRemaining ?? 0 }));

      const parsed = (data.entries || []).map(e => {
        const vol = calcVolume(e.a_raw, e.b_raw);
        return {
          a_raw:  e.a_raw,
          b_raw:  e.b_raw,
          a_in:   ftinToInches(e.a_raw, true),
          b_in:   ftinToInches(e.b_raw, false),
          volume: +vol.toFixed(3),
        };
      });
      setEntries(parsed);
      setScreen('results');
    } catch (err) {
      setPreviewError('Scan failed: ' + err.message + '\n\nPlease try again.');
      setScreen('preview');
    }
  }

  /* Entries */
  function removeEntry(i) {
    setEntries(prev => prev.filter((_, idx) => idx !== i));
  }

  function addManual(rRaw, hRaw) {
    const vol  = calcVolume(rRaw, hRaw);
    const aIn  = ftinToInches(rRaw, true);
    const bIn  = ftinToInches(hRaw, false);
    setEntries(prev => [...prev, { a_raw: rRaw, b_raw: hRaw, a_in: aIn, b_in: bIn, volume: +vol.toFixed(3) }]);
  }

  /* Save */
  async function saveScan() {
    if (!entries.length) return;
    const total = entries.reduce((s, e) => s + (+e.volume), 0);
    const res = await fetch(`${API_BASE}/save-scan`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body:    JSON.stringify({ entries, totalVolume: total, imagePreview: capturedPreview }),
    });
    const data = await res.json();
    if (!data.success) throw new Error('Save failed');
  }

  /* Shared props */
  const props = {
    authToken, setAuthToken,
    entries, setEntries,
    capturedB64, capturedPreview,
    userScans, setUserScans,
    userInfo,
    subStatus,
    previewError,
    streamRef, facing,
    // actions
    validateSession, logout,
    startCamera, stopStream, flipCamera, handleCapture,
    retake, resetAll,
    scanImage,
    removeEntry, addManual,
    saveScan,
    setScreen,
  };

  return (
    <div id="app">
      <header>
        <div className="brand-lockup" aria-label="WoodApp">
          <span className="brand-mark" aria-hidden="true">W</span>
          <span className="brand-kicker">WoodApp field ledger</span>
        </div>
        <h1>Wood Volume Calculator</h1>
        <div className="formula-badge">
          <i aria-hidden="true">#</i>
          <span>V = r x h2 / 2304 | radius: in | height: ft.in</span>
        </div>
      </header>

      {screen === 'skeleton'&& <SkeletonScreen />}
      {screen === 'auth'    && <AuthScreen    {...props} />}
      {screen === 'sub'     && <SubScreen     {...props} />}
      {screen === 'idle'    && <IdleScreen    {...props} />}
      {screen === 'camera'  && <CameraScreen  {...props} />}
      {screen === 'preview' && <PreviewScreen {...props} />}
      {screen === 'loading' && <LoadingScreen {...props} />}
      {screen === 'results' && <ResultsScreen {...props} />}
      {screen === 'history' && <HistoryScreen {...props} />}
      {screen === 'offline' && <OfflineScreen {...props} />}
    </div>
  );
}
