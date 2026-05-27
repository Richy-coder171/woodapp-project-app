export default function SkeletonScreen() {
  return (
    <div className="screen skeleton-screen">
      {/* Icon placeholder */}
      <div className="skel-icon skel-pulse" />

      {/* Hint text placeholders */}
      <div className="skel-hint-group">
        <div className="skel-line skel-line-lg skel-pulse" />
        <div className="skel-line skel-line-md skel-pulse" style={{ animationDelay: '0.1s' }} />
      </div>

      {/* CTA button placeholder */}
      <div className="skel-btn skel-pulse" style={{ animationDelay: '0.2s' }} />

      {/* Bottom actions placeholders */}
      <div className="skel-actions">
        <div className="skel-pill skel-pulse" style={{ animationDelay: '0.25s' }} />
        <div className="skel-badge skel-pulse" style={{ animationDelay: '0.3s' }} />
        <div className="skel-pill-sm skel-pulse" style={{ animationDelay: '0.35s' }} />
        <div className="skel-pill-xs skel-pulse" style={{ animationDelay: '0.4s' }} />
      </div>
    </div>
  );
}
