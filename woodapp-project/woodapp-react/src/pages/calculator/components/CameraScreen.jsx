import { useEffect, useRef } from 'react';

export default function CameraScreen({ streamRef, facing, setFacing, handleCapture, resetAll, startCamera }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [streamRef.current]);

  function capture() {
    const v = videoRef.current;
    if (!v) return;
    const canvas = document.createElement('canvas');
    canvas.width  = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d').drawImage(v, 0, 0);
    const b64     = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
    const preview = canvas.toDataURL('image/jpeg', 0.7);
    handleCapture(b64, preview);
  }

  function flipCam() {
    const newFacing = facing === 'environment' ? 'user' : 'environment';
    setFacing(newFacing);
    startCamera(newFacing);
  }

  return (
    <div className="screen camera-screen">
      <video ref={videoRef} playsInline autoPlay muted />

      <div className="guide-frame">
        <span className="guide-label">
          <i aria-hidden="true">+</i>
          Measure area
        </span>
      </div>

      <div className="cam-bar">
        <button className="cam-btn" onClick={resetAll} aria-label="Close camera">x</button>
        <button className="shutter-btn" onClick={capture} aria-label="Take photo">
          <div className="inner"><i aria-hidden="true" /></div>
        </button>
        <button className="cam-btn" onClick={flipCam} aria-label="Switch camera">{'<>'}</button>
      </div>
    </div>
  );
}
