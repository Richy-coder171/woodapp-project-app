import {
  getMeasurementBoxClass,
  getOverlayViewBox,
  getSelectedCount,
} from '../../../utils/scanSelection.js';

const STAGE_LABELS = {
  idle: 'Ready',
  uploading: 'Uploading photo',
  detecting: 'Detecting measurements',
  ready: 'Ready to select',
  empty: 'No measurements detected',
  timeout: 'OCR timeout',
  'service-error': 'OCR service unavailable',
  'processing-error': 'OCR scan failed',
};

export default function ScanReviewScreen({
  capturedPreview,
  imageMeta,
  detections,
  scannerStage,
  scannerError,
  calculationNotice,
  isDetecting,
  retake,
  selectAll,
  clearAll,
  calculateSelected,
  toggleMeasurement,
}) {
  const selectedCount = getSelectedCount(detections);
  const totalCount = detections.length;
  const ready = !isDetecting && totalCount > 0 && scannerStage === 'ready';
  const stageLabel = STAGE_LABELS[scannerStage] || scannerStage;
  const hasScannerError = Boolean(scannerError);
  const actionsDisabled = !ready || hasScannerError;

  return (
    <div className="screen scan-review-screen">
      <div className="scan-preview">
        <img src={capturedPreview} alt="Captured wood measurements" />

        {imageMeta.width > 0 && imageMeta.height > 0 && (
          <svg
            className="scan-overlay"
            viewBox={getOverlayViewBox(imageMeta.width, imageMeta.height)}
            preserveAspectRatio="xMidYMid meet"
          >
            {detections.map(item => (
              <g key={item.id} onClick={() => toggleMeasurement(item.id)}>
                <rect
                  x={item.box.x}
                  y={item.box.y}
                  width={item.box.width}
                  height={item.box.height}
                  className={getMeasurementBoxClass(item)}
                />
                <rect
                  x={item.box.x}
                  y={item.box.y}
                  width={item.box.width}
                  height={item.box.height}
                  className="measurement-hit-target"
                />
              </g>
            ))}
          </svg>
        )}
      </div>

      <div className="scan-review-panel">
        {!hasScannerError && (
          <div className="scanner-stage">
            {isDetecting && <span className="scanner-dot" aria-hidden="true" />}
            <span>{stageLabel}</span>
          </div>
        )}

        {ready && (
          <div className="selected-counter">
            {selectedCount} of {totalCount} measurements selected
          </div>
        )}

        {!isDetecting && totalCount === 0 && !scannerError && scannerStage === 'empty' && (
          <div className="scan-message">No measurements detected.</div>
        )}

        {scannerError && <div className="scan-message error">{scannerError}</div>}
        {calculationNotice && <div className="scan-message">{calculationNotice}</div>}

        <div className="scan-review-actions">
          <button className="btn-outline" onClick={retake}>
            <i aria-hidden="true">&lt;</i>
            Retake Photo
          </button>
          <button className="btn-secondary" onClick={selectAll} disabled={actionsDisabled}>
            <i aria-hidden="true">+</i>
            Select All
          </button>
          <button className="btn-secondary" onClick={clearAll} disabled={actionsDisabled}>
            <i aria-hidden="true">x</i>
            Clear All
          </button>
          <button className="btn-primary" onClick={calculateSelected} disabled={actionsDisabled}>
            <i aria-hidden="true">=</i>
            Calculate Selected
          </button>
        </div>
      </div>
    </div>
  );
}
