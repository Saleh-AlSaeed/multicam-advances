// src/server.js
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

// مجلد الجذر حيث يوجد public
const ROOT_DIR = path.join(__dirname, '..');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));
app.use(cors());

// ---------- ENV ----------
const LIVEKIT_URL =
  process.env.LIVEKIT_URL || 'wss://live-with-talk-h6pf9yqb.livekit.cloud';
const LIVEKIT_API_KEY =
  process.env.LIVEKIT_API_KEY || 'APINa9ifAhM99tR';
const LIVEKIT_API_SECRET =
  process.env.LIVEKIT_API_SECRET || 'ZqcFXxQ1bbyye07eonAHG8cKb0RrL3IPIyOQQFUkeztA';
const PORT = process.env.PORT || 8080;

// ---------- STATIC ----------
app.use(express.static(path.join(ROOT_DIR, 'public')));

// تخديم UMD محلياً من node_modules عند المسار /vendor/livekit-client.umd.min.js
const UMD_PATH = path.join(
  ROOT_DIR,
  'node_modules',
  'livekit-client',
  'dist',
  'livekit-client.umd.min.js'
);
app.get('/vendor/livekit-client.umd.min.js', (req, res) => {
  try {
    if (fs.existsSync(UMD_PATH)) {
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.sendFile(UMD_PATH);
    } else {
      res
        .status(500)
        .send('// LiveKit UMD not found in node_modules (livekit-client).');
    }
  } catch (e) {
    res.status(500).send('// Failed to serve LiveKit UMD.');
  }
});

// --------- بيانات وهمية للمستخدمين ----------
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

// ---------- التخزين على القرص ----------
const DATA_DIR = path.join(ROOT_DIR, 'data');
const WATCH_FILE = path.join(DATA_DIR, 'watchSessions.json');
const TIMELINES_FILE = path.join(DATA_DIR, 'timelines.json');

function ensureDataFiles() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
    if (!fs.existsSync(WATCH_FILE)) fs.writeFileSync(WATCH_FILE, '[]', 'utf-8');
    if (!fs.existsSync(TIMELINES_FILE)) fs.writeFileSync(TIMELINES_FILE, '[]', 'utf-8');
  } catch {}
}
ensureDataFiles();

function loadJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return []; }
}
function saveJson(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8'); } catch {}
}

let watchSessions = loadJson(WATCH_FILE);
let timelines = loadJson(TIMELINES_FILE);

function saveWatchSessions(list) { watchSessions = list || []; saveJson(WATCH_FILE, watchSessions); }
function saveTimelines(list) { timelines = list || []; saveJson(TIMELINES_FILE, timelines); }

function getTimelineByWatchId(watchId) {
  return (timelines || []).find(t => t.watchId === watchId) || null;
}
function upsertTimeline(obj) {
  const idx = (timelines || []).findIndex(t => t.watchId === obj.watchId);
  if (idx === -1) timelines.push(obj);
  else timelines[idx] = obj;
  saveTimelines(timelines);
  return obj;
}

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

async function buildToken({
  identity,
  roomName,
  canPublish = false,
  canSubscribe = true,
  metadata = '{}'
}) {
  const nowSec = Math.floor(Date.now() / 1000);
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    ttl: '10m',
    nbf: nowSec - 5,
    metadata
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish,
    canSubscribe,
    canPublishData: true
  });

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

// ---------- Timeline API ----------
app.get('/api/timeline/:watchId', authMiddleware(), (req, res) => {
  const t = getTimelineByWatchId(req.params.watchId);
  res.json(t || null);
});

app.put('/api/timeline/:watchId', authMiddleware('admin'), (req, res) => {
  const watchId = req.params.watchId;
  const base = getTimelineByWatchId(watchId) || {
    watchId,
    active: false,
    startAt: null,
    events: [],
    updatedAt: Date.now(),
    createdAt: Date.now()
  };
  base.events = Array.isArray(req.body?.events) ? req.body.events : base.events;
  base.updatedAt = Date.now();
  upsertTimeline(base);
  res.json(base);
});

app.post('/api/timeline/:watchId/events', authMiddleware('admin'), (req, res) => {
  const watchId = req.params.watchId;
  const base = getTimelineByWatchId(watchId) || {
    watchId,
    active: false,
    startAt: null,
    events: [],
    updatedAt: Date.now(),
    createdAt: Date.now()
  };
  const ev = req.body || {};
  if (!ev.id) ev.id = uuidv4();
  if (typeof ev.type !== 'string') return res.status(400).json({ error: 'type required' });
  if (typeof ev.startOffsetMs !== 'number') ev.startOffsetMs = 0;
  if (typeof ev.durationMs !== 'number') ev.durationMs = 0;
  if (typeof ev.payload !== 'object') ev.payload = {};
  base.events.push(ev);
  base.updatedAt = Date.now();
  upsertTimeline(base);
  res.json(ev);
});

app.delete('/api/timeline/:watchId/events/:eventId', authMiddleware('admin'), (req, res) => {
  const watchId = req.params.watchId;
  const eventId = req.params.eventId;
  const base = getTimelineByWatchId(watchId);
  if (!base) return res.status(404).json({ error: 'not_found' });
  base.events = (base.events || []).filter(e => e.id !== eventId);
  base.updatedAt = Date.now();
  upsertTimeline(base);
  res.json({ ok: true });
});

app.post('/api/timeline/:watchId/start', authMiddleware('admin'), (req, res) => {
  const watchId = req.params.watchId;
  const base = getTimelineByWatchId(watchId) || {
    watchId,
    active: false,
    startAt: null,
    events: [],
    updatedAt: Date.now(),
    createdAt: Date.now()
  };
  base.active = true;
  base.startAt = typeof req.body?.startAt === 'number' ? req.body.startAt : Date.now();
  base.updatedAt = Date.now();
  upsertTimeline(base);
  res.json(base);
});

app.post('/api/timeline/:watchId/stop', authMiddleware('admin'), (req, res) => {
  const watchId = req.params.watchId;
  const base = getTimelineByWatchId(watchId);
  if (!base) return res.status(404).json({ error: 'not_found' });
  base.active = false;
  base.updatedAt = Date.now();
  upsertTimeline(base);
  res.json({ ok: true });
});

// ---------- Backup API (Export / Import) ----------
/**
 * GET /api/backup  (admin)
 * يرجع:
 * {
 *   version: "1.0",
 *   exportedAt: 1712345678901,
 *   watchSessions: [...],
 *   timelines: [...]
 * }
 */
app.get('/api/backup', authMiddleware('admin'), (req, res) => {
  res.json({
    version: '1.0',
    exportedAt: Date.now(),
    watchSessions: watchSessions || [],
    timelines: timelines || []
  });
});

/**
 * POST /api/backup?mode=merge|replace  (admin)
 * body: { watchSessions?:[], timelines?:[] }
 * - replace: يستبدل القوائم بالكامل
 * - merge (افتراضي): يدمج بحسب watchSessions.id و timelines.watchId
 */
app.post('/api/backup', authMiddleware('admin'), (req, res) => {
  const mode = (req.query.mode || 'merge').toString().toLowerCase();
  const incomingWS = Array.isArray(req.body?.watchSessions) ? req.body.watchSessions : [];
  const incomingTL = Array.isArray(req.body?.timelines) ? req.body.timelines : [];

  if (mode === 'replace') {
    saveWatchSessions(incomingWS);
    saveTimelines(incomingTL);
    return res.json({ ok: true, mode: 'replace', counts: { watchSessions: watchSessions.length, timelines: timelines.length } });
  }

  // merge
  const wsById = new Map((watchSessions || []).map(w => [w.id, w]));
  for (const w of incomingWS) {
    if (!w?.id) continue;
    wsById.set(w.id, w);
  }
  const mergedWS = Array.from(wsById.values());

  const tlByKey = new Map((timelines || []).map(t => [t.watchId, t]));
  for (const t of incomingTL) {
    if (!t?.watchId) continue;
    // لو فيه موجود، نستبدله بالوارد (سلوك "merge overwrite")
    tlByKey.set(t.watchId, t);
  }
  const mergedTL = Array.from(tlByKey.values());

  saveWatchSessions(mergedWS);
  saveTimelines(mergedTL);

  res.json({
    ok: true,
    mode: 'merge',
    counts: { watchSessions: mergedWS.length, timelines: mergedTL.length }
  });
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
