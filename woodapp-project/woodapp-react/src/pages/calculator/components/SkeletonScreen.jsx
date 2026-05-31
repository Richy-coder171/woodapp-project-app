export default function SkeletonScreen() {
  return (
    <div className="screen skeleton-screen">
      <div className="skel-icon skel-pulse" />

      <div className="skel-hint-group">
        <div className="skel-line skel-line-lg skel-pulse" />
        <div className="skel-line skel-line-md skel-pulse delay-1" />
      </div>

      <div className="skel-btn skel-pulse delay-2" />

      <div className="skel-actions">
        <div className="skel-pill skel-pulse delay-3" />
        <div className="skel-badge skel-pulse delay-4" />
        <div className="skel-pill-sm skel-pulse delay-5" />
        <div className="skel-pill-xs skel-pulse delay-6" />
      </div>
    </div>
  );
}
