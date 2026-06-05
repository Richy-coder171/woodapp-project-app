import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ORIGIN } from '../../config';

function toApiBase(value) {
  const clean = String(value || API_ORIGIN).trim().replace(/\/+$/, '');
  return clean.endsWith('/api') ? clean : `${clean}/api`;
}

async function readJson(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function userStatus(user) {
  const sub = user?.subscription || {};
  return {
    active: Boolean(sub.active),
    reason: sub.reason || 'inactive',
    daysLeft: Number.isFinite(Number(sub.daysLeft)) ? Number(sub.daysLeft) : 0,
  };
}

function scanCount(user) {
  return {
    used: Number(user?.scans?.used || 0),
    limit: Number(user?.scans?.limit || 0),
  };
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString();
}

function formatVolume(value) {
  const volume = Number(value);
  return Number.isFinite(volume) ? `${volume.toFixed(3)} ft3` : '-';
}

function downloadCSV(filename, rows) {
  const csv = rows
    .map(row => row.map(cell => {
      const value = String(cell ?? '').replace(/"/g, '""');
      return /[,"\n\r]/.test(value) ? `"${value}"` : value;
    }).join(','))
    .join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [apiInput, setApiInput] = useState(() => localStorage.getItem('woodapp_api_url') || API_ORIGIN);
  const [apiBase, setApiBase] = useState(() => toApiBase(localStorage.getItem('woodapp_api_url') || API_ORIGIN));
  const [adminKey, setAdminKey] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [users, setUsers] = useState([]);
  const [scans, setScans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [paymentFilter, setPaymentFilter] = useState('submitted');
  const [search, setSearch] = useState('');
  const [activateEmail, setActivateEmail] = useState('');
  const [activateDays, setActivateDays] = useState('30');
  const [updatedAt, setUpdatedAt] = useState('');

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter(user => String(user.email || '').toLowerCase().includes(query));
  }, [users, search]);

  const stats = useMemo(() => {
    const active = users.filter(user => userStatus(user).active).length;
    const expired = users.filter(user => userStatus(user).reason === 'expired').length;
    const scansToday = users.reduce((sum, user) => sum + scanCount(user).used, 0);
    const pending = payments.filter(payment => payment.status === 'submitted').length;
    return [
      { label: 'Users', value: users.length, note: 'Registered accounts' },
      { label: 'Active', value: active, note: 'Subscriptions on' },
      { label: 'Expired', value: expired, note: 'Need renewal' },
      { label: 'Scans Today', value: scansToday, note: 'Current daily usage' },
      { label: 'Recent Scans', value: scans.length, note: 'Last 100 records' },
      { label: 'Pending UTR', value: pending, note: 'Needs review' },
    ];
  }, [users, scans, payments]);

  async function loadDashboard(nextBase = apiBase, nextKey = adminKey, nextPaymentFilter = paymentFilter) {
    setLoading(true);
    setNotice('');
    try {
      const loadedUsers = await readJson(`${nextBase}/admin/users?adminKey=${encodeURIComponent(nextKey)}`);
      const [loadedScans, loadedPayments] = await Promise.all([
        readJson(`${nextBase}/admin/scans?adminKey=${encodeURIComponent(nextKey)}`).catch(() => []),
        readJson(`${nextBase}/admin/payments?adminKey=${encodeURIComponent(nextKey)}&status=${encodeURIComponent(nextPaymentFilter)}`).catch(() => []),
      ]);

      setUsers(Array.isArray(loadedUsers) ? loadedUsers : []);
      setScans(Array.isArray(loadedScans) ? loadedScans : []);
      setPayments(Array.isArray(loadedPayments) ? loadedPayments : []);
      setApiBase(nextBase);
      setAdminKey(nextKey);
      setLoggedIn(true);
      setUpdatedAt(new Date().toLocaleTimeString());
      return true;
    } catch (err) {
      setNotice(err.message || 'Unable to load admin dashboard');
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    const nextBase = toApiBase(apiInput);
    const nextKey = keyInput.trim();
    if (!nextKey) {
      setNotice('Enter the admin key from backend/.env.');
      return;
    }
    const ok = await loadDashboard(nextBase, nextKey, paymentFilter);
    if (ok) localStorage.setItem('woodapp_api_url', apiInput.trim());
  }

  async function activateUser(email = activateEmail, days = activateDays) {
    const cleanEmail = String(email || '').trim();
    const cleanDays = Math.max(1, Number.parseInt(days, 10) || 30);
    if (!cleanEmail) {
      setNotice('Enter a user email to activate.');
      return;
    }

    setLoading(true);
    setNotice('');
    try {
      await readJson(`${apiBase}/admin/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminKey, email: cleanEmail, days: cleanDays }),
      });
      setActivateEmail('');
      await loadDashboard(apiBase, adminKey, paymentFilter);
      setNotice(`Activated ${cleanEmail} for ${cleanDays} days.`);
    } catch (err) {
      setNotice(err.message || 'Activation failed');
    } finally {
      setLoading(false);
    }
  }

  async function updatePayment(payment, action) {
    const verb = action === 'approve' ? 'approve' : 'reject';
    const ok = window.confirm(`${verb === 'approve' ? 'Approve' : 'Reject'} payment ${payment.id} for ${payment.email}?`);
    if (!ok) return;

    setLoading(true);
    setNotice('');
    try {
      await readJson(`${apiBase}/admin/payments/${payment.id}/${verb}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(verb === 'approve'
          ? { adminKey, days: 30 }
          : { adminKey, notes: 'Rejected after UTR review' }),
      });
      await loadDashboard(apiBase, adminKey, paymentFilter);
      setNotice(`Payment ${payment.id} ${verb === 'approve' ? 'approved' : 'rejected'}.`);
    } catch (err) {
      setNotice(err.message || 'Payment update failed');
    } finally {
      setLoading(false);
    }
  }

  function exportUsers() {
    downloadCSV('woodapp-users.csv', [
      ['Email', 'Status', 'Days Left', 'Scans Used', 'Scans Limit', 'Joined'],
      ...users.map(user => {
        const status = userStatus(user);
        const counts = scanCount(user);
        return [user.email, status.reason, status.daysLeft, counts.used, counts.limit, formatDate(user.createdAt)];
      }),
    ]);
  }

  if (!loggedIn) {
    return (
      <main style={styles.page}>
        <section style={styles.loginPanel}>
          <div style={styles.brandMark}>W</div>
          <h1 style={styles.loginTitle}>WoodApp Admin</h1>
          <p style={styles.loginCopy}>Use the backend URL and admin key to review users, scans, and UTR payments.</p>
          <form style={styles.loginForm} onSubmit={handleLogin}>
            <label style={styles.fieldLabel}>
              API URL
              <input
                style={styles.input}
                value={apiInput}
                onChange={event => setApiInput(event.target.value)}
                placeholder="http://localhost:3001"
              />
            </label>
            <label style={styles.fieldLabel}>
              Admin Key
              <input
                style={styles.input}
                type="password"
                value={keyInput}
                onChange={event => setKeyInput(event.target.value)}
                placeholder="Enter admin key"
              />
            </label>
            {notice && <div style={styles.errorBox}>{notice}</div>}
            <button style={styles.primaryBtn} disabled={loading}>
              {loading ? 'Checking...' : 'Open Dashboard'}
            </button>
            <button type="button" style={styles.linkBtn} onClick={() => navigate('/')}>
              Back to calculator
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <div>
            <p style={styles.kicker}>WoodApp Admin</p>
            <h1 style={styles.title}>Dashboard</h1>
            <p style={styles.subtitle}>{updatedAt ? `Last updated ${updatedAt}` : apiBase}</p>
          </div>
          <div style={styles.headerActions}>
            <button style={styles.secondaryBtn} onClick={() => navigate('/')}>Calculator</button>
            <button style={styles.secondaryBtn} onClick={() => loadDashboard(apiBase, adminKey, paymentFilter)} disabled={loading}>
              Refresh
            </button>
            <button style={styles.secondaryBtn} onClick={() => setLoggedIn(false)}>Sign out</button>
          </div>
        </header>

        {notice && <div style={notice.includes('Activated') || notice.includes('approved') || notice.includes('rejected') ? styles.okBox : styles.errorBox}>{notice}</div>}

        <section style={styles.statsGrid}>
          {stats.map(item => (
            <article key={item.label} style={styles.statCard}>
              <span style={styles.statLabel}>{item.label}</span>
              <strong style={styles.statValue}>{item.value}</strong>
              <span style={styles.statNote}>{item.note}</span>
            </article>
          ))}
        </section>

        <section style={styles.workGrid}>
          <article style={styles.panel}>
            <div style={styles.panelHeader}>
              <h2 style={styles.panelTitle}>Activate Subscription</h2>
            </div>
            <div style={styles.formRow}>
              <input
                style={styles.input}
                type="email"
                value={activateEmail}
                onChange={event => setActivateEmail(event.target.value)}
                placeholder="user@email.com"
              />
              <input
                style={{ ...styles.input, flex: '0 1 110px' }}
                type="number"
                min="1"
                value={activateDays}
                onChange={event => setActivateDays(event.target.value)}
                placeholder="Days"
              />
              <button style={styles.primaryBtn} onClick={() => activateUser()} disabled={loading}>
                Activate
              </button>
            </div>
          </article>

          <article style={styles.panel}>
            <div style={styles.panelHeader}>
              <h2 style={styles.panelTitle}>UTR Payments</h2>
              <select
                style={styles.select}
                value={paymentFilter}
                onChange={event => {
                  setPaymentFilter(event.target.value);
                  loadDashboard(apiBase, adminKey, event.target.value);
                }}
              >
                <option value="submitted">Submitted</option>
                <option value="created">Created</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="all">All</option>
              </select>
            </div>
            <div style={styles.listStack}>
              {payments.slice(0, 5).map(payment => (
                <div key={payment.id} style={styles.paymentRow}>
                  <div style={styles.rowMain}>
                    <strong style={styles.rowTitle}>{payment.email || '-'}</strong>
                    <span style={styles.rowMeta}>
                      {payment.amountLabel || '-'} | UTR {payment.utr || 'not submitted'} | {String(payment.status || '-').toUpperCase()}
                    </span>
                  </div>
                  <div style={styles.rowActions}>
                    <button
                      style={styles.smallBtn}
                      disabled={loading || !payment.utr || payment.status === 'approved'}
                      onClick={() => updatePayment(payment, 'approve')}
                    >
                      Approve
                    </button>
                    <button
                      style={styles.dangerBtn}
                      disabled={loading || payment.status === 'approved' || payment.status === 'rejected'}
                      onClick={() => updatePayment(payment, 'reject')}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
              {payments.length === 0 && <p style={styles.emptyText}>No payment requests in this filter.</p>}
            </div>
          </article>
        </section>

        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <h2 style={styles.panelTitle}>Users</h2>
            <div style={styles.panelTools}>
              <input
                style={{ ...styles.input, width: 230 }}
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search email"
              />
              <button style={styles.secondaryBtn} onClick={exportUsers}>Export CSV</button>
            </div>
          </div>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <Th>Email</Th>
                  <Th>Status</Th>
                  <Th>Days</Th>
                  <Th>Scans</Th>
                  <Th>Joined</Th>
                  <Th>Action</Th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.slice(0, 50).map(user => {
                  const status = userStatus(user);
                  const counts = scanCount(user);
                  return (
                    <tr key={user.id || user.email}>
                      <Td strong>{user.email}</Td>
                      <Td>
                        <span style={status.active ? styles.goodPill : styles.warnPill}>
                          {status.reason}
                        </span>
                      </Td>
                      <Td>{status.daysLeft}</Td>
                      <Td>{counts.used} / {counts.limit}</Td>
                      <Td>{formatDate(user.createdAt)}</Td>
                      <Td>
                        <button style={styles.smallBtn} onClick={() => activateUser(user.email, 30)} disabled={loading}>
                          +30 days
                        </button>
                      </Td>
                    </tr>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={6} style={styles.emptyCell}>No users found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <h2 style={styles.panelTitle}>Recent Scans</h2>
          </div>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <Th>User</Th>
                  <Th>Date</Th>
                  <Th>Entries</Th>
                  <Th>Total Volume</Th>
                </tr>
              </thead>
              <tbody>
                {scans.slice(0, 25).map(scan => (
                  <tr key={scan.id || `${scan.user_email}-${scan.scanned_at}`}>
                    <Td strong>{scan.user_email}</Td>
                    <Td>{formatDate(scan.scanned_at)}</Td>
                    <Td>{Array.isArray(scan.entries) ? scan.entries.length : 0}</Td>
                    <Td>{formatVolume(scan.total_volume)}</Td>
                  </tr>
                ))}
                {scans.length === 0 && (
                  <tr>
                    <td colSpan={4} style={styles.emptyCell}>No scan history found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function Th({ children }) {
  return <th style={styles.th}>{children}</th>;
}

function Td({ children, strong }) {
  return <td style={strong ? { ...styles.td, ...styles.tdStrong } : styles.td}>{children}</td>;
}

const styles = {
  page: {
    position: 'fixed',
    inset: 0,
    zIndex: 50,
    width: '100vw',
    minWidth: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
    background: '#f4efe5',
    color: '#1c211a',
    fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
  },
  shell: {
    width: 'min(1180px, 100%)',
    minWidth: 0,
    margin: '0 auto',
    padding: 'clamp(14px, 3vw, 26px)',
  },
  loginPanel: {
    width: 'min(420px, calc(100% - 28px))',
    margin: 'min(12vh, 80px) auto',
    padding: '28px clamp(18px, 5vw, 30px)',
    border: '1px solid rgba(28, 33, 26, 0.16)',
    borderRadius: 8,
    background: '#fffaf0',
    boxShadow: '0 20px 60px rgba(28, 33, 26, 0.16)',
  },
  brandMark: {
    width: 42,
    height: 42,
    display: 'grid',
    placeItems: 'center',
    marginBottom: 14,
    border: '2px solid #1c211a',
    background: '#315f48',
    color: '#fffaf0',
    fontWeight: 900,
  },
  loginTitle: { margin: 0, fontSize: 30, lineHeight: 1, letterSpacing: 0 },
  loginCopy: { margin: '10px 0 22px', color: '#5e6758', lineHeight: 1.45 },
  loginForm: { display: 'grid', gap: 13 },
  fieldLabel: { display: 'grid', gap: 6, color: '#394235', fontSize: 13, fontWeight: 800 },
  input: {
    minWidth: 0,
    minHeight: 42,
    flex: '1 1 180px',
    padding: '10px 12px',
    border: '1px solid rgba(49, 95, 72, 0.28)',
    borderRadius: 6,
    background: '#fffdf7',
    color: '#1c211a',
    outline: 'none',
    fontSize: 14,
  },
  select: {
    minHeight: 38,
    padding: '8px 10px',
    border: '1px solid rgba(49, 95, 72, 0.28)',
    borderRadius: 6,
    background: '#fffdf7',
    color: '#1c211a',
    fontSize: 14,
  },
  primaryBtn: {
    minHeight: 42,
    padding: '10px 15px',
    border: 0,
    borderRadius: 6,
    background: '#315f48',
    color: '#fffaf0',
    fontWeight: 800,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  secondaryBtn: {
    minHeight: 38,
    padding: '8px 12px',
    border: '1px solid rgba(49, 95, 72, 0.28)',
    borderRadius: 6,
    background: '#fffaf0',
    color: '#315f48',
    fontWeight: 800,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  linkBtn: {
    border: 0,
    background: 'transparent',
    color: '#315f48',
    fontWeight: 800,
    cursor: 'pointer',
  },
  smallBtn: {
    minHeight: 32,
    padding: '7px 10px',
    border: '1px solid rgba(49, 95, 72, 0.28)',
    borderRadius: 6,
    background: '#e8f0e2',
    color: '#315f48',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  dangerBtn: {
    minHeight: 32,
    padding: '7px 10px',
    border: '1px solid rgba(152, 58, 42, 0.25)',
    borderRadius: 6,
    background: '#f4ddd6',
    color: '#983a2a',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  kicker: { margin: '0 0 4px', color: '#315f48', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' },
  title: { margin: 0, fontSize: 'clamp(28px, 5vw, 44px)', lineHeight: 1, letterSpacing: 0 },
  subtitle: { margin: '8px 0 0', color: '#667160', fontSize: 14 },
  headerActions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))',
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    minWidth: 0,
    padding: 16,
    border: '1px solid rgba(28, 33, 26, 0.14)',
    borderRadius: 8,
    background: '#fffaf0',
  },
  statLabel: { display: 'block', color: '#667160', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' },
  statValue: { display: 'block', marginTop: 7, color: '#1c211a', fontSize: 30, lineHeight: 1 },
  statNote: { display: 'block', marginTop: 5, color: '#315f48', fontSize: 12, fontWeight: 700 },
  workGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
    gap: 14,
    marginBottom: 14,
  },
  panel: {
    minWidth: 0,
    marginBottom: 14,
    padding: 16,
    border: '1px solid rgba(28, 33, 26, 0.14)',
    borderRadius: 8,
    background: '#fffaf0',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  panelTitle: { margin: 0, fontSize: 18, letterSpacing: 0 },
  panelTools: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  formRow: { display: 'flex', alignItems: 'stretch', gap: 8, flexWrap: 'wrap' },
  listStack: { display: 'grid', gap: 8 },
  paymentRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: 10,
    border: '1px solid rgba(28, 33, 26, 0.1)',
    borderRadius: 6,
    background: '#f8f2e7',
  },
  rowMain: { minWidth: 0, display: 'grid', gap: 3 },
  rowTitle: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowMeta: { color: '#667160', fontSize: 12, overflowWrap: 'anywhere' },
  rowActions: { display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' },
  tableWrap: { maxWidth: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 13 },
  th: {
    padding: '10px 9px',
    borderBottom: '1px solid rgba(28, 33, 26, 0.18)',
    color: '#667160',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 900,
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '11px 9px',
    borderTop: '1px solid rgba(28, 33, 26, 0.08)',
    color: '#394235',
    verticalAlign: 'middle',
  },
  tdStrong: { color: '#1c211a', fontWeight: 800 },
  goodPill: {
    display: 'inline-flex',
    padding: '4px 8px',
    borderRadius: 999,
    background: '#dcebdd',
    color: '#315f48',
    fontSize: 12,
    fontWeight: 900,
  },
  warnPill: {
    display: 'inline-flex',
    padding: '4px 8px',
    borderRadius: 999,
    background: '#f0dfbf',
    color: '#7b551e',
    fontSize: 12,
    fontWeight: 900,
  },
  emptyText: { margin: 0, padding: 12, color: '#667160', textAlign: 'center' },
  emptyCell: { padding: 20, color: '#667160', textAlign: 'center' },
  errorBox: {
    padding: '10px 12px',
    border: '1px solid rgba(152, 58, 42, 0.25)',
    borderRadius: 6,
    background: '#f4ddd6',
    color: '#733024',
    fontSize: 13,
    lineHeight: 1.45,
  },
  okBox: {
    padding: '10px 12px',
    border: '1px solid rgba(49, 95, 72, 0.25)',
    borderRadius: 6,
    background: '#dcebdd',
    color: '#315f48',
    fontSize: 13,
    lineHeight: 1.45,
    marginBottom: 14,
  },
};
