import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../../../config';
import { createQrDataUrl } from '../../../utils/qr';

async function readApiJson(res) {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return res.json();

  const text = await res.text();
  const preview = text.trim().slice(0, 80);
  throw new Error(
    `Backend returned ${res.status || 'non-JSON'} instead of JSON. Restart the backend and check ${API_BASE}.` +
    (preview ? ` Response starts: ${preview}` : '')
  );
}

export default function SubScreen({ subStatus, validateSession, authToken, logout }) {
  const [loading, setLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [payment, setPayment] = useState(null);
  const [subscriptionDays, setSubscriptionDays] = useState(30);
  const [utr, setUtr] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const qrSrc = useMemo(() => {
    if (!payment?.upiIntent) return '';
    try {
      return createQrDataUrl(payment.upiIntent);
    } catch (err) {
      return '';
    }
  }, [payment?.upiIntent]);

  useEffect(() => {
    if (authToken) createPaymentRequest();
  }, [authToken]);

  async function checkSubscription() {
    setLoading(true);
    await refreshPaymentStatus();
    await validateSession(authToken);
    setLoading(false);
  }

  async function createPaymentRequest() {
    setPaymentLoading(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch(`${API_BASE}/payment/request`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await readApiJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed to create UPI request');

      if (data.alreadyActive) {
        validateSession(authToken);
        return;
      }

      setPayment(data.payment);
      setSubscriptionDays(data.subscriptionDays || 30);
      if (data.payment?.utr) setUtr(data.payment.utr);
    } catch (err) {
      setError(err.message);
    } finally {
      setPaymentLoading(false);
    }
  }

  async function refreshPaymentStatus() {
    try {
      const res = await fetch(`${API_BASE}/payment/status`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await readApiJson(res);
      if (res.ok && data.payment) setPayment(data.payment);
    } catch {
      // Session validation already handles offline state.
    }
  }

  async function submitUtr() {
    if (!payment?.id) return;

    setPaymentLoading(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch(`${API_BASE}/payment/submit-utr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ paymentId: payment.id, utr }),
      });
      const data = await readApiJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed to submit UTR');

      setPayment(data.payment);
      setUtr(data.payment.utr || '');
      setMessage('UTR submitted. Admin verification is pending.');
    } catch (err) {
      setError(err.message);
    } finally {
      setPaymentLoading(false);
    }
  }

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(`${label} copied`);
    } catch {
      setMessage(`${label}: ${text}`);
    }
  }

  const paymentStatusText = payment?.status === 'submitted'
    ? 'UTR submitted'
    : payment?.status === 'approved'
      ? 'Approved'
      : payment?.status === 'rejected'
        ? 'Rejected'
        : 'Awaiting payment';

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
          <span className="sub-value">{payment?.amountLabel || 'INR 499.00'} / {subscriptionDays} days</span>
        </div>
        <div className="sub-row">
          <span className="sub-label"><i aria-hidden="true">#</i>Daily Scans</span>
          <span className="sub-value">200 per day</span>
        </div>
        <div className="sub-row">
          <span className="sub-label"><i aria-hidden="true">%</i>Payment</span>
          <span className="sub-value">UPI QR + UTR</span>
        </div>
        <div className="sub-row">
          <span className="sub-label"><i aria-hidden="true">*</i>Activation</span>
          <span className="sub-value">After UTR verified</span>
        </div>
        <div className="sub-row">
          <span className="sub-label"><i aria-hidden="true">?</i>Request</span>
          <span className="sub-value">{paymentLoading && !payment ? 'Loading...' : paymentStatusText}</span>
        </div>
      </div>

      <div className="upi-card">
        {payment ? (
          <>
            <div className="upi-qr-wrap">
              {qrSrc ? (
                <img className="upi-qr" src={qrSrc} alt="UPI payment QR" />
              ) : (
                <div className="upi-qr-fallback">QR unavailable</div>
              )}
              <div className="upi-meta">
                <strong>{payment.amountLabel}</strong>
                <span>{payment.payeeName}</span>
                <button type="button" onClick={() => copyText(payment.upiId, 'UPI ID')}>
                  {payment.upiId}
                </button>
              </div>
            </div>

            <div className="upi-reference">
              <span>Reference</span>
              <button type="button" onClick={() => copyText(payment.reference, 'Reference')}>
                {payment.reference}
              </button>
            </div>

            <a className="btn-secondary upi-pay-link" href={payment.upiIntent}>
              <i aria-hidden="true">&gt;</i>
              Pay in UPI App
            </a>

            <div className="utr-form">
              <label htmlFor="utr">UTR / transaction reference</label>
              <div>
                <input
                  id="utr"
                  value={utr}
                  onChange={e => setUtr(e.target.value)}
                  placeholder="Enter UTR after payment"
                  autoComplete="off"
                />
                <button className="btn-primary" onClick={submitUtr} disabled={paymentLoading}>
                  <i aria-hidden="true">{paymentLoading ? '...' : '+'}</i>
                  {paymentLoading ? 'Submitting...' : 'Submit UTR'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <button className="btn-primary" onClick={createPaymentRequest} disabled={paymentLoading}>
            <i aria-hidden="true">{paymentLoading ? '...' : '+'}</i>
            {paymentLoading ? 'Loading UPI...' : 'Generate UPI QR'}
          </button>
        )}

        {message && <p className="sub-note ok">{message}</p>}
        {error && <p className="sub-note err">{error}</p>}
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
