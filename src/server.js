// src/server.js
import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { AccessToken } from 'livekit-server-sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// مجلد الجذر حيث يوجد public
const ROOT_DIR = path.join(__dirname, '..');

const app = express();
app.use(express.json({ limit:'25mb' }));
app.use(morgan('dev'));

// فعّل CORS للـ API عمومًا
app.use(cors());

// ---------- ENV ----------
const LIVEKIT_URL =
  process.env.LIVEKIT_URL || 'wss://multicam-national-day-htyhphzo.livekit.cloud';
const LIVEKIT_API_KEY =
  process.env.LIVEKIT_API_KEY || 'APITPYikfLT2XJX';
const LIVEKIT_API_SECRET =
  process.env.LIVEKIT_API_SECRET || 'yUhYSz9TWBL69SSP8H0kOK6y8XWRGFDeBBk93WYCzJC';
const PORT = process.env.PORT || 8080;

// ---------- STATIC ----------
app.use(express.static(path.join(ROOT_DIR, 'public')));

// تخديم UMD محلياً
const UMD_PATH = path.join(
  ROOT_DIR,
  'node_modules',
  'livekit-client',
  'dist',
  'livekit-client.umd.min.js'
);
app.get('/vendor/livekit-client.umd.js', (req, res) => {
  try {
    if (fs.existsSync(UMD_PATH)) {
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.sendFile(UMD_PATH);
    } else {
      res.status(500).send('// LiveKit UMD not found in node_modules (livekit-client).');
    }
  } catch (e) {
    res.status(500).send('// Failed to serve LiveKit UMD.');
  }
});

// --------- مستخدمون وهميون ----------
const USERS = {
  admin: { password: 'admin123', role: 'admin' },
  'مدينة رقم1': { password: 'City1', role: 'city', room: 'city-1' },
  'مدينة رقم2': { password: 'City2', role: 'city', room: 'city-2' },
  'مدينة رقم3': { password: 'City3', role: 'city', room: 'city-3' },
  'مدينة رقم4': { password: 'City4', role: 'city', room: 'city-4' },
  'مدينة رقم5': { password: 'City5', role: 'city', room: 'city-5' },
  'مدينة رقم6': { password: 'City6', role: 'city', room: 'city-6' },
  مشاهد1: { password: 'Watch1', role: 'watcher' },
  مشاهد2: { password: 'Watch2', role: 'watcher' },
  مشاهد3: { password: 'Watch3', role: 'watcher' },
  مشاهد4: { password: 'Watch4', role: 'watcher' },
  مشاهد5: { password: 'Watch5', role: 'watcher' },
  مشاهد6: { password: 'Watch6', role: 'watcher' }
};

const sessions = new Map(); // token -> { username, role, room, createdAt }

// ---------- تخزين جلسات المشاهدة + التايملاين ----------
const DATA_DIR = path.join(ROOT_DIR, 'data');
const WATCH_FILE = path.join(DATA_DIR, 'watchSessions.json');
const TL_FILE = path.join(DATA_DIR, 'timelines.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive:true });
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive:true });
  if (!fs.existsSync(WATCH_FILE)) fs.writeFileSync(WATCH_FILE, '[]', 'utf-8');
  if (!fs.existsSync(TL_FILE)) fs.writeFileSync(TL_FILE, '{}', 'utf-8');
}
ensureDirs();

function loadWatchSessions() {
  try { return JSON.parse(fs.readFileSync(WATCH_FILE, 'utf-8')); }
  catch { return []; }
}
function saveWatchSessions(list) {
  try { fs.writeFileSync(WATCH_FILE, JSON.stringify(list, null, 2), 'utf-8'); } catch {}
}
let watchSessions = loadWatchSessions();

function loadTimelines() {
  try { return JSON.parse(fs.readFileSync(TL_FILE, 'utf-8')); }
  catch { return {}; }
}
function saveTimelines(obj) {
  try { fs.writeFileSync(TL_FILE, JSON.stringify(obj, null, 2), 'utf-8'); } catch {}
}
let timelines = loadTimelines();

// تخديم الملفات المرفوعة مع CORS صريح (مهم للـ Canvas)
const uploadsCORS = cors({ origin: '*', credentials: false });
app.use(
  '/uploads',
  uploadsCORS,
  (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    next();
  },
  express.static(UPLOAD_DIR, {
    setHeaders(res) {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
  })
);

// Multer لرفع الملفات
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({ storage });

// ---------- Helpers ----------
function authMiddleware(required = null) {
  return (req, res, next) => {
    const hdr = req.headers.authorization || '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    if (!token || !sessions.has(token)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const s = sessions.get(token);
    req.user = s;
    if (required && s.role !== required) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

async function buildToken({ identity, roomName, canPublish = false, canSubscribe = true, metadata = '{}' }) {
  const nowSec = Math.floor(Date.now() / 1000);
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    ttl: '10m',
    nbf: nowSec - 5,
    metadata
  });
  at.addGrant({ roomJoin: true, room: roomName, canPublish, canSubscribe, canPublishData: true });
  return await at.toJwt();
}

// ---------- Routes ----------
app.get('/api/config', (_, res) => {
  res.json({ LIVEKIT_URL });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password || !USERS[username] || USERS[username].password !== password) {
    return res.status(401).json({ error: 'Bad credentials' });
  }
  const { role, room } = USERS[username];
  const token = uuidv4();
  sessions.set(token, { token, username, role, room, createdAt: Date.now() });
  res.json({ token, username, role, room });
});

app.post('/api/logout', authMiddleware(), (req, res) => {
  const token = req.user.token;
  sessions.delete(token);
  res.json({ ok: true });
});

app.post('/api/token', authMiddleware(), async (req, res) => {
  const { roomName, publish = false, subscribe = true, identity } = req.body || {};
  if (!roomName || !identity) {
    return res.status(400).json({ error: 'roomName and identity are required' });
  }
  try {
    const jwt = await buildToken({
      identity,
      roomName,
      canPublish: !!publish,
      canSubscribe: !!subscribe,
      metadata: JSON.stringify({ by: req.user.username, role: req.user.role })
    });
    res.json({ token: jwt, url: LIVEKIT_URL });
  } catch (e) {
    console.error('token error:', e?.message || e);
    res.status(500).json({ error: 'failed_to_create_token' });
  }
});

// إنشاء/إدارة جلسات المشاهدة (admin)
app.post('/api/create-watch', authMiddleware('admin'), (req, res) => {
  const { selection } = req.body || {};
  if (!Array.isArray(selection) || selection.length === 0 || selection.length > 6) {
    return res.status(400).json({ error: 'selection must be 1..6 entries' });
  }
  const id = uuidv4();
  const roomName = `watch-${id.slice(0, 8)}`;
  watchSessions = (watchSessions || []).map((w) => ({ ...w, active: false }));
  const record = { id, roomName, selection, createdAt: Date.now(), active: true };
  watchSessions.push(record);
  saveWatchSessions(watchSessions);
  res.json(record);
});

app.put('/api/watch/:id', authMiddleware('admin'), (req, res) => {
  const { id } = req.params;
  const { selection, active } = req.body || {};
  const idx = (watchSessions || []).findIndex((w) => w.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not_found' });
  if (selection) watchSessions[idx].selection = selection;
  if (typeof active === 'boolean') watchSessions[idx].active = active;
  saveWatchSessions(watchSessions);
  res.json(watchSessions[idx]);
});

app.post('/api/watch/:id/stop', authMiddleware('admin'), (req, res) => {
  const { id } = req.params;
  const idx = (watchSessions || []).findIndex((w) => w.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not_found' });
  watchSessions[idx].active = false;
  saveWatchSessions(watchSessions);
  res.json({ ok: true });
});

app.get('/api/watch/active', authMiddleware(), (req, res) => {
  const active = [...(watchSessions || [])].reverse().find((w) => w.active);
  res.json(active || null);
});
app.get('/api/watch', authMiddleware('admin'), (req, res) => {
  res.json(watchSessions || []);
});
app.get('/api/watch/:id', authMiddleware(), (req, res) => {
  const item = (watchSessions || []).find((w) => w.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'not_found' });
  res.json(item);
});

// ===== رفع وسائط للتايملاين =====
app.post('/api/upload', authMiddleware('admin'), upload.single('file'), (req, res) => {
  const f = req.file;
  if (!f) return res.status(400).json({ error: 'no_file' });
  const url = '/uploads/' + f.filename;
  res.json({ url, name: f.originalname, size: f.size, mime: f.mimetype });
});

// ===== Timeline API =====
app.get('/api/timeline/:watchId', authMiddleware(), (req, res) => {
  const id = req.params.watchId;
  const tl = timelines[id] || { watchId: id, events: [], running: false, startedAt: null };
  res.json(tl);
});
app.put('/api/timeline/:watchId', authMiddleware('admin'), (req, res) => {
  const id = req.params.watchId;
  const events = Array.isArray(req.body?.events) ? req.body.events : [];
  const prev = timelines[id] || {};
  timelines[id] = {
    watchId: id,
    events,
    running: !!prev.running,
    startedAt: prev.startedAt || null
  };
  saveTimelines(timelines);
  res.json(timelines[id]);
});
app.post('/api/timeline/:watchId/start', authMiddleware('admin'), (req, res) => {
  const id = req.params.watchId;
  const startAt = req.body?.startAt || Date.now();
  const prev = timelines[id] || { watchId: id, events: [] };
  timelines[id] = { ...prev, running: true, startedAt: startAt };
  saveTimelines(timelines);
  res.json(timelines[id]);
});
app.post('/api/timeline/:watchId/stop', authMiddleware('admin'), (req, res) => {
  const id = req.params.watchId;
  const prev = timelines[id] || { watchId: id, events: [] };
  timelines[id] = { ...prev, running: false };
  saveTimelines(timelines);
  res.json(timelines[id]);
});
app.delete('/api/timeline/:watchId/events/:eventId', authMiddleware('admin'), (req, res) => {
  const { watchId, eventId } = req.params;
  const tl = timelines[watchId] || { watchId, events: [] };
  tl.events = (tl.events || []).filter(e => e.id !== eventId);
  timelines[watchId] = tl;
  saveTimelines(timelines);
  res.json({ ok: true });
});

// Health
app.get('/health', (_, res) => res.json({ ok: true }));

// Root
app.get('/', (_, res) => {
  res.sendFile(path.join(ROOT_DIR, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || LIVEKIT_URL.includes('REPLACE_ME')) {
    console.log('⚠️  Set LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET in .env');
  }
});
