export default function PreviewScreen({ capturedPreview, previewError, retake, scanImage }) {
  return (
    <div className="screen preview-screen">
      <img src={capturedPreview} alt="Preview" style={{ width: '100%', flex: 1, objectFit: 'contain', background: '#050505', display: 'block', maxHeight: '65dvh' }} />

      {previewError && (
        <div className="err-box" style={{ display: 'block' }}>{previewError}</div>
      )}

      <div className="preview-bar">
        <button className="btn-outline" onClick={retake}>📷 Retake</button>
        <button
          className="btn-primary"
          style={{ flex: 2 }}
          onClick={scanImage}
        >
          🔍 Scan &amp; Calculate
        </button>
      </div>
    </div>
  );
}
