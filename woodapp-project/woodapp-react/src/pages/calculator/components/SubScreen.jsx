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
        <span className="eyebrow">Subscription gate</span>
        <h2>{subStatus.title}</h2>
      </div>

      <div className="sub-card">
        <div className="sub-row">
          <span className="sub-label"><i aria-hidden="true">o</i>Status</span>
          <span className={`sub-value ${subStatus.cls}`}>{subStatus.status}</span>
        </div>
        <div className="sub-row">
          <span className="sub-label"><i aria-hidden="true">$</i>Plan</span>
          <span className="sub-value">$4.99 / 30 days</span>
        </div>
        <div className="sub-row">
          <span className="sub-label"><i aria-hidden="true">#</i>Daily Scans</span>
          <span className="sub-value">200 per day</span>
        </div>
        <div className="sub-row">
          <span className="sub-label"><i aria-hidden="true">%</i>Payment</span>
          <span className="sub-value">PayPal / Bank Transfer</span>
        </div>
        <div className="sub-row">
          <span className="sub-label"><i aria-hidden="true">*</i>Activation</span>
          <span className="sub-value">Within 1 hour</span>
        </div>
        <div className="sub-row">
          <span className="sub-label"><i aria-hidden="true">@</i>Contact</span>
          <span className="sub-value">your-email@example.com</span>
        </div>
      </div>

      <div className="sub-actions">
        <button className="btn-primary" onClick={checkSubscription} disabled={loading}>
          <i aria-hidden="true">{loading ? '...' : '?'}</i>
          {loading ? 'Checking...' : 'Check Status'}
        </button>
        <button className="btn-secondary" onClick={logout}>
          <i aria-hidden="true">&lt;</i>
          Sign Out
        </button>
      </div>
    </div>
  );
}
