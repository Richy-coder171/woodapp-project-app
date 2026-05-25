export default function LoadingScreen({ capturedPreview }) {
  return (
    <div className="screen loading-screen">
      {capturedPreview && (
        <img className="load-thumb" src={capturedPreview} alt="" />
      )}
      <div className="spinner" />
      <h2>Reading measurements<span className="loading-dots" /></h2>
      <p>AI is analyzing your handwriting and calculating volumes</p>
    </div>
  );
}
