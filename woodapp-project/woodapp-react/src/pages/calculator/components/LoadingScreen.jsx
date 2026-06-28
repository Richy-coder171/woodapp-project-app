export default function LoadingScreen({ capturedPreview }) {
  return (
    <div className="screen loading-screen">
      {capturedPreview && (
        <img className="load-thumb" src={capturedPreview} alt="" />
      )}
      <div className="spinner" />
      <h2><i aria-hidden="true">#</i>Detecting measurements<span className="loading-dots" /></h2>
      <p>OpenCV is preparing the photo and PaddleOCR is reading measurements</p>
    </div>
  );
}
