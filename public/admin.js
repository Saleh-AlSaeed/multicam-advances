// ===== لوحة المشرف: معاينة غرف المدن + البث للمشاهدين (Mixer/Publisher) =====

let lk = null;
const CITY_ROOMS = ['city-1','city-2','city-3','city-4','city-5','city-6'];

const state = {
  rooms: new Map(),          // roomName -> { room }
  currentWatch: null,        // { id, roomName, selection, active }
  monitorAudio: false,
};

/* ============== LiveKit Helpers ============== */
function normalizeLivekit() {
  const g = window.livekit || window.LivekitClient || window.LiveKit || window.lk || null;
  if (g && !window.livekit) window.livekit = g;
  return !!window.livekit;
}
async function ensureLivekit(timeoutMs = 15000) {
  if (normalizeLivekit()) return window.livekit;
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const t = setInterval(() => {
      if (normalizeLivekit()) { clearInterval(t); resolve(window.livekit); }
      else if (Date.now() - t0 > timeoutMs) { clearInterval(t); reject(new Error('LiveKit client did not load')); }
    }, 50);
  });
}

/* ============== DOM Utils ============== */
function h(tag, props={}, children=[]) {
  const el = document.createElement(tag);
  Object.entries(props).forEach(([k,v]) => {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v);
  });
  children.forEach(c => el.appendChild(c));
  return el;
}
function safePlay(videoEl, wantUnmute=false) {
  if (!videoEl) return;
  if (wantUnmute) videoEl.muted = false;
  videoEl.playsInline = true;
  videoEl.autoplay = true;
  videoEl.play().catch(()=>{});
}

/* ============== Preview Grid (Subscribe to city rooms) ============== */
function buildPreviewGrid() {
  const grid = document.getElementById('previewGrid');
  if (!grid) return;
  grid.innerHTML = '';
  CITY_ROOMS.forEach((rn) => {
    const tile = h('div', { class:'video-tile' }, [
      h('video', { id:`v-${rn}`, autoplay:'', playsinline:'', muted:'' }),
      h('div', { class:'label', text: `معاينة ${rn}` }),
      (()=>{ const m = h('div',{class:'meter'},[h('i')]); m.style.display='none'; return m;})(),
    ]);
    grid.appendChild(tile);
  });
}

function attachVideo(roomName, track) {
  const v = document.getElementById(`v-${roomName}`);
  if (!v) return;
  try {
    track.attach(v);
    v.muted = true;
    safePlay(v, false);
    console.log(`[admin] ✅ attached VIDEO for ${roomName}`);
  } catch (e) {
    console.warn(`[admin] attachVideo failed for ${roomName}:`, e);
  }
}

function attachAudio(roomName, track) {
  try {
    let a = document.querySelector(`audio[data-room="${roomName}"]`);
    if (!a) {
      a = document.createElement('audio');
      a.style.display = 'none';
      a.dataset.room = roomName;
      document.body.appendChild(a);
    }
    track.attach(a);
    a.muted = !state.monitorAudio; // لسماع المعاينة فقط إن رغبت
    if (!a.muted) a.play().catch(()=>{});
    console.log(`[admin] 🎧 attached AUDIO for ${roomName} (muted=${a.muted})`);
    mixer.refreshAudioNodes(); // كي يُضاف هذا المصدر إلى المزج الصوتي
  } catch (e) {
    console.warn(`[admin] attachAudio failed for ${roomName}:`, e);
  }
}

/** إجبار الاشتراك على جميع الـ publications المتاحة (أمن ضد race) */
async function forceSubscribeAll(room) {
  try {
    const { Track } = window.livekit;
    room.remoteParticipants.forEach(p => {
      p.trackPublications.forEach(pub => {
        try {
          if (typeof pub.setSubscribed === 'function' && !pub.isSubscribed) {
            pub.setSubscribed(true).catch(()=>{});
          }
          const t = pub.track;
          if (!t) return;
          if (t.kind === Track.Kind.Video) attachVideo(room.name || '??', t);
          else if (t.kind === Track.Kind.Audio) attachAudio(room.name || '??', t);
        } catch (e) {
          console.warn('[admin] forceSubscribe pub error:', e);
        }
      });
    });
  } catch (e) {
    console.warn('[admin] forceSubscribeAll error:', e);
  }
}

async function connectRoom(roomName, identity) {
  const tk = await API.token(roomName, identity, /*publish*/ false, /*subscribe*/ true);
  // للمعاينة نوقف adaptiveStream لنجبر الاشتراك
  const room = new window.livekit.Room({ adaptiveStream: false, autoSubscribe: true });
  room.name = roomName;

  const { RoomEvent, Track } = window.livekit;

  room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
    try {
      if (track.kind === Track.Kind.Video) attachVideo(roomName, track);
      else if (track.kind === Track.Kind.Audio) attachAudio(roomName, track);
      console.log(`[admin] ➕ TrackSubscribed ${track.kind} from ${participant?.identity} in ${roomName}`);
    } catch(e){ console.warn('[admin] attach on TrackSubscribed error', e); }
  });

  room.on(RoomEvent.TrackPublished, async (pub, participant) => {
    try {
      if (typeof pub.setSubscribed === 'function' && !pub.isSubscribed) {
        await pub.setSubscribed(true).catch(()=>{});
      }
      const t = pub.track;
      if (t) {
        if (t.kind === Track.Kind.Video) attachVideo(roomName, t);
        else if (t.kind === Track.Kind.Audio) attachAudio(roomName, t);
      }
      console.log(`[admin] 📣 TrackPublished kind=${pub.kind} by ${participant?.identity} in ${roomName}`);
    } catch (e) {
      console.warn('[admin] TrackPublished subscribe error:', e);
    }
  });

  room.on(RoomEvent.TrackUnsubscribed, (track) => {
    try { track.detach(); } catch {}
    console.log(`[admin] ➖ TrackUnsubscribed ${track?.kind} in ${roomName}`);
  });

  await room.connect(tk.url, tk.token);
  console.log(`[admin] ✅ connected to ${roomName}`);

  await forceSubscribeAll(room);
  state.rooms.set(roomName, { room });
}

/* ============== Mixer/Publisher ============== */
const mixer = {
  room: null,          // livekit Room (watch)
  canvas: null,
  ctx: null,
  raf: 0,
  selection: [],
  videoTrack: null,    // MediaStreamTrack
  audioTrack: null,    // MediaStreamTrack
  audioCtx: null,
  masterGain: null,
  dest: null,
  audioNodes: new Map(), // roomName -> MediaStreamAudioSourceNode

  setSelection(sel) {
    this.selection = Array.isArray(sel) ? sel.slice(0, 6) : [];
  },

  layoutRects(n, W, H) {
    const pad = 8;
    let cols = 1, rows = 1;
    if (n === 1) { cols = 1; rows = 1; }
    else if (n === 2) { cols = 2; rows = 1; }
    else if (n === 3 || n === 4) { cols = 2; rows = 2; }
    else { cols = 3; rows = 2; } // 5 أو 6
    const cw = Math.floor((W - pad * (cols - 1)) / cols);
    const ch = Math.floor((H - pad * (rows - 1)) / rows);
    const rects = [];
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (i >= n) break;
        rects.push({ x: c * (cw + pad), y: r * (ch + pad), w: cw, h: ch });
        i++;
      }
    }
    return rects;
  },

  drawOnce() {
    const c = this.canvas, g = this.ctx;
    if (!c || !g) return;
    const W = c.width, H = c.height;
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);

    const sel = this.selection.length ? this.selection : CITY_ROOMS;
    const rects = this.layoutRects(Math.min(sel.length, 6), W, H);

    for (let i = 0; i < rects.length; i++) {
      const rn = sel[i];
      const v = document.getElementById(`v-${rn}`);
      const r = rects[i];
      if (v && v.readyState >= 2) {
        try { g.drawImage(v, r.x, r.y, r.w, r.h); }
        catch {}
      } else {
        // placeholder
        g.fillStyle = '#111';
        g.fillRect(r.x, r.y, r.w, r.h);
        g.fillStyle = '#999';
        g.font = '20px system-ui';
        g.fillText(rn || 'N/A', r.x + 12, r.y + 28);
      }
    }
  },

  loop() {
    this.drawOnce();
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.room) this.raf = requestAnimationFrame(() => this.loop());
  },

  refreshAudioNodes() {
    if (!this.audioCtx || !this.masterGain) return;
    // مر على كُل مدينة وحاول توصيلها إن لم تكن موصّلة
    CITY_ROOMS.forEach(rn => {
      if (this.audioNodes.has(rn)) return;
      const a = document.querySelector(`audio[data-room="${rn}"]`);
      if (!a) return;
      const ms = a.srcObject || (a.captureStream ? a.captureStream() : null);
      if (!ms) return;
      try {
        const srcNode = new MediaStreamAudioSourceNode(this.audioCtx, { mediaStream: ms });
        srcNode.connect(this.masterGain);
        this.audioNodes.set(rn, srcNode);
        console.log('[mixer] audio source connected:', rn);
      } catch (e) {
        console.warn('[mixer] cannot connect audio source for', rn, e);
      }
    });
  },

  async start(roomName) {
    try {
      await this.stop(); // تأكد من نظافة الحالة
    } catch {}

    this.canvas = document.getElementById('mixerCanvas');
    if (!this.canvas) throw new Error('mixerCanvas not found');
    this.canvas.width = 1920;
    this.canvas.height = 1080;
    this.canvas.classList.remove('hidden');
    this.ctx = this.canvas.getContext('2d');

    // اتصل بغرفة الـ watch كـ Publisher
    const tk = await API.token(roomName, 'admin-mixer', /*publish*/ true, /*subscribe*/ false);
    this.room = new window.livekit.Room({ adaptiveStream: false, autoSubscribe: false });
    await this.room.connect(tk.url, tk.token);
    console.log('[mixer] ✅ connected to watch room', roomName);

    // فيديو: التقط من الـ Canvas
    const vstream = this.canvas.captureStream(30);
    const vtrack = vstream.getVideoTracks()[0];
    await this.room.localParticipant.publishTrack(vtrack);
    this.videoTrack = vtrack;

    // صوت: اجمع مصادر المدن
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.audioCtx.createGain();
    this.masterGain.gain.value = 1.0;
    this.dest = this.audioCtx.createMediaStreamDestination();
    this.masterGain.connect(this.dest);
    this.refreshAudioNodes();
    const atrack = this.dest.stream.getAudioTracks()[0];
    if (atrack) {
      await this.room.localParticipant.publishTrack(atrack);
      this.audioTrack = atrack;
    }

    // ابدأ الرسم
    this.loop();
    console.log('[mixer] 🚀 broadcasting started');
  },

  async stop() {
    try {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      if (this.videoTrack) { try { this.videoTrack.stop(); } catch{} this.videoTrack = null; }
      if (this.audioTrack) { try { this.audioTrack.stop(); } catch{} this.audioTrack = null; }
      if (this.room) { try { await this.room.disconnect(); } catch{} this.room = null; }
      if (this.audioCtx) { try {
