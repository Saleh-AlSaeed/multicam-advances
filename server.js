import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { AccessToken } from 'livekit-server-sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(morgan('dev'));
app.use(cors());

// --------- ENV ---------
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'wss://REPLACE_ME.livekit.cloud';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const PORT = Number(process.env.PORT) || 8080;

// --------- STATIC ---------
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  '/vendor',
  express.static(
    path.join(__dirname, 'node_modules', 'livekit-client', 'dist'),
    { immutable: true, maxAge: '1y' }
  )
);

// --------- USERS & SESSIONS ---------
const USERS = {
  admin: { password: 'admin123', role: 'admin' },
  'مدينة رقم 1': { password: 'City1', role: 'city', room: 'city-1' },
  'مدينة رقم 2': { password: 'City2', role: 'city', room: 'city-2' },
  'مدينة رقم 3': { password: 'City3', role: 'city', room: 'city-3' },
  'مدينة رقم 4': { password: 'City4', role: 'city', room: 'city-4' },
  'مدينة رقم 5': { password: 'City5', role: 'city', room: 'city-5' },
  'مدينة رقم 6': { password: 'City6', role: 'city', room: 'city-6' }, // أصلحتها City6
  'مشاهد 1': { password: 'Watch1', role: 'watcher' },
  'مشاهد 2': { password: 'Watch2', role: 'watcher' },
  'مشاهد 3': { password: 'Watch3', role: 'watcher' },
  'مشاهد 4': { password: 'Watch4', role: 'watcher' },
  'مشاهد 5': { password: 'Watch5', role: 'watcher' },
  'مشاهد 6': { password: 'Watch6', role: 'watcher' },
};

const sessions = new Map(); // token -> { token, username, role, room, createdAt }

// --------- WATCH SESSIONS PERSISTENCE ---------
const DATA_DIR = path.join(__dirname, 'data');
const WATCH_FILE = path.join(DATA_DIR, 'watchSessions.json');

function loadWatchSessions() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
    if (!fs.existsSync(WATCH_FILE)) fs.writeFileSync(WATCH_FILE, '[]', 'utf-8');
    const txt = fs.readFileSync(WATCH_FILE, 'utf-8');
    return JSON.parse(txt);
  } catch {
    return [];
  }
}
function saveWatchSessions(list) {
  try {
    fs.writeFileSync(WATCH_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch {}
}
let watchSessions = loadWatchSessions(); // [{ id, roomName, selection, createdAt, active }]

// --------- HELPERS ---------
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
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    metadata,
  });
  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish,
    canSubscribe,
    canPublishData: true,
  });
  at.ttl = 60 * 60 * 4; // 4 ساعات
  return await at.toJwt();
}

// --------- ROUTES ---------
app.get('/api/config', (_, res) => {
  res.json({ LIVEKIT_URL });
});

// تسجيل الدخول
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

// الخروج
app.post('/api/logout', authMiddleware(), (req, res) => {
  sessions.delete(req.user.token);
  res.json({ ok: true });
});

// إنشاء توكن LiveKit
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
      metadata: JSON.stringify({ by: req.user.username, role: req.user.role }),
    });
    res.json({ token: jwt, url: LIVEKIT_URL });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed_to_create_token' });
  }
});

// إنشاء جلسة مشاهدة (Admin فقط)
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

// تعديل/إيقاف جلسة مشاهدة
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

// قراءة الجلسات
app.get('/api/watch/active', authMiddleware(), (_, res) => {
  const active = [...(watchSessions || [])].reverse().find((w) => w.active);
  res.json(active || null);
});
app.get('/api/watch', authMiddleware('admin'), (_, res) => {
  res.json(watchSessions || []);
});
app.get('/api/watch/:id', authMiddleware(), (req, res) => {
  const item = (watchSessions || []).find((w) => w.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'not_found' });
  res.json(item);
});

// Root + health
app.get('/', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/health', (_, res) => res.status(200).send('ok'));

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  if (LIVEKIT_URL.includes('REPLACE_ME')) {
    console.log('⚠️  Please set LIVEKIT_URL / API KEY / SECRET');
  }
});
