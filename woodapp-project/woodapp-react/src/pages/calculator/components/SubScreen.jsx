import { useState } from 'react';

export default function SubScreen({ subStatus, validateSession, authToken, logout }) {
  const [loading, setLoading] = useState(false);

  async function checkSubscription() {
    setLoading(true);
    await validateSession(authToken);
    setLoading(false);
  }

  return (
    <div className="screen sub-screen">
      <div className="sub-hero">
        <div className="icon">⏰</div>
        <h2>{subStatus.title}</h2>
      </div>

      <div className="sub-card">
        <div className="sub-row">
          <span className="sub-label">Status</span>
          <span className={`sub-value ${subStatus.cls}`}>{subStatus.status}</span>
        </div>
        <div className="sub-row">
          <span className="sub-label">Plan</span>
          <span className="sub-value">$4.99 / 30 days</span>
        </div>
        <div className="sub-row">
          <span className="sub-label">Daily Scans</span>
          <span className="sub-value">200 per day</span>
        </div>
        <div className="sub-row">
          <span className="sub-label">Payment</span>
          <span className="sub-value">PayPal / Bank Transfer</span>
        </div>
        <div className="sub-row">
          <span className="sub-label">Activation</span>
          <span className="sub-value">Within 1 hour</span>
        </div>
        <div className="sub-row">
          <span className="sub-label">Contact</span>
          <span className="sub-value">your-email@example.com</span>
        </div>
      </div>

      <div className="sub-actions">
        <button className="btn-primary" onClick={checkSubscription} disabled={loading}>
          {loading ? '⏳ Checking…' : '🔄 Check Status'}
        </button>
        <button className="btn-secondary" onClick={logout}>Sign Out</button>
      </div>
    </div>
  );
}
