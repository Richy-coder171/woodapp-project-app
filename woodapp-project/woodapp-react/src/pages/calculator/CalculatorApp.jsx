import { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import '../../styles/calculator.css';
import { API_BASE } from '../../config';
import { calcVolume, ftinToInches } from '../../utils/calc';
import {
  calculateSelectedDetections,
  normalizeDetections,
  toggleMeasurement as toggleMeasurementItem,
} from '../../utils/scanSelection.js';

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
import ScanReviewScreen from './components/ScanReviewScreen';

const MAX_UPLOAD_SIDE = 1800;
const UPLOAD_QUALITY = 0.88;

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read photo'));
    reader.readAsDataURL(blob);
  });
}

async function imageFileToUpload(file) {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = objectUrl;
    await image.decode();

    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) throw new Error('Invalid image');

    const scale = Math.min(1, MAX_UPLOAD_SIDE / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Camera image could not be prepared');
    context.drawImage(image, 0, 0, width, height);

    const mimeType = file.type && file.type.startsWith('image/') ? file.type : 'image/jpeg';
    const outputType = mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await canvasToBlob(canvas, outputType, UPLOAD_QUALITY);
    if (!blob) throw new Error('Camera image could not be prepared');

    const dataUrl = await blobToDataUrl(blob);
    return {
      base64: dataUrl.split(',')[1] || '',
      preview: dataUrl,
      mimeType: outputType,
      filename: file.name || `woodapp-photo.${outputType === 'image/png' ? 'png' : 'jpg'}`,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function CalculatorApp() {
  const [screen, setScreen]               = useState(() => localStorage.getItem('wood_auth_token') ? 'skeleton' : 'auth');
  const [authToken, setAuthToken]         = useState(() => localStorage.getItem('wood_auth_token'));
  const [entries, setEntries]             = useState([]);
  const [capturedB64, setCapturedB64]     = useState(null);
  const [capturedPreview, setCapturedPreview] = useState(null);
  const [capturedMimeType, setCapturedMimeType] = useState('image/jpeg');
  const [detections, setDetections]       = useState([]);
  const [imageMeta, setImageMeta]         = useState({ width: 0, height: 0 });
  const [userScans, setUserScans]         = useState({ used: 0, limit: 200, remaining: 200 });
  const [userInfo, setUserInfo]           = useState('Loading...');
  const [subStatus, setSubStatus]         = useState({ status: 'Inactive', cls: 'status-inactive', title: 'Activate Subscription' });
  const [previewError, setPreviewError]   = useState('');
  const [scannerStage, setScannerStage]   = useState('idle');
  const [scannerError, setScannerError]   = useState('');
  const [calculationNotice, setCalculationNotice] = useState('');
  const [resultNotice, setResultNotice]   = useState('');
  const [isDetecting, setIsDetecting]     = useState(false);
  const streamRef = useRef(null);
  const nativeCameraInputRef = useRef(null);
  const screenRef = useRef(screen);
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

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  useEffect(() => {
    function handleBackNavigation() {
      const currentScreen = screenRef.current;

      if (currentScreen === 'results') {
        setScreen('scanReview');
        return;
      }

      if (currentScreen === 'scanReview' || currentScreen === 'camera') {
        stopStream();
        setCalculationNotice('');
        setScannerError('');
        setScreen('idle');
      }
    }

    window.addEventListener('popstate', handleBackNavigation);
    return () => window.removeEventListener('popstate', handleBackNavigation);
  }, []);

  useEffect(() => {
    if (screen === 'camera' || screen === 'scanReview' || screen === 'results') {
      window.history.pushState({ woodappScannerScreen: screen }, '', window.location.href);
    }
  }, [screen]);

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
    setCapturedPreview(null);
    setDetections([]);
    setImageMeta({ width: 0, height: 0 });
    setScreen('auth');
  }

  /* Camera */
  async function startCamera(facingMode = facing) {
    if (Capacitor.isNativePlatform()) {
      nativeCameraInputRef.current?.click();
      return;
    }

    try {
      stopStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      setScreen('camera');
    } catch (e) {
      const denied = e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError';
      alert(denied
        ? 'Camera permission denied. Enable camera permission for WoodApp and try again.'
        : 'Camera unavailable: ' + e.message);
    }
  }

  function handleNativeCameraPick(event) {
    const file = event.target.files?.[0];
    if (file) handleUploadPhoto(file);
    event.target.value = '';
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

  function handleCapture(b64, preview, mimeType = 'image/jpeg') {
    setCapturedB64(b64);
    setCapturedPreview(preview);
    setCapturedMimeType(mimeType);
    setDetections([]);
    setImageMeta({ width: 0, height: 0 });
    setScannerError('');
    setCalculationNotice('');
    setResultNotice('');
    stopStream();
    setPreviewError('');
    setScreen('scanReview');
    scanImage(b64, mimeType);
  }

  function retake() {
    setDetections([]);
    setImageMeta({ width: 0, height: 0 });
    setScannerError('');
    setCalculationNotice('');
    setResultNotice('');
    startCamera();
  }

  function resetAll() {
    stopStream();
    setCapturedB64(null);
    setCapturedPreview(null);
    setEntries([]);
    setDetections([]);
    setImageMeta({ width: 0, height: 0 });
    setScannerError('');
    setCalculationNotice('');
    setResultNotice('');
    setScreen('idle');
  }

  async function handleUploadPhoto(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Unsupported image. Please choose a photo file.');
      return;
    }

    try {
      const photo = await imageFileToUpload(file);
      handleCapture(photo.base64, photo.preview, photo.mimeType);
    } catch (err) {
      alert(err.message || 'Invalid image. Please try another photo.');
    }
  }

  /* Scan */
  async function scanImage(imageBase64 = capturedB64, mimeType = capturedMimeType) {
    if (!imageBase64) return;

    if (userScans.remaining <= 0) {
      setScannerError('Daily scan limit reached (200/day). Resets at midnight UTC.');
      setScannerStage('service-error');
      setScreen('scanReview');
      return;
    }

    setScreen('scanReview');
    setIsDetecting(true);
    setScannerStage('uploading');
    setScannerError('');
    setCalculationNotice('');
    setDetections([]);

    try {
      await new Promise(resolve => setTimeout(resolve, 0));
      setScannerStage('detecting');
      const res = await fetch(`${API_BASE}/scan`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body:    JSON.stringify({ imageBase64, mimeType }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'RATE_LIMIT')  { setScannerError('Daily scan limit reached (200/day). Resets at midnight UTC.'); setScannerStage('service-error'); setScreen('scanReview'); return; }
        if (data.code === 'SUB_EXPIRED') { setScreen('sub'); return; }
        const error = new Error(data.error || 'Scan failed');
        error.code = data.code;
        throw error;
      }

      setUserScans(prev => ({ ...prev, remaining: data.scansRemaining ?? 0 }));
      setScannerStage('detecting');
      setImageMeta({
        width: Number(data.imageWidth || 0),
        height: Number(data.imageHeight || 0),
      });
      const nextDetections = normalizeDetections(data.detections || []);
      if (import.meta.env.DEV) {
        console.debug('scanner response detection count', nextDetections.length);
      }
      setDetections(nextDetections);
      if (!nextDetections.length) {
        setScannerStage('empty');
        setScannerError('No measurements detected');
      } else {
        setScannerStage('ready');
        setScannerError('');
      }
    } catch (err) {
      setScannerError(err.message || 'Scan failed');
      if (err.code === 'OCR_TIMEOUT') {
        setScannerStage('timeout');
      } else if (err.code === 'OCR_SERVICE_UNAVAILABLE' || err.code === 'MODEL_NOT_READY') {
        setScannerStage('service-error');
      } else {
        setScannerStage('processing-error');
      }
    } finally {
      setIsDetecting(false);
    }
  }

  function toggleMeasurement(id) {
    setDetections(items => toggleMeasurementItem(items, id));
    setCalculationNotice('');
  }

  const selectAll = () => {
    setDetections((items) =>
      items.map((item) => ({ ...item, selected: true }))
    );
    setCalculationNotice('');
  };

  const clearAll = () => {
    setDetections((items) =>
      items.map((item) => ({ ...item, selected: false }))
    );
    setCalculationNotice('');
  };

  function calculateSelected() {
    setScannerStage('detecting');
    const result = calculateSelectedDetections(detections);

    if (!result.entries.length) {
      setCalculationNotice(result.error || 'Select at least one measurement before calculating.');
      setScannerStage('ready');
      return;
    }

    setEntries(result.entries);
    setResultNotice(result.error);
    setScannerStage('ready');
    setScreen('results');
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
    detections, setDetections,
    imageMeta,
    userScans, setUserScans,
    userInfo,
    subStatus,
    previewError,
    scannerStage,
    scannerError,
    calculationNotice,
    resultNotice,
    isDetecting,
    streamRef, facing,
    // actions
    validateSession, logout,
    startCamera, stopStream, flipCamera, handleCapture,
    handleUploadPhoto,
    retake, resetAll,
    scanImage,
    toggleMeasurement, selectAll, clearAll, calculateSelected,
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

      <input
        ref={nativeCameraInputRef}
        className="photo-upload-input"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleNativeCameraPick}
      />

      {screen === 'skeleton'&& <SkeletonScreen />}
      {screen === 'auth'    && <AuthScreen    {...props} />}
      {screen === 'sub'     && <SubScreen     {...props} />}
      {screen === 'idle'    && <IdleScreen    {...props} />}
      {screen === 'camera'  && <CameraScreen  {...props} />}
      {screen === 'preview' && <PreviewScreen {...props} />}
      {screen === 'loading' && <LoadingScreen {...props} />}
      {screen === 'scanReview' && <ScanReviewScreen {...props} />}
      {screen === 'results' && <ResultsScreen {...props} />}
      {screen === 'history' && <HistoryScreen {...props} />}
      {screen === 'offline' && <OfflineScreen {...props} />}
    </div>
  );
}
