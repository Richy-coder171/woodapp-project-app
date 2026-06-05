import { useState, useEffect, useRef, useCallback } from 'react';
import { Chart, registerables } from 'chart.js';
import { API_ORIGIN } from '../../config';
Chart.register(...registerables);

/* ── XSS guard ── */
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── CSV export ── */
function downloadCSV(filename, rows) {
  const csv = rows.map(r =>
    r.map(cell => {
      const s = String(cell ?? '').replace(/"/g, '""');
      return /[,"\n\r]/.test(s) ? `"${s}"` : s;
    }).join(',')
  ).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Helpers ── */
function shortLabel(iso) { const [,m,d] = iso.split('-'); return `${m}/${d}`; }
function getLast14Days() {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i));
    return d.toISOString().slice(0, 10);
  });
}
function getLast30Days() {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (29 - i));
    return d.toISOString().slice(0, 10);
  });
}

/* ═══════════════════════════════════════
   LOGIN
═══════════════════════════════════════ */
function Login({ onLogin }) {
  const [url, setUrl]   = useState(() => localStorage.getItem('woodapp_api_url') || API_ORIGIN);
  const [key, setKey]   = useState('');
  const [err, setErr]   = useState('');

  async function login() {
    if (!url || !key) { setErr('Please fill all fields'); return; }
    let base = url.replace(/\/$/, '');
    if (!base.includes('/api')) base += '/api';
    try {
      const res = await fetch(`${base}/admin/users?adminKey=${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error('Invalid admin key');
      localStorage.setItem('woodapp_api_url', url);
      onLogin(base, key);
    } catch (e) { setErr(e.message); }
  }

  return (
    <div style={styles.loginBox}>
      <h2 style={{ color: '#c084fc', textAlign: 'center', marginBottom: 20 }}>🔐 Admin Dashboard</h2>
      <input style={styles.input} type="text"     placeholder="API URL (e.g. http://localhost:3001)" value={url} onChange={e => setUrl(e.target.value)} />
      <input style={styles.input} type="password" placeholder="Admin Key"                             value={key} onChange={e => setKey(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()} />
      <button style={styles.loginBtn} onClick={login}>Login</button>
      {err && <p style={{ color: '#ff7070', fontSize: 13, textAlign: 'center', marginTop: 10 }}>{err}</p>}
    </div>
  );
}

/* ═══════════════════════════════════════
   CHARTS
═══════════════════════════════════════ */
function useChart(canvasRef, config) {
  const chartRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current.getContext('2d'), config);
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, [JSON.stringify(config)]);
}

const CHART_OPTS = {
  responsive: true,
  plugins: { legend: { labels: { color: '#a855f7', font: { size: 11 } } } },
  scales: {
    x: { ticks: { color: '#5b3a7a', font: { size: 10 } }, grid: { color: '#1e0f35' } },
    y: { ticks: { color: '#5b3a7a', font: { size: 10 }, precision: 0 }, grid: { color: '#1e0f35' }, beginAtZero: true },
  },
};

/* ═══════════════════════════════════════
   MAIN DASHBOARD
═══════════════════════════════════════ */
export default function AdminDashboard() {
  const [loggedIn, setLoggedIn]     = useState(false);
  const [apiBase, setApiBase]       = useState('');
  const [adminKey, setAdminKey]     = useState('');

  const [allUsers, setAllUsers]     = useState([]);
  const [allScans, setAllScans]     = useState([]);
  const [payments, setPayments]     = useState([]);
  const [auditLog, setAuditLog]     = useState([]);
  const [toast, setToast]           = useState({ msg: '', err: false, show: false });

  // Users table state
  const [sortCol, setSortCol]       = useState('id');
  const [sortDir, setSortDir]       = useState('asc');
  const [page, setPage]             = useState(0);
  const [search, setSearch]         = useState('');
  const [selected, setSelected]     = useState(new Set());
  const PAGE_SIZE = 20;

  // Modals
  const [modal, setModal]           = useState(null);  // { title, body, onConfirm }
  const [userModal, setUserModal]   = useState(null);  // user object

  // Forms
  const [actEmail, setActEmail]     = useState('');
  const [actDays, setActDays]       = useState('30');
  const [limitEmail, setLimitEmail] = useState('');
  const [limitVal, setLimitVal]     = useState('10');
  const [revenuePrice, setRevenuePrice] = useState('9.99');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('submitted');

  // Scan filter
  const [scanFrom, setScanFrom]     = useState('');
  const [scanTo, setScanTo]         = useState('');
  const [lastUserUpdate, setLastUserUpdate]   = useState('Never updated');
  const [lastScanUpdate, setLastScanUpdate]   = useState('Never updated');
  const [lastPaymentUpdate, setLastPaymentUpdate] = useState('Never updated');

  // Charts
  const scanChartRef    = useRef(null);
  const subsChartRef    = useRef(null);
  const revChartRef     = useRef(null);
  const userChartRef    = useRef(null);
  const scanChartInst   = useRef(null);
  const subsChartInst   = useRef(null);
  const revChartInst    = useRef(null);
  const userChartInst   = useRef(null);

  /* ── Toast ── */
  function showToast(msg, isError = false) {
    setToast({ msg, err: isError, show: true });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3000);
  }
  function addAudit(msg) {
    setAuditLog(prev => [{ time: new Date().toLocaleTimeString(), msg }, ...prev]);
  }

  /* ── Load ── */
  const loadUsers = useCallback(async () => {
    try {
      const res  = await fetch(`${apiBase}/admin/users?adminKey=${encodeURIComponent(adminKey)}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      setAllUsers(data);
      setLastUserUpdate('Last updated: ' + new Date().toLocaleTimeString());
    } catch (e) { showToast('Failed to load users: ' + e.message, true); }
  }, [apiBase, adminKey]);

  const loadScans = useCallback(async () => {
    try {
      const res  = await fetch(`${apiBase}/admin/scans?adminKey=${encodeURIComponent(adminKey)}`);
      if (!res.ok) throw new Error('Failed to load scans');
      const data = await res.json();
      setAllScans(data);
      setLastScanUpdate('Last updated: ' + new Date().toLocaleTimeString());
    } catch (e) { showToast('Failed to load scans: ' + e.message, true); }
  }, [apiBase, adminKey]);

  const loadPayments = useCallback(async (status = paymentStatusFilter) => {
    try {
      const res = await fetch(`${apiBase}/admin/payments?adminKey=${encodeURIComponent(adminKey)}&status=${encodeURIComponent(status)}`);
      if (!res.ok) throw new Error('Failed to load payments');
      const data = await res.json();
      setPayments(data);
      setLastPaymentUpdate('Last updated: ' + new Date().toLocaleTimeString());
    } catch (e) { showToast('Failed to load payments: ' + e.message, true); }
  }, [apiBase, adminKey, paymentStatusFilter]);

  useEffect(() => {
    if (!loggedIn) return;
    loadUsers();
    loadScans();
    loadPayments();
    const t = setInterval(() => { loadUsers(); loadScans(); loadPayments(); }, 30000);
    return () => clearInterval(t);
  }, [loggedIn, loadUsers, loadScans, loadPayments]);

  /* ── Charts ── */
  useEffect(() => {
    if (!loggedIn || !scanChartRef.current) return;
    const days   = getLast14Days();
    const counts = days.map(d => allScans.filter(s => s.scanned_at?.slice(0,10) === d).length);
    if (scanChartInst.current) scanChartInst.current.destroy();
    scanChartInst.current = new Chart(scanChartRef.current.getContext('2d'), {
      type: 'line',
      data: { labels: days.map(shortLabel), datasets: [{ label: 'Scans', data: counts, borderColor: '#a855f7', backgroundColor: 'rgba(168,85,247,0.15)', borderWidth: 2, pointBackgroundColor: '#c084fc', pointRadius: 4, tension: 0.35, fill: true }] },
      options: CHART_OPTS,
    });
  }, [allScans, loggedIn]);

  useEffect(() => {
    if (!loggedIn || !subsChartRef.current) return;
    const days = getLast14Days();
    const ac   = days.map(d => allUsers.filter(u => u.createdAt?.slice(0,10) === d && u.subscription.active).length);
    const ec   = days.map(d => allUsers.filter(u => u.createdAt?.slice(0,10) === d && u.subscription.reason === 'expired').length);
    if (subsChartInst.current) subsChartInst.current.destroy();
    subsChartInst.current = new Chart(subsChartRef.current.getContext('2d'), {
      type: 'bar',
      data: { labels: days.map(shortLabel), datasets: [
        { label: 'Active',  data: ac, backgroundColor: 'rgba(106,191,80,0.75)', borderRadius: 4 },
        { label: 'Expired', data: ec, backgroundColor: 'rgba(255,112,112,0.65)', borderRadius: 4 },
      ]},
      options: { ...CHART_OPTS, scales: { ...CHART_OPTS.scales, x: { ...CHART_OPTS.scales.x, stacked: true }, y: { ...CHART_OPTS.scales.y, stacked: true } } },
    });
  }, [allUsers, loggedIn]);

  useEffect(() => {
    if (!loggedIn || !revChartRef.current) return;
    const price = parseFloat(revenuePrice) || 0;
    const days  = getLast30Days();
    const revs  = days.map(d => {
      const n = allUsers.filter(u => u.createdAt && u.createdAt.slice(0,10) <= d && u.subscription.active).length;
      return parseFloat((n * price).toFixed(2));
    });
    if (revChartInst.current) revChartInst.current.destroy();
    revChartInst.current = new Chart(revChartRef.current.getContext('2d'), {
      type: 'line',
      data: { labels: days.map(shortLabel), datasets: [{ label: 'Est. Revenue ($)', data: revs, borderColor: '#a78bfa', backgroundColor: 'rgba(167,139,250,0.12)', borderWidth: 2, pointBackgroundColor: '#c084fc', pointRadius: 3, tension: 0.3, fill: true }] },
      options: { ...CHART_OPTS, scales: { ...CHART_OPTS.scales, y: { ...CHART_OPTS.scales.y, ticks: { ...CHART_OPTS.scales.y.ticks, callback: v => '$' + v } } } },
    });
  }, [allUsers, revenuePrice, loggedIn]);

  useEffect(() => {
    if (!userModal || !userChartRef.current) return;
    const userScans = allScans.filter(s => s.user_email === userModal.email);
    if (!userScans.length) return;
    const byDate = {};
    userScans.forEach(s => { const d = s.scanned_at?.slice(0,10) || 'unknown'; byDate[d] = (byDate[d]||0)+1; });
    const labels = Object.keys(byDate).sort();
    if (userChartInst.current) userChartInst.current.destroy();
    userChartInst.current = new Chart(userChartRef.current.getContext('2d'), {
      type: 'bar',
      data: { labels: labels.map(shortLabel), datasets: [{ label: 'Scans', data: labels.map(l => byDate[l]), backgroundColor: 'rgba(168,85,247,0.65)', borderRadius: 4 }] },
      options: { ...CHART_OPTS, plugins: { legend: { display: false } } },
    });
  }, [userModal]);

  /* ── Stats ── */
  const active       = allUsers.filter(u => u.subscription.active);
  const expiringSoon = allUsers.filter(u => u.subscription.active && u.subscription.daysLeft > 0 && u.subscription.daysLeft <= 7);
  const expired      = allUsers.filter(u => u.subscription.reason === 'expired');
  const revenue      = (parseFloat(revenuePrice) || 0) * active.length;
  const pendingPayments = payments.filter(p => p.status === 'submitted');

  /* ── Users table ── */
  const filteredUsers = (() => {
    const q = search.trim().toLowerCase();
    let list = q ? allUsers.filter(u => u.email.toLowerCase().includes(q) || u.subscription.reason.toLowerCase().includes(q)) : [...allUsers];
    list.sort((a, b) => {
      let av, bv;
      switch (sortCol) {
        case 'id':        av = a.id;                    bv = b.id;                    break;
        case 'email':     av = a.email.toLowerCase();   bv = b.email.toLowerCase();   break;
        case 'status':    av = a.subscription.reason;   bv = b.subscription.reason;   break;
        case 'daysLeft':  av = a.subscription.daysLeft; bv = b.subscription.daysLeft; break;
        case 'scansUsed': av = a.scans.used;             bv = b.scans.used;             break;
        case 'createdAt': av = new Date(a.createdAt);   bv = new Date(b.createdAt);   break;
        default:          av = a.id;                    bv = b.id;
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });
    return list;
  })();

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const saferPage  = Math.min(page, totalPages - 1);
  const pageSlice  = filteredUsers.slice(saferPage * PAGE_SIZE, (saferPage + 1) * PAGE_SIZE);

  function sortBy(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
    setPage(0);
  }

  /* ── Leaderboard ── */
  const leaderboard = (() => {
    const counts = {};
    allScans.forEach(s => { counts[s.user_email] = (counts[s.user_email]||0)+1; });
    return Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0, 10);
  })();
  const lbMax = leaderboard[0]?.[1] || 1;

  /* ── Actions ── */
  async function activateUser() {
    const email = actEmail.trim(); const days = parseInt(actDays) || 30;
    if (!email) { showToast('Please enter an email', true); return; }
    try {
      const res  = await fetch(`${apiBase}/admin/extend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminKey, email, days }) });
      const data = await res.json();
      if (data.success) { showToast(`Activated ${email} for ${days} days`); addAudit(`Activated ${email} for ${days} days`); setActEmail(''); loadUsers(); }
      else showToast(data.error || 'Failed to activate', true);
    } catch (e) { showToast('Error: ' + e.message, true); }
  }

  async function setScanLimit() {
    const email = limitEmail.trim(); const limit = parseInt(limitVal);
    if (!email || !limit) { showToast('Fill in email and limit', true); return; }
    try {
      const res  = await fetch(`${apiBase}/admin/set-limit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminKey, email, limit }) });
      const data = await res.json();
      if (data.success) { showToast(`Scan limit for ${email} set to ${limit}`); addAudit(`Set scan limit for ${email} to ${limit}`); setLimitEmail(''); loadUsers(); }
      else showToast(data.error || 'Backend endpoint not yet available', true);
    } catch (e) { showToast('Endpoint not available: ' + e.message, true); }
  }

  async function approvePayment(paymentId, email) {
    try {
      const res = await fetch(`${apiBase}/admin/payments/${paymentId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminKey, days: 30 }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Approved payment for ${email}`);
        addAudit(`Approved UTR payment for ${email}`);
        setModal(null);
        loadPayments();
        loadUsers();
      } else {
        showToast(data.error || 'Failed to approve payment', true);
      }
    } catch (e) { showToast('Error: ' + e.message, true); }
  }

  async function rejectPayment(paymentId, email) {
    try {
      const res = await fetch(`${apiBase}/admin/payments/${paymentId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminKey, notes: 'Rejected after UTR review' }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Rejected payment for ${email}`);
        addAudit(`Rejected UTR payment for ${email}`);
        setModal(null);
        loadPayments();
      } else {
        showToast(data.error || 'Failed to reject payment', true);
      }
    } catch (e) { showToast('Error: ' + e.message, true); }
  }

  async function bulkExtend() {
    const emails = [...selected]; let success = 0, failed = 0;
    for (const email of emails) {
      try {
        const res  = await fetch(`${apiBase}/admin/extend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminKey, email, days: 30 }) });
        const data = await res.json();
        data.success ? success++ : failed++;
      } catch { failed++; }
    }
    addAudit(`Bulk extend (30 days) — ${success} succeeded, ${failed} failed`);
    showToast(`Extended ${success} user(s)${failed ? `, ${failed} failed` : ''}`);
    setSelected(new Set());
    loadUsers();
  }

  /* ── Filtered scans ── */
  const filteredScans = allScans.filter(s => {
    const d = s.scanned_at?.slice(0,10) || '';
    if (scanFrom && d < scanFrom) return false;
    if (scanTo   && d > scanTo)   return false;
    return true;
  });

  /* ── Login handler ── */
  function handleLogin(base, key) {
    setApiBase(base); setAdminKey(key); setLoggedIn(true);
    showToast('Welcome to Admin Dashboard');
  }

  if (!loggedIn) return (
    <div style={{ background: '#0d0a14', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,-apple-system,sans-serif', color: '#e8d8f5' }}>
      <Login onLogin={handleLogin} />
    </div>
  );

  return (
    <div style={{ background: '#0d0a14', minHeight: '100vh', color: '#e8d8f5', fontFamily: 'system-ui,-apple-system,sans-serif' }}>
      <div style={styles.container}>

        {/* Header */}
        <div style={styles.header}>
          <div>
            <h1 style={{ color: '#c084fc', fontSize: 24 }}>🪵 WoodApp Admin Dashboard</h1>
            <p style={{ color: '#5b3a7a', fontSize: 14, marginTop: 5 }}>Manage users, subscriptions, and monitor app usage</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={styles.btnExport} onClick={() => { if (!allUsers.length) { showToast('No users loaded yet', true); return; } downloadCSV('woodapp-users.csv', [['ID','Email','Status','Days Left','Scans Used','Scans Limit','Created'], ...allUsers.map(u => [u.id,u.email,u.subscription.reason,u.subscription.daysLeft,u.scans.used,u.scans.limit,new Date(u.createdAt).toLocaleDateString()])]); showToast('Users CSV downloaded'); addAudit('Exported users CSV'); }}>⬇ Users CSV</button>
            <button style={styles.btnExport} onClick={() => { if (!allScans.length) { showToast('No scans loaded yet', true); return; } downloadCSV('woodapp-scans.csv', [['User Email','Scanned At','Entries','Total Volume (ft³)','Measurements'], ...allScans.map(s => [s.user_email,new Date(s.scanned_at).toLocaleString(),s.entries.length,s.total_volume.toFixed(3),s.entries.map(e=>`${e.a_raw}x${e.b_raw}`).join(' | ')])]); showToast('Scans CSV downloaded'); addAudit('Exported scans CSV'); }}>⬇ Scans CSV</button>
          </div>
        </div>

        {/* Expiry banner */}
        {expiringSoon.length > 0 && (
          <div style={{ background: '#1e1005', border: '1px solid #c47a1a', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#e8a742', fontSize: 13 }}>
            ⚠️ <strong style={{ color: '#f5c842' }}>{expiringSoon.length} subscription{expiringSoon.length > 1 ? 's' : ''} expiring within 7 days:</strong>{' '}
            {expiringSoon.slice(0,5).map(u => u.email).join(', ')}{expiringSoon.length > 5 ? ` +${expiringSoon.length-5} more` : ''}
          </div>
        )}

        {/* Stats */}
        <div style={styles.statsGrid}>
          {[
            { label: 'Total Users',    value: allUsers.length, sub: 'Registered accounts', color: '#c084fc' },
            { label: 'Active Subs',    value: active.length,   sub: 'Paying customers',    color: '#c084fc' },
            { label: 'Expiring Soon',  value: expiringSoon.length, sub: 'Within 7 days',  color: '#f5a623' },
            { label: 'Expired',        value: expired.length,  sub: 'Need renewal',        color: '#c084fc' },
            { label: 'Pending UTR',    value: pendingPayments.length, sub: 'Needs review', color: '#f5a623' },
            { label: 'Total Scans',    value: allScans.length, sub: 'All time',            color: '#c084fc' },
          ].map(s => (
            <div key={s.label} style={styles.statCard}>
              <div style={{ color: '#5b3a7a', fontSize: 12, textTransform: 'uppercase', marginBottom: 8, letterSpacing: '.04em' }}>{s.label}</div>
              <div style={{ color: s.color, fontSize: 30, fontWeight: 800 }}>{s.value}</div>
              <div style={{ color: '#6abf50', fontSize: 12, marginTop: 5 }}>{s.sub}</div>
            </div>
          ))}
          <div style={styles.statCard}>
            <div style={{ color: '#5b3a7a', fontSize: 12, textTransform: 'uppercase', marginBottom: 8, letterSpacing: '.04em' }}>Est. Revenue / mo</div>
            <div style={{ color: '#a78bfa', fontSize: 24, fontWeight: 800 }}>${revenue.toFixed(2)}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <span style={{ color: '#5b3a7a', fontSize: 11 }}>$/user</span>
              <input style={{ ...styles.input, width: 70, padding: '4px 6px', fontSize: 12 }} type="number" value={revenuePrice} min="0" step="0.01" onChange={e => setRevenuePrice(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Charts row 1 */}
        <div style={styles.chartsGrid}>
          <div style={styles.chartCard}>
            <h2 style={{ color: '#c084fc', fontSize: 15, marginBottom: 15 }}>📈 Scan Trend (last 14 days)</h2>
            <canvas ref={scanChartRef} style={{ maxHeight: 200 }} />
          </div>
          <div style={styles.chartCard}>
            <h2 style={{ color: '#c084fc', fontSize: 15, marginBottom: 15 }}>📊 Subscriptions by Join Date</h2>
            <canvas ref={subsChartRef} style={{ maxHeight: 200 }} />
          </div>
        </div>

        {/* Revenue chart */}
        <div style={styles.chartCard}>
          <h2 style={{ color: '#c084fc', fontSize: 15, marginBottom: 15 }}>💰 Monthly Revenue Trend (last 30 days)</h2>
          <canvas ref={revChartRef} style={{ maxHeight: 200 }} />
        </div>

        {/* Quick Activate + Scan Limit */}
        <div style={styles.tableWrap}>
          <div style={{ color: '#c084fc', fontSize: 18, marginBottom: 12 }}>⚡ Quick Activate</div>
          <div style={styles.formInline}>
            <input style={styles.formInput} type="email" placeholder="User email" value={actEmail} onChange={e => setActEmail(e.target.value)} />
            <input style={styles.formInput} type="number" placeholder="Days (default 30)" value={actDays} onChange={e => setActDays(e.target.value)} />
            <button style={styles.formBtn} onClick={activateUser}>Activate Subscription</button>
          </div>
          <div style={{ color: '#c084fc', fontSize: 15, margin: '8px 0 4px' }}>🎛 Scan Limit Override</div>
          <p style={{ color: '#5b3a7a', fontSize: 11, marginBottom: 8 }}>Requires a /api/admin/set-limit endpoint in your backend.</p>
          <div style={styles.formInline}>
            <input style={styles.formInput} type="email" placeholder="User email" value={limitEmail} onChange={e => setLimitEmail(e.target.value)} />
            <input style={styles.formInput} type="number" placeholder="New daily scan limit" value={limitVal} min="1" onChange={e => setLimitVal(e.target.value)} />
            <button style={styles.formBtn} onClick={setScanLimit}>Set Limit</button>
          </div>
        </div>

        {/* UPI payment verification */}
        <div style={styles.tableWrap}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <h2 style={{ color: '#c084fc', fontSize: 18 }}>UPI UTR Verification</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ color: '#3d2060', fontSize: 12 }}>{lastPaymentUpdate}</span>
              <select
                style={{ ...styles.formInput, flex: '0 0 150px', minWidth: 150, padding: '7px 10px', fontSize: 12 }}
                value={paymentStatusFilter}
                onChange={e => { setPaymentStatusFilter(e.target.value); loadPayments(e.target.value); }}
              >
                <option value="submitted">Submitted</option>
                <option value="created">Created</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="all">All</option>
              </select>
              <button style={styles.btnSm} onClick={() => loadPayments()}>Refresh</button>
            </div>
          </div>

          <p style={{ color: '#5b3a7a', fontSize: 12, marginBottom: 10 }}>
            Verify the amount and UTR in your bank/UPI account before approving. Approval activates the user's subscription.
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#12092a' }}>
                  {['ID','User','Amount','Reference','UTR','Status','Submitted','Actions'].map(h => <Th key={h} noSort>{h}</Th>)}
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: '#5b3a7a', padding: 16 }}>No payment requests found</td></tr>
                ) : payments.map(p => (
                  <tr key={p.id}>
                    <Td>{p.id}</Td>
                    <Td>{p.email}</Td>
                    <Td>{p.amountLabel}</Td>
                    <Td style={{ fontFamily: 'monospace', color: '#a855f7', maxWidth: 160, overflowWrap: 'anywhere' }}>{p.reference}</Td>
                    <Td style={{ fontFamily: 'monospace', color: '#e8d8f5', maxWidth: 150, overflowWrap: 'anywhere' }}>{p.utr || '-'}</Td>
                    <Td style={{ color: p.status === 'submitted' ? '#f5a623' : p.status === 'approved' ? '#6abf50' : p.status === 'rejected' ? '#ff7070' : '#5b3a7a', fontWeight: 700 }}>
                      {String(p.status || '').toUpperCase()}
                    </Td>
                    <Td>{p.submittedAt ? new Date(p.submittedAt).toLocaleString() : '-'}</Td>
                    <Td>
                      <button
                        style={styles.actionBtn}
                        disabled={p.status === 'approved' || !p.utr}
                        onClick={() => setModal({
                          title: 'Approve UTR Payment',
                          body: `Activate ${p.email} for 30 days? Verify UTR ${p.utr} and amount ${p.amountLabel} in your bank first.`,
                          onConfirm: () => approvePayment(p.id, p.email)
                        })}
                      >
                        Approve
                      </button>
                      <button
                        style={{ ...styles.actionBtn, color: '#ff7070' }}
                        disabled={p.status === 'approved' || p.status === 'rejected'}
                        onClick={() => setModal({
                          title: 'Reject UTR Payment',
                          body: `Reject payment request ${p.id} from ${p.email}?`,
                          onConfirm: () => rejectPayment(p.id, p.email)
                        })}
                      >
                        Reject
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Users table */}
        <div style={styles.tableWrap}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <h2 style={{ color: '#c084fc', fontSize: 18 }}>👥 All Users</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ color: '#3d2060', fontSize: 12 }}>{lastUserUpdate}</span>
              <button style={styles.btnSm} onClick={loadUsers}>🔄 Refresh</button>
            </div>
          </div>

          <input style={{ ...styles.formInput, width: '100%', marginBottom: 10 }} type="text" placeholder="🔍 Search by email or status…" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />

          {/* Bulk bar */}
          {selected.size > 0 && (
            <div style={{ background: '#1a0e2e', border: '1px solid #4a2575', borderRadius: 8, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ color: '#a855f7', fontSize: 13, fontWeight: 600 }}>{selected.size} selected</span>
              <button style={styles.formBtn} onClick={bulkExtend}>Extend 30 days</button>
              <button style={{ ...styles.formBtn, background: '#7a1010' }} onClick={() => { setModal({ title: 'Bulk Delete', body: `Delete ${selected.size} user(s)? This cannot be undone.`, onConfirm: () => { addAudit('Bulk delete: endpoint needed in backend'); showToast('Bulk delete: endpoint needed in backend'); setSelected(new Set()); setModal(null); } }); }}>Delete Selected</button>
              <button style={{ ...styles.formBtn, background: '#2a1a4e', border: '1px solid #3b1f5e' }} onClick={() => setSelected(new Set())}>Clear</button>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#12092a' }}>
                  <Th noSort><input type="checkbox" style={{ accentColor: '#7c3aed' }} onChange={e => { const emails = pageSlice.map(u => u.email); if (e.target.checked) setSelected(prev => new Set([...prev, ...emails])); else setSelected(prev => { const next = new Set(prev); emails.forEach(em => next.delete(em)); return next; }); }} /></Th>
                  {[['id','ID'],['email','Email'],['status','Status'],['daysLeft','Days Left'],['scansUsed','Scans Today'],['createdAt','Created']].map(([col, label]) => (
                    <Th key={col} onClick={() => sortBy(col)} sort={sortCol===col ? sortDir : null}>{label}</Th>
                  ))}
                  <Th noSort>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {pageSlice.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: '#5b3a7a', padding: 20 }}>No users found</td></tr>
                ) : pageSlice.map(u => {
                  const expiring = u.subscription.active && u.subscription.daysLeft > 0 && u.subscription.daysLeft <= 7;
                  return (
                    <tr key={u.id} style={{ background: expiring ? '#1a1005' : undefined }}>
                      <Td><input type="checkbox" checked={selected.has(u.email)} style={{ accentColor: '#7c3aed' }} onChange={e => { setSelected(prev => { const next = new Set(prev); e.target.checked ? next.add(u.email) : next.delete(u.email); return next; }); }} /></Td>
                      <Td>{u.id}</Td>
                      <Td>{u.email}</Td>
                      <Td style={{ color: u.subscription.active ? '#6abf50' : u.subscription.reason==='expired' ? '#ff7070' : '#5b3a7a', fontWeight: 600 }}>{u.subscription.reason.toUpperCase()}</Td>
                      <Td style={expiring ? { color: '#f5a623', fontWeight: 700 } : {}}>{u.subscription.daysLeft}</Td>
                      <Td>{u.scans.used} / {u.scans.limit}</Td>
                      <Td>{new Date(u.createdAt).toLocaleDateString()}</Td>
                      <Td>
                        <button style={styles.actionBtn} onClick={() => setUserModal(u)}>View</button>
                        <button style={styles.actionBtn} onClick={() => { setActEmail(u.email); setActDays('30'); window.scrollTo({top:0,behavior:'smooth'}); addAudit(`Opened extend form for ${u.email}`); }}>Extend</button>
                        <button style={{ ...styles.actionBtn, color: '#ff7070' }} onClick={() => { setModal({ title: 'Delete User', body: `Delete ${u.email}? Cannot be undone.`, onConfirm: () => { addAudit(`Delete attempted: ${u.email} (endpoint needed in backend)`); showToast(`Delete user ${u.email} - endpoint needed in backend`); setModal(null); } }); }}>Delete</button>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, fontSize: 13, color: '#5b3a7a' }}>
            <button style={styles.btnSm} onClick={() => setPage(p => Math.max(0, p-1))} disabled={saferPage === 0}>← Prev</button>
            <span>Page {saferPage+1} of {totalPages}</span>
            <button style={styles.btnSm} onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={saferPage >= totalPages-1}>Next →</button>
          </div>
        </div>

        {/* Leaderboard */}
        <div style={styles.tableWrap}>
          <h2 style={{ color: '#c084fc', fontSize: 18, marginBottom: 12 }}>🏆 Top Users by Scans</h2>
          {leaderboard.length === 0 ? (
            <p style={{ color: '#3d2060', fontSize: 12, textAlign: 'center', padding: 10 }}>No data yet</p>
          ) : leaderboard.map(([email, count], i) => (
            <div key={email} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i > 0 ? '1px solid #1e0f35' : undefined, fontSize: 13 }}>
              <span style={{ color: '#5b3a7a', fontSize: 11, width: 22, textAlign: 'right', flexShrink: 0 }}>{i+1}.</span>
              <span style={{ color: '#e8d8f5', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</span>
              <div style={{ flex: 1, background: '#1e0f35', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                <div style={{ background: '#7c3aed', height: 6, borderRadius: 4, width: `${Math.round(count/lbMax*100)}%`, transition: 'width .4s' }} />
              </div>
              <span style={{ color: '#c084fc', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{count}</span>
            </div>
          ))}
        </div>

        {/* Recent scans */}
        <div style={styles.tableWrap}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <h2 style={{ color: '#c084fc', fontSize: 18 }}>📋 Recent Scans</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ color: '#3d2060', fontSize: 12 }}>{lastScanUpdate}</span>
              <button style={styles.btnSm} onClick={loadScans}>🔄 Refresh</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ color: '#5b3a7a', fontSize: 12 }}>From</span>
            <input type="date" style={{ ...styles.formInput, padding: '7px 10px', fontSize: 12 }} value={scanFrom} onChange={e => setScanFrom(e.target.value)} />
            <span style={{ color: '#5b3a7a', fontSize: 12 }}>To</span>
            <input type="date" style={{ ...styles.formInput, padding: '7px 10px', fontSize: 12 }} value={scanTo} onChange={e => setScanTo(e.target.value)} />
            <button style={styles.btnSm} onClick={() => { setScanFrom(''); setScanTo(''); }}>Clear</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: '#12092a' }}>
                {['User','Date','Entries','Total Volume','Measurements'].map(h => <Th key={h} noSort>{h}</Th>)}
              </tr></thead>
              <tbody>
                {filteredScans.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: '#5b3a7a', padding: 12 }}>No scans found</td></tr>
                ) : filteredScans.map((s, i) => (
                  <tr key={i}>
                    <Td>{s.user_email}</Td>
                    <Td>{new Date(s.scanned_at).toLocaleString()}</Td>
                    <Td>{s.entries.length}</Td>
                    <Td>{s.total_volume.toFixed(3)} ft³</Td>
                    <Td style={{ color: '#5b3a7a', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.entries.map(e => `${e.a_raw}×${e.b_raw}`).join(', ')}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Audit log */}
        <div style={styles.tableWrap}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ color: '#c084fc', fontSize: 18 }}>📝 Session Audit Log</h2>
            <button style={styles.btnSm} onClick={() => setAuditLog([])}>Clear</button>
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: 12 }}>
            {auditLog.length === 0 ? (
              <p style={{ color: '#3d2060', textAlign: 'center', padding: 10 }}>No actions yet this session</p>
            ) : auditLog.map((e, i) => (
              <div key={i} style={{ padding: '6px 0', borderTop: i > 0 ? '1px solid #1e0f35' : undefined, display: 'flex', gap: 10 }}>
                <span style={{ color: '#3d2060', whiteSpace: 'nowrap', flexShrink: 0 }}>{e.time}</span>
                <span style={{ color: '#c8b0e8' }}>{e.msg}</span>
              </div>
            ))}
          </div>
        </div>

      </div>{/* /container */}

      {/* Confirm Modal */}
      {modal && (
        <div style={styles.modalOverlay} onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div style={styles.modalContent}>
            <h3 style={{ color: '#c084fc', marginBottom: 15 }}>{modal.title}</h3>
            <p style={{ color: '#a855f7', lineHeight: 1.8, marginBottom: 15 }}>{modal.body}</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button style={{ ...styles.formBtn, background: '#1a0e2e', color: '#a855f7', border: '1px solid #3b1f5e' }} onClick={() => setModal(null)}>Cancel</button>
              <button style={styles.formBtn} onClick={modal.onConfirm}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* User Detail Modal */}
      {userModal && (
        <div style={styles.modalOverlay} onClick={e => { if (e.target === e.currentTarget) { setUserModal(null); } }}>
          <div style={{ ...styles.modalContent, maxWidth: 740, maxHeight: '88vh', overflowY: 'auto', position: 'relative' }}>
            <button style={{ position: 'absolute', top: 18, right: 18, background: 'none', border: 'none', color: '#a855f7', fontSize: 20, cursor: 'pointer' }} onClick={() => setUserModal(null)}>✕</button>
            <h3 style={{ color: '#c084fc', fontSize: 18, marginBottom: 5, paddingRight: 32 }}>{userModal.email}</h3>
            <p style={{ color: '#5b3a7a', fontSize: 12, marginBottom: 16 }}>ID: {userModal.id} · Joined: {new Date(userModal.createdAt).toLocaleDateString()}</p>

            <div style={{ marginBottom: 18 }}>
              <h4 style={{ color: '#a855f7', fontSize: 11, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>Account Info</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '5px 10px', fontSize: 13 }}>
                <span style={{ color: '#5b3a7a' }}>Status</span>   <span style={{ color: userModal.subscription.active ? '#6abf50' : '#ff7070', fontWeight: 600 }}>{userModal.subscription.reason.toUpperCase()}</span>
                <span style={{ color: '#5b3a7a' }}>Days Left</span> <span style={{ color: '#e8d8f5' }}>{userModal.subscription.daysLeft}</span>
                <span style={{ color: '#5b3a7a' }}>Scans Today</span> <span style={{ color: '#e8d8f5' }}>{userModal.scans.used} / {userModal.scans.limit}</span>
                <span style={{ color: '#5b3a7a' }}>Sub Active</span> <span style={{ color: '#e8d8f5' }}>{userModal.subscription.active ? '✅ Yes' : '❌ No'}</span>
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <h4 style={{ color: '#a855f7', fontSize: 11, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>Scan Volume Over Time</h4>
              <div style={{ background: '#100820', borderRadius: 8, padding: 14 }}>
                <canvas ref={userChartRef} style={{ maxHeight: 160 }} />
              </div>
            </div>

            <div>
              <h4 style={{ color: '#a855f7', fontSize: 11, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>Scan History</h4>
              {allScans.filter(s => s.user_email === userModal.email).length === 0 ? (
                <p style={{ color: '#3d2060', textAlign: 'center', padding: 16 }}>No scans recorded yet.</p>
              ) : allScans.filter(s => s.user_email === userModal.email).map((s, i) => (
                <div key={i} style={{ background: '#100820', borderRadius: 8, padding: '10px 12px', marginBottom: 8, fontSize: 12 }}>
                  <div style={{ color: '#c084fc', fontWeight: 600, marginBottom: 4 }}>{new Date(s.scanned_at).toLocaleString()}</div>
                  <div style={{ color: '#7a5a9a', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <span>Entries: {s.entries.length}</span>
                    <span>Volume: {s.total_volume.toFixed(3)} ft³</span>
                  </div>
                  <div style={{ color: '#5b3a7a', marginTop: 4, fontSize: 11, wordBreak: 'break-all' }}>
                    {s.entries.map(e => `${e.a_raw}×${e.b_raw}`).join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      <div style={{ position: 'fixed', bottom: 20, right: 20, background: toast.err ? '#3a0a0a' : '#1a0e3a', color: toast.err ? '#ff7070' : '#6abf50', padding: '14px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600, transform: toast.show ? 'translateY(0)' : 'translateY(100px)', transition: 'transform .3s', zIndex: 1200 }}>
        {toast.msg}
      </div>
    </div>
  );
}

/* ── Small table components ── */
function Th({ children, noSort, sort, onClick, style }) {
  return (
    <th onClick={noSort ? undefined : onClick} style={{ padding: '11px 10px', color: '#a855f7', textAlign: 'left', fontWeight: 600, cursor: noSort ? 'default' : 'pointer', userSelect: 'none', whiteSpace: 'nowrap', borderBottom: '1px solid #1e0f35', ...style }}>
      {children}{sort === 'asc' ? ' ▲' : sort === 'desc' ? ' ▼' : ''}
    </th>
  );
}
function Td({ children, style }) {
  return <td style={{ padding: 10, borderTop: '1px solid #1e0f35', verticalAlign: 'middle', ...style }}>{children}</td>;
}

/* ── Inline styles ── */
const styles = {
  container: { maxWidth: 1200, margin: '0 auto', padding: 20 },
  header:    { background: '#160d24', border: 'none', borderBottom: '2px solid #7c3aed', padding: 20, marginBottom: 20, borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 15, marginBottom: 20 },
  statCard:  { background: '#160d24', borderRadius: 12, padding: 20, border: '1px solid #3b1f5e' },
  chartsGrid:{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15, marginBottom: 20 },
  chartCard: { background: '#160d24', borderRadius: 12, padding: 20, border: '1px solid #3b1f5e', marginBottom: 20 },
  tableWrap: { background: '#160d24', borderRadius: 12, padding: 20, marginBottom: 20, border: '1px solid #3b1f5e' },
  input:     { background: '#0e0819', border: '1.5px solid #4a2575', borderRadius: 10, padding: 14, color: '#e8d8f5', fontSize: 15, marginBottom: 12, outline: 'none', width: '100%' },
  loginBox:  { maxWidth: 400, width: '90%', background: '#160d24', borderRadius: 12, padding: 30, border: '1px solid #3b1f5e' },
  loginBtn:  { width: '100%', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 12, padding: 15, fontSize: 16, fontWeight: 700, cursor: 'pointer' },
  formInline:{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  formInput: { flex: 1, minWidth: 150, background: '#0e0819', border: '1.5px solid #4a2575', borderRadius: 8, padding: 10, color: '#e8d8f5', fontSize: 13, outline: 'none' },
  formBtn:   { background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnSm:     { background: '#1a0e2e', color: '#a855f7', border: '1px solid #3b1f5e', borderRadius: 8, padding: '7px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' },
  btnExport: { background: '#1a0e2e', color: '#6abf50', border: '1px solid #2a4020', borderRadius: 8, padding: '7px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' },
  actionBtn: { background: 'none', border: 'none', color: '#a855f7', cursor: 'pointer', fontSize: 12, textDecoration: 'underline', padding: '2px 3px', marginRight: 2 },
  modalOverlay: { display: 'flex', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1001, alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalContent:  { background: '#160d24', borderRadius: 12, padding: 25, maxWidth: 500, width: '100%', border: '2px solid #7c3aed' },
};
