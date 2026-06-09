require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const cron = require('node-cron');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-to-32-char-random-string-now';
const ADMIN_KEY = process.env.ADMIN_KEY || 'your-admin-secret-key-here';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GROQ_KEY = process.env.GROQ_API_KEY || '';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'woodapp.db');

const readPositiveInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const readPositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const UPI_ID = String(process.env.UPI_ID || '').trim();
const UPI_PAYEE_NAME = String(process.env.UPI_PAYEE_NAME || 'WoodApp').trim();
const SUBSCRIPTION_DAYS = readPositiveInt(process.env.SUBSCRIPTION_DAYS, 30);
const SUBSCRIPTION_AMOUNT_INR = readPositiveNumber(process.env.SUBSCRIPTION_AMOUNT_INR, 499);
const SUBSCRIPTION_AMOUNT_PAISE = Math.round(SUBSCRIPTION_AMOUNT_INR * 100);

if (!GEMINI_KEY && !GROQ_KEY) {
  console.error('ERROR: At least one AI API key required.');
  console.error('  GEMINI_API_KEY → https://aistudio.google.com/apikey (free)');
  console.error('  GROQ_API_KEY   → https://console.groq.com/keys (free)');
  process.exit(1);
}
if (GEMINI_KEY) console.log('Gemini API configured');
if (GROQ_KEY) console.log('Groq API configured');

const DAILY_SCAN_LIMIT = 200;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    subscription_status TEXT DEFAULT 'inactive',
    current_period_start INTEGER,
    current_period_end INTEGER,
    daily_scan_count INTEGER DEFAULT 0,
    last_scan_date TEXT DEFAULT '',
    created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
  )`);

  db.run(`ALTER TABLE users ADD COLUMN google_sub TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) console.error('Failed to add google_sub column:', err.message);
  });
  db.run(`ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'password'`, (err) => {
    if (err && !err.message.includes('duplicate column')) console.error('Failed to add auth_provider column:', err.message);
  });
  db.run(`ALTER TABLE users ADD COLUMN display_name TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) console.error('Failed to add display_name column:', err.message);
  });
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL`);

  db.run(`CREATE TABLE IF NOT EXISTS scan_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    entries TEXT NOT NULL,
    total_volume REAL NOT NULL,
    image_preview TEXT,
    scanned_at INTEGER DEFAULT (strftime('%s','now') * 1000),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS payment_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    email TEXT NOT NULL,
    amount_paise INTEGER NOT NULL,
    currency TEXT DEFAULT 'INR',
    upi_id TEXT NOT NULL,
    payee_name TEXT NOT NULL,
    reference TEXT UNIQUE NOT NULL,
    utr TEXT,
    status TEXT DEFAULT 'created',
    notes TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
    submitted_at INTEGER,
    verified_at INTEGER,
    verified_by TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_payment_requests_user_status ON payment_requests(user_id, status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON payment_requests(status, created_at)`);
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_requests_utr ON payment_requests(utr) WHERE utr IS NOT NULL`);
});

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const checkSubscription = (user) => {
  const now = Date.now();
  if (user.subscription_status !== 'active') {
    return { active: false, reason: 'inactive', daysLeft: 0 };
  }
  if (!user.current_period_end || now > user.current_period_end) {
    return { active: false, reason: 'expired', daysLeft: 0 };
  }
  return {
    active: true,
    reason: 'active',
    daysLeft: Math.ceil((user.current_period_end - now) / 86400000),
    expiresAt: user.current_period_end
  };
};

const checkDailyLimit = (user) => {
  const today = new Date().toISOString().split('T')[0];
  if (user.last_scan_date !== today) {
    return { allowed: true, remaining: DAILY_SCAN_LIMIT, reset: true };
  }
  const remaining = DAILY_SCAN_LIMIT - (user.daily_scan_count || 0);
  return { allowed: remaining > 0, remaining, reset: false };
};

const formatAmountInr = (paise = SUBSCRIPTION_AMOUNT_PAISE) => (paise / 100).toFixed(2);

const normalizeUtr = (utr) => String(utr || '').trim().replace(/\s+/g, '').toUpperCase();

const isValidUtr = (utr) => /^[A-Z0-9-]{6,40}$/.test(utr);

const paymentConfigReady = () => UPI_ID && /^[\w.-]+@[\w.-]+$/.test(UPI_ID);

const makePaymentReference = (userId) =>
  `WOOD${userId}${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

const buildUpiIntent = (payment) => {
  const params = new URLSearchParams({
    pa: payment.upi_id,
    pn: payment.payee_name,
    am: formatAmountInr(payment.amount_paise),
    cu: payment.currency || 'INR',
    tr: payment.reference,
    tn: payment.reference
  });
  return `upi://pay?${params.toString()}`;
};

const serializePayment = (payment) => ({
  id: payment.id,
  email: payment.email,
  amount: formatAmountInr(payment.amount_paise),
  amountLabel: `INR ${formatAmountInr(payment.amount_paise)}`,
  currency: payment.currency || 'INR',
  upiId: payment.upi_id,
  payeeName: payment.payee_name,
  reference: payment.reference,
  utr: payment.utr,
  status: payment.status,
  notes: payment.notes,
  upiIntent: buildUpiIntent(payment),
  createdAt: payment.created_at ? new Date(payment.created_at).toISOString() : null,
  submittedAt: payment.submitted_at ? new Date(payment.submitted_at).toISOString() : null,
  verifiedAt: payment.verified_at ? new Date(payment.verified_at).toISOString() : null
});

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const sendAuthResponse = (res, user) => {
  const today = new Date().toISOString().split('T')[0];
  const sub = checkSubscription(user);
  const limit = checkDailyLimit(user);
  const used = user.last_scan_date === today ? (user.daily_scan_count || 0) : 0;
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      subscription: sub,
      scans: { used, limit: DAILY_SCAN_LIMIT, remaining: limit.remaining }
    }
  });
};

async function verifyGoogleCredential(credential) {
  if (!GOOGLE_CLIENT_ID) {
    const err = new Error('Google sign-in is not configured. Add GOOGLE_CLIENT_ID to backend .env and restart the server.');
    err.status = 503;
    throw err;
  }

  if (!credential) {
    const err = new Error('Google credential is required');
    err.status = 400;
    throw err;
  }

  const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  const profile = await googleRes.json();

  if (!googleRes.ok) {
    const err = new Error(profile.error_description || profile.error || 'Invalid Google credential');
    err.status = 401;
    throw err;
  }

  if (profile.aud !== GOOGLE_CLIENT_ID) {
    const err = new Error('Google credential was created for a different app');
    err.status = 401;
    throw err;
  }

  if (profile.iss !== 'accounts.google.com' && profile.iss !== 'https://accounts.google.com') {
    const err = new Error('Invalid Google credential issuer');
    err.status = 401;
    throw err;
  }

  if (profile.email_verified !== 'true' && profile.email_verified !== true) {
    const err = new Error('Google email is not verified');
    err.status = 401;
    throw err;
  }

  return {
    sub: profile.sub,
    email: normalizeEmail(profile.email),
    name: profile.name || ''
  };
}

const incrementScanCount = (userId, callback) => {
  const today = new Date().toISOString().split('T')[0];
  db.get(`SELECT daily_scan_count, last_scan_date FROM users WHERE id = ?`, [userId], (err, user) => {
    if (err) return callback(err);

    let newCount;
    if (user.last_scan_date !== today) {
      newCount = 1;
    } else {
      newCount = (user.daily_scan_count || 0) + 1;
    }

    db.run(
      `UPDATE users SET daily_scan_count = ?, last_scan_date = ? WHERE id = ?`,
      [newCount, today, userId],
      callback
    );
  });
};

// ================= AUTH ROUTES =================

app.get('/api/auth/google/config', (req, res) => {
  res.json({
    enabled: Boolean(GOOGLE_CLIENT_ID),
    clientId: GOOGLE_CLIENT_ID
  });
});

app.post('/api/auth/google', async (req, res) => {
  let profile;

  try {
    profile = await verifyGoogleCredential(req.body?.credential);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  db.get(`SELECT * FROM users WHERE google_sub = ? OR LOWER(email) = ?`, [profile.sub, profile.email], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Server error' });

    if (user) {
      if (user.google_sub && user.google_sub !== profile.sub) {
        return res.status(409).json({ error: 'This email is already linked to a different Google account' });
      }

      const provider = user.auth_provider === 'password' ? 'password_google' : (user.auth_provider || 'google');
      db.run(
        `UPDATE users SET google_sub = COALESCE(google_sub, ?), auth_provider = ?, display_name = COALESCE(?, display_name) WHERE id = ?`,
        [profile.sub, provider, profile.name || null, user.id],
        (updateErr) => {
          if (updateErr) return res.status(500).json({ error: 'Failed to link Google account' });
          sendAuthResponse(res, { ...user, google_sub: user.google_sub || profile.sub, auth_provider: provider, display_name: profile.name || user.display_name });
        }
      );
      return;
    }

    try {
      const hash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

      db.run(
        `INSERT INTO users (email, password_hash, google_sub, auth_provider, display_name) VALUES (?, ?, ?, 'google', ?)`,
        [profile.email, hash, profile.sub, profile.name],
        function(insertErr) {
          if (insertErr) return res.status(500).json({ error: 'Google registration failed' });

          sendAuthResponse(res, {
            id: this.lastID,
            email: profile.email,
            subscription_status: 'inactive',
            current_period_start: null,
            current_period_end: null,
            daily_scan_count: 0,
            last_scan_date: '',
            google_sub: profile.sub,
            auth_provider: 'google',
            display_name: profile.name
          });
        }
      );
    } catch {
      res.status(500).json({ error: 'Google registration failed' });
    }
  });
});

app.post('/api/register', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  if (!email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);

    db.run(
      `INSERT INTO users (email, password_hash) VALUES (?, ?)`,
      [email, hash],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Email already registered' });
          }
          return res.status(500).json({ error: 'Registration failed' });
        }

        const token = jwt.sign({ id: this.lastID, email }, JWT_SECRET, { expiresIn: '30d' });
        res.json({
          token,
          user: {
            id: this.lastID,
            email,
            subscription: { active: false, reason: 'inactive', daysLeft: 0 },
            scans: { used: 0, limit: DAILY_SCAN_LIMIT }
          }
        });
      }
    );
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  db.get(`SELECT * FROM users WHERE LOWER(email) = ?`, [email], async (err, user) => {
    if (err || !user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    try {
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(400).json({ error: 'Invalid email or password' });
      }

      const sub = checkSubscription(user);
      const limit = checkDailyLimit(user);
      const token = jwt.sign({ id: user.id, email }, JWT_SECRET, { expiresIn: '30d' });

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          subscription: sub,
          scans: { used: user.daily_scan_count || 0, limit: DAILY_SCAN_LIMIT, remaining: limit.remaining }
        }
      });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });
});

app.get('/api/me', auth, (req, res) => {
  db.get(`SELECT * FROM users WHERE id = ?`, [req.user.id], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const limit = checkDailyLimit(user);
    res.json({
      id: user.id,
      email: user.email,
      subscription: checkSubscription(user),
      scans: {
        used: user.last_scan_date === new Date().toISOString().split('T')[0] ? (user.daily_scan_count || 0) : 0,
        limit: DAILY_SCAN_LIMIT,
        remaining: limit.remaining
      }
    });
  });
});

// ================= UPI PAYMENT REQUESTS =================

app.post('/api/payment/request', auth, (req, res) => {
  if (!paymentConfigReady()) {
    return res.status(503).json({
      error: 'UPI payment is not configured. Add UPI_ID to backend .env and restart the server.'
    });
  }

  db.get(`SELECT * FROM users WHERE id = ?`, [req.user.id], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'User not found' });

    const subscription = checkSubscription(user);
    if (subscription.active) {
      return res.json({ success: true, alreadyActive: true, subscription });
    }

    db.get(
      `SELECT * FROM payment_requests
       WHERE user_id = ? AND status IN ('created', 'submitted')
       ORDER BY created_at DESC LIMIT 1`,
      [user.id],
      (err, existing) => {
        if (err) return res.status(500).json({ error: err.message });
        if (existing) {
          return res.json({
            success: true,
            payment: serializePayment(existing),
            subscriptionDays: SUBSCRIPTION_DAYS
          });
        }

        const reference = makePaymentReference(user.id);
        db.run(
          `INSERT INTO payment_requests
           (user_id, email, amount_paise, currency, upi_id, payee_name, reference, status)
           VALUES (?, ?, ?, 'INR', ?, ?, ?, 'created')`,
          [user.id, user.email, SUBSCRIPTION_AMOUNT_PAISE, UPI_ID, UPI_PAYEE_NAME, reference],
          function(insertErr) {
            if (insertErr) return res.status(500).json({ error: insertErr.message });

            db.get(`SELECT * FROM payment_requests WHERE id = ?`, [this.lastID], (getErr, payment) => {
              if (getErr || !payment) return res.status(500).json({ error: 'Failed to load payment request' });
              res.json({
                success: true,
                payment: serializePayment(payment),
                subscriptionDays: SUBSCRIPTION_DAYS
              });
            });
          }
        );
      }
    );
  });
});

app.post('/api/payment/submit-utr', auth, (req, res) => {
  const paymentId = Number(req.body.paymentId);
  const utr = normalizeUtr(req.body.utr);

  if (!paymentId) return res.status(400).json({ error: 'Payment request id is required' });
  if (!isValidUtr(utr)) return res.status(400).json({ error: 'Enter a valid UTR/reference number' });

  db.get(
    `SELECT * FROM payment_requests WHERE id = ? AND user_id = ?`,
    [paymentId, req.user.id],
    (err, payment) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!payment) return res.status(404).json({ error: 'Payment request not found' });
      if (payment.status === 'approved') return res.status(409).json({ error: 'This payment is already approved' });
      if (payment.status === 'rejected') return res.status(409).json({ error: 'This payment was rejected. Create a new payment request.' });

      const now = Date.now();
      db.run(
        `UPDATE payment_requests
         SET utr = ?, status = 'submitted', submitted_at = ?, notes = NULL
         WHERE id = ? AND user_id = ?`,
        [utr, now, paymentId, req.user.id],
        function(updateErr) {
          if (updateErr) {
            if (updateErr.message && updateErr.message.includes('UNIQUE')) {
              return res.status(409).json({ error: 'This UTR has already been submitted' });
            }
            return res.status(500).json({ error: updateErr.message });
          }

          db.get(`SELECT * FROM payment_requests WHERE id = ?`, [paymentId], (getErr, updated) => {
            if (getErr || !updated) return res.status(500).json({ error: 'Failed to load payment status' });
            res.json({ success: true, payment: serializePayment(updated) });
          });
        }
      );
    }
  );
});

app.get('/api/payment/status', auth, (req, res) => {
  db.get(
    `SELECT * FROM payment_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
    [req.user.id],
    (err, payment) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, payment: payment ? serializePayment(payment) : null });
    }
  );
});

// ================= AI SCAN ROUTE (Google Gemini — FREE) =================

const PROMPT = `You are a wood log volume calculator assistant.
The image shows handwritten measurement lines like "4 x 12" or "7 x 36".
First number = radius in plain inches (e.g. 4 = 4 inches).
Second number = height in ft.in format:
- "12" means 1 foot 2 inches = 14 inches total
- "36" means 3 feet 6 inches = 42 inches total
Extract EVERY line exactly as written. Do NOT convert — return raw numbers only.
Respond ONLY as raw JSON, no markdown, no extra text:
{"entries":[{"a_raw":"4","b_raw":"12"},{"a_raw":"7","b_raw":"36"}]}`;

const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash-latest',
];

app.post('/api/scan', auth, async (req, res) => {
  const { imageBase64 } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'Image required' });
  }

  console.log(`[SCAN] User ${req.user.id} scanning, image length: ${imageBase64.length}`);

  db.get(`SELECT * FROM users WHERE id = ?`, [req.user.id], async (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const sub = checkSubscription(user);
    if (!sub.active) {
      return res.status(403).json({ error: 'Subscription expired or inactive', code: 'SUB_EXPIRED' });
    }

    const limit = checkDailyLimit(user);
    if (!limit.allowed) {
      return res.status(429).json({
        error: 'Daily scan limit reached (200/day)',
        code: 'RATE_LIMIT',
        retryAfter: 'tomorrow'
      });
    }

    let lastErr = '';

    for (const model of GEMINI_MODELS) {
      try {
        console.log(`[SCAN] Trying Gemini model: ${model}`);

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

        const geminiRes = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                {
                  inline_data: {
                    mime_type: 'image/jpeg',
                    data: imageBase64
                  }
                },
                { text: PROMPT }
              ]
            }],
            generationConfig: {
              maxOutputTokens: 800,
              temperature: 0.1
            }
          })
        });

        const data = await geminiRes.json();
        console.log(`[SCAN] Gemini ${model} response status: ${geminiRes.status}`);

        // Rate limited — wait and retry once
        if (geminiRes.status === 429) {
          console.log(`[SCAN] Gemini ${model} rate limited, waiting 5s and retrying...`);
          await new Promise(r => setTimeout(r, 5000));
          const retryRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [
                { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
                { text: PROMPT }
              ]}],
              generationConfig: { maxOutputTokens: 800, temperature: 0.1 }
            })
          });
          const retryData = await retryRes.json();
          console.log(`[SCAN] Gemini ${model} retry status: ${retryRes.status}`);
          if (!retryData.error && retryData.candidates) {
            Object.assign(data, retryData);
          } else {
            lastErr = `${model}: rate limited (retry also failed)`;
            console.log(`[SCAN] Gemini ${model} retry also failed`);
            continue;
          }
        }

        if (data.error) {
          lastErr = `${model}: ${data.error.message || JSON.stringify(data.error)}`;
          console.log(`[SCAN] Gemini ${model} error: ${lastErr}`);
          continue;
        }

        let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        console.log(`[SCAN] Gemini ${model} raw response:`, text.substring(0, 200));

        text = text.replace(/```json|```/g, '').trim();

        const match = text.match(/\{[\s\S]*\}/);
        if (!match) {
          lastErr = `${model}: no JSON in response`;
          console.log(`[SCAN] Gemini ${model}: no JSON found`);
          continue;
        }

        try {
          const parsed = JSON.parse(match[0]);
          console.log(`[SCAN] Gemini ${model} parsed entries:`, parsed.entries?.length || 0);

          incrementScanCount(user.id, (err) => {
            if (err) console.error('[SCAN] Failed to increment scan count:', err);
          });

          res.json({
            success: true,
            model: `gemini:${model}`,
            entries: parsed.entries || [],
            scansRemaining: limit.remaining - 1
          });
          return;

        } catch (parseErr) {
          lastErr = `${model}: JSON parse error: ${parseErr.message}`;
          console.log(`[SCAN] Gemini ${model} parse error:`, parseErr.message);
        }

      } catch (ex) {
        lastErr = `${model}: ${ex.message}`;
        console.log(`[SCAN] Gemini ${model} exception:`, ex.message);
      }
    }

    // ── Fallback: Try Groq API (free, 30 RPM) ──
    if (GROQ_KEY) {
      const GROQ_MODELS = [
        'meta-llama/llama-4-scout-17b-16e-instruct',
        'meta-llama/llama-4-maverick-17b-128e-instruct',
      ];

      for (const model of GROQ_MODELS) {
        try {
          console.log(`[SCAN] Trying Groq model: ${model}`);

          const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${GROQ_KEY}`
            },
            body: JSON.stringify({
              model: model,
              max_tokens: 800,
              temperature: 0.1,
              messages: [{
                role: 'user',
                content: [
                  { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
                  { type: 'text', text: PROMPT }
                ]
              }]
            })
          });

          const data = await groqRes.json();
          console.log(`[SCAN] Groq ${model} response status: ${groqRes.status}`);

          if (data.error) {
            lastErr = `groq:${model}: ${data.error.message || JSON.stringify(data.error)}`;
            console.log(`[SCAN] Groq ${model} error: ${lastErr}`);
            continue;
          }

          let text = data.choices?.[0]?.message?.content || '';
          console.log(`[SCAN] Groq ${model} raw response:`, text.substring(0, 200));

          text = text.replace(/```json|```/g, '').trim();
          const match = text.match(/\{[\s\S]*\}/);
          if (!match) {
            lastErr = `groq:${model}: no JSON in response`;
            console.log(`[SCAN] Groq ${model}: no JSON found`);
            continue;
          }

          try {
            const parsed = JSON.parse(match[0]);
            console.log(`[SCAN] Groq ${model} parsed entries:`, parsed.entries?.length || 0);

            incrementScanCount(user.id, (err) => {
              if (err) console.error('[SCAN] Failed to increment scan count:', err);
            });

            res.json({
              success: true,
              model: `groq:${model}`,
              entries: parsed.entries || [],
              scansRemaining: limit.remaining - 1
            });
            return;
          } catch (parseErr) {
            lastErr = `groq:${model}: JSON parse error: ${parseErr.message}`;
            console.log(`[SCAN] Groq ${model} parse error:`, parseErr.message);
          }

        } catch (ex) {
          lastErr = `groq:${model}: ${ex.message}`;
          console.log(`[SCAN] Groq ${model} exception:`, ex.message);
        }
      }
    }

    console.log(`[SCAN] All AI models failed. Last error: ${lastErr}`);
    res.status(502).json({ error: 'All AI models failed', details: lastErr });
  });
});

// ================= TEST ENDPOINT =================
app.post('/api/test-scan', async (req, res) => {
  const { imageBase64 } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'Image required' });

  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
            { text: PROMPT }
          ]
        }],
        generationConfig: { maxOutputTokens: 800, temperature: 0.1 }
      })
    });
    const data = await geminiRes.json();
    res.json({ status: geminiRes.status, geminiResponse: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= ADMIN ROUTES =================

app.get('/api/admin/scans', (req, res) => {
  const { adminKey } = req.query;
  if (adminKey !== ADMIN_KEY) return res.status(403).json({ error: 'Invalid admin key' });

  db.all(
    `SELECT sh.*, u.email as user_email
     FROM scan_history sh
     JOIN users u ON sh.user_id = u.id
     ORDER BY sh.scanned_at DESC
     LIMIT 100`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows.map(r => ({
        id: r.id,
        user_id: r.user_id,
        user_email: r.user_email,
        entries: JSON.parse(r.entries),
        total_volume: r.total_volume,
        image_preview: r.image_preview,
        scanned_at: r.scanned_at
      })));
    }
  );
});

app.get('/api/admin/payments', (req, res) => {
  const { adminKey, status = 'submitted' } = req.query;
  if (adminKey !== ADMIN_KEY) return res.status(403).json({ error: 'Invalid admin key' });

  const allowed = new Set(['created', 'submitted', 'approved', 'rejected', 'all']);
  const requestedStatus = allowed.has(status) ? status : 'submitted';
  const sql = requestedStatus === 'all'
    ? `SELECT * FROM payment_requests ORDER BY created_at DESC LIMIT 100`
    : `SELECT * FROM payment_requests WHERE status = ? ORDER BY created_at DESC LIMIT 100`;
  const params = requestedStatus === 'all' ? [] : [requestedStatus];

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(serializePayment));
  });
});

app.post('/api/admin/payments/:id/approve', (req, res) => {
  const { adminKey } = req.body;
  const days = Math.max(1, parseInt(req.body.days || SUBSCRIPTION_DAYS, 10));
  const paymentId = Number(req.params.id);

  if (adminKey !== ADMIN_KEY) return res.status(403).json({ error: 'Invalid admin key' });
  if (!paymentId) return res.status(400).json({ error: 'Payment id is required' });

  db.get(`SELECT * FROM payment_requests WHERE id = ?`, [paymentId], (err, payment) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!payment) return res.status(404).json({ error: 'Payment request not found' });
    if (payment.status === 'approved') return res.json({ success: true, alreadyApproved: true, payment: serializePayment(payment) });
    if (!payment.utr) return res.status(400).json({ error: 'UTR must be submitted before approval' });

    const now = Date.now();
    const periodEnd = now + (days * 86400000);

    db.run(
      `UPDATE users
       SET subscription_status = 'active', current_period_start = ?, current_period_end = ?
       WHERE id = ?`,
      [now, periodEnd, payment.user_id],
      function(userErr) {
        if (userErr) return res.status(500).json({ error: userErr.message });
        if (this.changes === 0) return res.status(404).json({ error: 'User not found' });

        db.run(
          `UPDATE payment_requests
           SET status = 'approved', verified_at = ?, verified_by = 'admin', notes = NULL
           WHERE id = ?`,
          [now, paymentId],
          function(paymentErr) {
            if (paymentErr) return res.status(500).json({ error: paymentErr.message });
            res.json({
              success: true,
              email: payment.email,
              daysAdded: days,
              activeUntil: new Date(periodEnd).toISOString()
            });
          }
        );
      }
    );
  });
});

app.post('/api/admin/payments/:id/reject', (req, res) => {
  const { adminKey } = req.body;
  const paymentId = Number(req.params.id);
  const notes = String(req.body.notes || 'Rejected by admin').slice(0, 300);

  if (adminKey !== ADMIN_KEY) return res.status(403).json({ error: 'Invalid admin key' });
  if (!paymentId) return res.status(400).json({ error: 'Payment id is required' });

  const now = Date.now();
  db.run(
    `UPDATE payment_requests
     SET status = 'rejected', notes = ?, verified_at = ?, verified_by = 'admin'
     WHERE id = ? AND status != 'approved'`,
    [notes, now, paymentId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Payment request not found or already approved' });
      res.json({ success: true, paymentId, notes });
    }
  );
});

app.post('/api/save-scan', auth, (req, res) => {
  const { entries, totalVolume, imagePreview } = req.body;
  if (!entries || !Array.isArray(entries)) return res.status(400).json({ error: 'Entries required' });

  db.run(
    `INSERT INTO scan_history (user_id, entries, total_volume, image_preview) VALUES (?, ?, ?, ?)`,
    [req.user.id, JSON.stringify(entries), totalVolume || 0, imagePreview || null],
    function(err) {
      if (err) return res.status(500).json({ error: 'Failed to save scan' });
      res.json({ success: true, scanId: this.lastID });
    }
  );
});

app.get('/api/history', auth, (req, res) => {
  db.all(
    `SELECT * FROM scan_history WHERE user_id = ? ORDER BY scanned_at DESC LIMIT 50`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Failed to fetch history' });
      res.json(rows.map(r => ({
        id: r.id,
        entries: JSON.parse(r.entries),
        total_volume: r.total_volume,
        image_preview: r.image_preview,
        scanned_at: r.scanned_at
      })));
    }
  );
});

app.post('/api/admin/extend', (req, res) => {
  const { adminKey, email, days } = req.body;
  if (adminKey !== ADMIN_KEY) return res.status(403).json({ error: 'Invalid admin key' });
  if (!email || !days || days < 1) return res.status(400).json({ error: 'Email and positive days required' });

  const now = Date.now();
  const periodEnd = now + (days * 86400000);

  db.run(
    `UPDATE users SET subscription_status = 'active', current_period_start = ?, current_period_end = ? WHERE email = ?`,
    [now, periodEnd, email],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'User not found' });
      res.json({ success: true, email, daysAdded: days, activeUntil: new Date(periodEnd).toISOString() });
    }
  );
});

app.get('/api/admin/users', (req, res) => {
  const { adminKey } = req.query;
  if (adminKey !== ADMIN_KEY) return res.status(403).json({ error: 'Invalid admin key' });

  db.all(`SELECT id, email, subscription_status, current_period_end, daily_scan_count, last_scan_date, created_at FROM users ORDER BY created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => {
      const limit = checkDailyLimit(r);
      return {
        id: r.id,
        email: r.email,
        subscription: checkSubscription(r),
        scans: {
          used: r.last_scan_date === new Date().toISOString().split('T')[0] ? (r.daily_scan_count || 0) : 0,
          limit: DAILY_SCAN_LIMIT,
          remaining: limit.remaining
        },
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : null
      };
    }));
  });
});

// ================= CRON JOBS =================

cron.schedule('0 0 * * *', () => {
  const now = Date.now();
  db.run(
    `UPDATE users SET subscription_status = 'expired' WHERE subscription_status = 'active' AND current_period_end < ?`,
    [now],
    function(err) {
      if (!err) console.log(`[${new Date().toISOString()}] ${this.changes} subscriptions expired`);
    }
  );
});

cron.schedule('0 0 * * *', () => {
  const today = new Date().toISOString().split('T')[0];
  db.run(
    `UPDATE users SET daily_scan_count = 0, last_scan_date = ? WHERE last_scan_date != ?`,
    [today, today],
    function(err) {
      if (!err) console.log(`[${new Date().toISOString()}] Reset daily scan counts for ${this.changes} users`);
    }
  );
});

// ================= HEALTH =================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now(), uptime: process.uptime() });
});

app.get('/', (req, res) => {
  res.json({
    message: 'WoodApp API', version: '1.0.0',
    endpoints: ['POST /api/register','POST /api/login','GET /api/auth/google/config','POST /api/auth/google','GET /api/me','POST /api/payment/request','POST /api/payment/submit-utr','GET /api/payment/status','POST /api/scan','POST /api/save-scan','GET /api/history','POST /api/admin/extend','GET /api/admin/users','GET /api/admin/payments','POST /api/admin/payments/:id/approve','POST /api/admin/payments/:id/reject','GET /api/health']
  });
});

// ✅ FIXED: Added '0.0.0.0' so phone on same WiFi can connect
app.listen(PORT, '0.0.0.0', () => {
  console.log(`╔════════════════════════════════════════╗`);
  console.log(`║     WoodApp Backend Running            ║`);
  console.log(`║     Port: ${PORT}                        ║`);
  console.log(`║     Daily Limit: ${DAILY_SCAN_LIMIT} scans/user       ║`);
  console.log(`╠════════════════════════════════════════╣`);
  console.log(`║  Admin: POST /api/admin/extend         ║`);
  console.log(`║  Admin: GET  /api/admin/users          ║`);
  console.log(`║  Test:  POST /api/test-scan            ║`);
  console.log(`╚════════════════════════════════════════╝`);
});
