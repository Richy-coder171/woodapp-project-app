export default function PreviewScreen({ capturedPreview, previewError, retake, scanImage }) {
  return (
    <div className="screen preview-screen">
      <img src={capturedPreview} alt="Preview" />

      {previewError && (
        <div className="err-box">
          <i aria-hidden="true">!</i>
          <span>{previewError}</span>
        </div>
      )}

      <div className="preview-bar">
        <button className="btn-outline" onClick={retake}>
          <i aria-hidden="true">&lt;</i>
          Retake
        </button>
        <button
          className="btn-primary"
          onClick={scanImage}
        >
          <i aria-hidden="true">#</i>
          Detect Measurements
        </button>
      </div>
    </div>
  );
}
