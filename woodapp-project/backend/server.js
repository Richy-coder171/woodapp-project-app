require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const cron = require('node-cron');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-to-32-char-random-string-now';
const ADMIN_KEY = process.env.ADMIN_KEY || 'your-admin-secret-key-here';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GROQ_KEY = process.env.GROQ_API_KEY || '';

if (!GEMINI_KEY && !GROQ_KEY) {
  console.error('ERROR: At least one AI API key required.');
  console.error('  GEMINI_API_KEY → https://aistudio.google.com/apikey (free)');
  console.error('  GROQ_API_KEY   → https://console.groq.com/keys (free)');
  process.exit(1);
}
if (GEMINI_KEY) console.log('Gemini API Key loaded:', GEMINI_KEY.substring(0, 10) + '...');
if (GROQ_KEY) console.log('Groq API Key loaded:', GROQ_KEY.substring(0, 10) + '...');

const DAILY_SCAN_LIMIT = 200;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));

const db = new sqlite3.Database('./woodapp.db');

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

  db.run(`CREATE TABLE IF NOT EXISTS scan_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    entries TEXT NOT NULL,
    total_volume REAL NOT NULL,
    image_preview TEXT,
    scanned_at INTEGER DEFAULT (strftime('%s','now') * 1000),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);
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

app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;

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
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
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
    endpoints: ['POST /api/register','POST /api/login','GET /api/me','POST /api/scan','POST /api/save-scan','GET /api/history','POST /api/admin/extend','GET /api/admin/users','GET /api/health']
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
