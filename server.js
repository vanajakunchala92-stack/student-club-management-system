const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');
const helmet = require('helmet');
const session = require('express-session');
const path = require('path');

dotenv.config();
const app = express();
// The existing dashboard uses inline scripts/styles, so CSP is disabled for compatibility.
// Other Helmet security headers remain enabled.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(session({
  name: 'scem.sid',
  secret: process.env.SESSION_SECRET || 'CHANGE_THIS_TO_A_LONG_RANDOM_SECRET_BEFORE_DEPLOYING',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000
  }
}));

let pool;
const titleRole = role => role === 'admin' ? 'Admin' : role === 'coordinator' ? 'Coordinator' : 'Student';

function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ success: false, message: 'Please log in first.' });
  next();
}

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ success: true, message: 'Backend and MySQL are working!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database connection failed.' });
  }
});

app.post('/api/register', async (req, res) => {
  try {
    const { name, username, email, phone, password } = req.body || {};
    if (![name, username, email, phone, password].every(v => typeof v === 'string')) {
      return res.status(400).json({ success: false, message: 'Please fill in all required fields.' });
    }
    const cleanName = name.trim();
    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();
    const digits = cleanPhone.replace(/\D/g, '');
    if (!cleanName || cleanName.length > 100 || !/^[A-Za-z0-9_.-]{3,30}$/.test(cleanUsername) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 150 ||
        (digits.length !== 10 && !(digits.length === 12 && digits.startsWith('91'))) ||
        password.length < 8 || password.length > 72) {
      return res.status(400).json({ success: false, message: 'Check your details. Username must be 3–30 characters and password at least 8 characters.' });
    }
    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)',
      [cleanUsername, cleanEmail]
    );
    if (existing.length) return res.status(409).json({ success: false, message: 'Username or email already exists.' });
    const hash = await bcrypt.hash(password, 12);
    await pool.execute(
      "INSERT INTO users (name, username, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, 'student')",
      [cleanName, cleanUsername, cleanEmail, cleanPhone, hash]
    );
    return res.status(201).json({ success: true, message: 'Registration successful! Please log in.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Username or email already exists.' });
    console.error('Registration error:', err.message);
    return res.status(500).json({ success: false, message: 'Registration failed. Please try again.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password, role } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || !['Student', 'Admin', 'Coordinator'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Enter username, password, and select a role.' });
    }
    const [rows] = await pool.execute(
      'SELECT id, name, username, email, phone, role, password_hash FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1',
      [username.trim()]
    );
    const user = rows[0];
    if (!user || titleRole(user.role) !== role || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ success: false, message: 'Invalid username, password, or role. Please check your details.' });
    }
    req.session.user = {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      phone: user.phone || '',
      role: titleRole(user.role)
    };
    return res.json({ success: true, message: 'Login successful.', user: req.session.user });
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
});

app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false, message: 'Not logged in.' });
  res.json({ success: true, user: req.session.user });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ success: false, message: 'Could not log out.' });
    res.clearCookie('scem.sid');
    res.json({ success: true, message: 'Logged out.' });
  });
});

app.post('/api/change-password', requireLogin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 72) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
    }
    const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id = ?', [req.session.user.id]);
    if (!rows[0] || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.session.user.id]);
    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    console.error('Change password error:', err.message);
    res.status(500).json({ success: false, message: 'Could not update password.' });
  }
});


function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ success: false, message: 'Please log in first.' });
  if (req.session.user.role !== 'Admin') return res.status(403).json({ success: false, message: 'Only Admin can manage shared clubs, events, and stalls.' });
  next();
}

// Shared state endpoint. Clubs include their events, preserving the current dashboard structure.
app.get('/api/state', requireLogin, async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT state_key, state_json FROM app_state WHERE state_key IN ('clubs','stalls')");
    const state = {};
    for (const row of rows) state[row.state_key] = typeof row.state_json === 'string' ? JSON.parse(row.state_json) : row.state_json;
    res.json({ success: true, state });
  } catch (err) {
    console.error('Load shared state error:', err.message);
    res.status(500).json({ success: false, message: 'Could not load shared clubs/events/stalls.' });
  }
});

app.put('/api/state', requireAdmin, async (req, res) => {
  try {
    const { key, value } = req.body || {};
    if (!['clubs', 'stalls'].includes(key) || value === undefined || value === null || typeof value !== 'object') {
      return res.status(400).json({ success: false, message: 'Invalid shared data.' });
    }
    if (JSON.stringify(value).length > 800000) return res.status(413).json({ success: false, message: 'Shared data is too large.' });
    await pool.execute(
      `INSERT INTO app_state (state_key, state_json, updated_by) VALUES (?, CAST(? AS JSON), ?)\n       ON DUPLICATE KEY UPDATE state_json = VALUES(state_json), updated_by = VALUES(updated_by)`,
      [key, JSON.stringify(value), req.session.user.id]
    );
    res.json({ success: true, message: 'Shared data saved.' });
  } catch (err) {
    console.error('Save shared state error:', err.message);
    res.status(500).json({ success: false, message: 'Could not save shared data.' });
  }
});

app.get('/api/registrations', requireLogin, async (req, res) => {
  try {
    let rows;
    if (req.session.user.role === 'Admin') {
      [rows] = await pool.execute(`SELECT r.registration_json, u.username AS registered_by FROM event_registrations r JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC`);
    } else if (req.session.user.role === 'Student') {
      [rows] = await pool.execute(`SELECT r.registration_json, u.username AS registered_by FROM event_registrations r JOIN users u ON u.id=r.user_id WHERE r.user_id=? ORDER BY r.created_at DESC`, [req.session.user.id]);
    } else {
      // Coordinators only receive registrations for clubs assigned to their account name/username.
      const [stateRows] = await pool.execute("SELECT state_json FROM app_state WHERE state_key='clubs' LIMIT 1");
      let clubs = stateRows[0] ? stateRows[0].state_json : [];
      if (typeof clubs === 'string') clubs = JSON.parse(clubs);
      const user = req.session.user;
      const assigned = (Array.isArray(clubs) ? clubs : []).filter(c =>
        [c.studentCoordinator, c.staffCoordinator].some(v => String(v || '').trim().toLowerCase() === user.name.toLowerCase() || String(v || '').trim().toLowerCase() === user.username.toLowerCase())
      ).map(c => c.name);
      if (!assigned.length) return res.json({ success: true, registrations: [] });
      const placeholders = assigned.map(() => '?').join(',');
      [rows] = await pool.execute(`SELECT r.registration_json, u.username AS registered_by FROM event_registrations r JOIN users u ON u.id=r.user_id WHERE r.club_name IN (${placeholders}) ORDER BY r.created_at DESC`, assigned);
    }
    const registrations = rows.map(row => {
      const data = typeof row.registration_json === 'string' ? JSON.parse(row.registration_json) : row.registration_json;
      return { ...data, registeredBy: row.registered_by };
    });
    res.json({ success: true, registrations });
  } catch (err) {
    console.error('Load registrations error:', err.message);
    res.status(500).json({ success: false, message: 'Could not load registrations.' });
  }
});

app.post('/api/registrations', requireLogin, async (req, res) => {
  try {
    if (req.session.user.role !== 'Student') return res.status(403).json({ success: false, message: 'Only students can register for events.' });
    const data = req.body && req.body.registration;
    if (!data || typeof data !== 'object' || !data.id || !data.clubName || !data.event || !data.studentName) {
      return res.status(400).json({ success: false, message: 'Registration details are incomplete.' });
    }
    const [duplicates] = await pool.execute('SELECT id FROM event_registrations WHERE user_id=? AND club_name=? AND event_name=? LIMIT 1', [req.session.user.id, String(data.clubName), String(data.event)]);
    if (duplicates.length) return res.status(409).json({ success: false, message: 'You have already registered for this event.' });
    const stored = { ...data, registeredBy: req.session.user.username };
    await pool.execute('INSERT INTO event_registrations (id, user_id, club_name, event_name, registration_json) VALUES (?, ?, ?, ?, CAST(? AS JSON))', [String(data.id), req.session.user.id, String(data.clubName), String(data.event), JSON.stringify(stored)]);
    res.status(201).json({ success: true, message: 'Registration saved to the shared database.', registration: stored });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Registration ID already exists. Please try again.' });
    console.error('Save registration error:', err.message);
    res.status(500).json({ success: false, message: 'Could not save registration.' });
  }
});

app.patch('/api/registrations/:id/completion', requireAdmin, async (req, res) => {
  try {
    const completed = req.body && req.body.completed === true;
    const [rows] = await pool.execute('SELECT registration_json FROM event_registrations WHERE id=? LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Registration not found.' });
    const data = typeof rows[0].registration_json === 'string' ? JSON.parse(rows[0].registration_json) : rows[0].registration_json;
    data.participationCompleted = completed;
    await pool.execute('UPDATE event_registrations SET registration_json=CAST(? AS JSON) WHERE id=?', [JSON.stringify(data), req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Update participation error:', err.message);
    res.status(500).json({ success: false, message: 'Could not update participation status.' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

async function startServer() {
  try {
    if (process.env.NODE_ENV === 'production' && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) throw new Error('Set SESSION_SECRET to a long random value (32+ characters) in production.');
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'scem_db',
      waitForConnections: true,
      connectionLimit: 10
    });
    await pool.query('SELECT 1');
    console.log('MySQL connected successfully!');
    const port = Number(process.env.PORT || 3000);
    app.listen(port, () => console.log(`SCEM is running at http://localhost:${port}`));
  } catch (err) {
    console.error('Startup failed:', err.message);
    process.exit(1);
  }
}
startServer();
