// ===== لوحة المشرف: معاينة غرف المدن + نشر مكسّ 1080p + Timeline (مع CORS للوسائط) =====

let lk = null;
const CITY_ROOMS = ['city-1','city-2','city-3','city-4','city-5','city-6'];

const state = {
  rooms: new Map(),
  tracks: new Map(),
  currentWatch: null,

  pub: {
    room: null,
    canvas: null,
    ctx: null,
    fps: 30,
    rafId: null,
    layout: [],
    selection: [],
    audioChoice: null,
    vTrack: null,
    aTrack: null,
    audioCtx: null,
    audioDest: null,
  },

  timeline: { running:false, startedAt:null, events:[] },
  assets: new Map(),   // src -> { kind, el }
  tlPollId: null,

  monitorAudio: false,
};

/* LiveKit */
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
  if (wantUnmute) videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.autoplay = true;
  videoEl.play().catch(()=>{});
}

/* Preview grid */
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
    const t = state.tracks.get(roomName) || {};
    t.videoEl = v;
    t.videoTrack = track;
    state.tracks.set(roomName, t);
    console.log(`[admin] ✅ attached VIDEO for ${roomName}`);
  } catch (e) {
    console.warn(`[admin] attachVideo failed for ${roomName}:`, e);
  }
}
function attachAudio(roomName, track) {
  try {
    const t = state.tracks.get(roomName) || {};
    t.audioTrack = track;
    state.tracks.set(roomName, t);
    console.log(`[admin] 🎧 got AUDIO for ${roomName}`);
  } catch (e) { console.warn(`[admin] attachAudio failed for ${roomName}:`, e); }
}

async function forceSubscribeAll(room) {
  try {
    const { Track } = lk;
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
        } catch (e) { console.warn('[admin] forceSubscribe pub error:', e); }
      });
    });
  } catch (e) { console.warn('[admin] forceSubscribeAll error:', e); }
}

async function connectRoom(roomName, identity) {
  const tk = await API.token(roomName, identity, false, true);
  const room = new lk.Room({ adaptiveStream: false, autoSubscribe: true });
  room.name = roomName;

  const { RoomEvent, Track } = lk;
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
    } catch (e) { console.warn('[admin] TrackPublished subscribe error:', e); }
  });

  await room.connect(tk.url, tk.token);
  console.log(`[admin] ✅ connected to ${roomName}`);
  await forceSubscribeAll(room);
  state.rooms.set(roomName, { room });
}

/* Mix publisher 1080p + audio selection */
function computeLayout(n, W, H) {
  const rects = [];
  if (n <= 1) rects.push({x:0, y:0, w:W, h:H});
  else if (n === 2) { rects.push({x:0,y:0,w:W/2,h:H},{x:W/2,y:0,w:W/2,h:H}); }
  else if (n === 3) {
    rects.push({x:0,y:0,w:W/2,h:H},{x:W/2,y:0,w:W/2,h:H/2},{x:W/2,y:H/2,w:W/2,h:H/2});
  } else if (n === 4) {
    const w=W/2,h=H/2; rects.push({x:0,y:0,w,h},{x:w,y:0,w,h},{x:0,y:h,w,h},{x:w,y:h,w,h});
  } else {
    const w=W/3,h=H/2;
    for (let r=0;r<2;r++) for (let c=0;c<3;c++) rects.push({x:c*w,y:r*h,w,h});
  }
  return rects.slice(0, n);
}
function ensurePubCanvas() {
  if (state.pub.canvas) return;
  const c = document.getElementById('mixerCanvas') || (()=> {
    const el = document.createElement('canvas');
    el.id = 'mixerCanvas'; el.width = 1920; el.height = 1080;
    el.classList.add('hidden'); document.body.appendChild(el); return el;
  })();
  c.width = 1920; c.height = 1080;
  state.pub.canvas = c;
  state.pub.ctx = c.getContext('2d');
}
function clearPubAudio() {
  if (state.pub.audioCtx) { try { state.pub.audioCtx.close(); } catch {} }
  state.pub.audioCtx = null; state.pub.audioDest = null;
}

async function startWatchPublisher(selection) {
  const s = API.session(); if (!s) return;
  const { Room, LocalVideoTrack, LocalAudioTrack } = lk;
  const watchRec = state.currentWatch;
  if (!watchRec?.roomName) { console.warn('[admin] no watch roomName'); return; }

  await stopWatchPublisher();

  ensurePubCanvas();
  const W = state.pub.canvas.width, H = state.pub.canvas.height;

  state.pub.selection = selection.slice();
  state.pub.layout = computeLayout(selection.length, W, H);

  const stream = state.pub.canvas.captureStream(state.pub.fps);
  const vms = stream.getVideoTracks()[0];
  state.pub.vTrack = new LocalVideoTrack(vms);

  clearPubAudio();
  const chosen = state.pub.audioChoice;
  if (chosen) {
    const t = state.tracks.get(chosen);
    const ra = t?.audioTrack;
    if (ra?.mediaStreamTrack) {
      state.pub.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      state.pub.audioDest = state.pub.audioCtx.createMediaStreamDestination();
      const ms = new MediaStream([ra.mediaStreamTrack]);
      const src = state.pub.audioCtx.createMediaStreamSource(ms);
      src.connect(state.pub.audioDest);
      const ams = state.pub.audioDest.stream.getAudioTracks()[0];
      if (ams) state.pub.aTrack = new LocalAudioTrack(ams);
    } else { console.warn('[admin] chosen audio track not ready:', chosen); }
  }

  const tk = await API.token(watchRec.roomName, `mixer-${s.username}`, true, false);
  state.pub.room = new Room({ adaptiveStream: false, autoSubscribe: false });
  await state.pub.room.connect(tk.url, tk.token);

  await state.pub.room.localParticipant.publishTrack(state.pub.vTrack);
  if (state.pub.aTrack) await state.pub.room.localParticipant.publishTrack(state.pub.aTrack);
  console.log('[admin] ✅ publishing 1080p mix to watch room:', watchRec.roomName, 'audioFrom=', chosen || 'none');

  const draw = () => {
    const { ctx, canvas } = state.pub;
    ctx.fillStyle = '#000'; ctx.fillRect(0,0,canvas.width,canvas.height);

    // طبقة المدن
    state.pub.selection.forEach((roomName, i) => {
      const r = state.pub.layout[i];
      const v = document.getElementById(`v-${roomName}`);
      if (v && v.readyState >= 2) {
        try { ctx.drawImage(v, r.x, r.y, r.w, r.h); } catch (e) {}
      } else {
        ctx.fillStyle = '#222'; ctx.fillRect(r.x, r.y, r.w, r.h);
      }
    });

    // طبقة الـ Timeline
    renderTimelineOverlays(ctx, canvas);

    state.pub.rafId = requestAnimationFrame(draw);
  };
  draw();
}
async function stopWatchPublisher() {
  try { if (state.pub.rafId) cancelAnimationFrame(state.pub.rafId); } catch {}
  state.pub.rafId = null;

  try {
    if (state.pub.room) {
      const lp = state.pub.room.localParticipant;
      try { lp?.publishedTracks?.forEach(pt => { try { pt?.unpublish?.(); } catch {} }); } catch {}
      state.pub.room.disconnect();
    }
  } catch {}
  state.pub.room = null;
  try { state.pub.vTrack?.stop(); } catch{}; state.pub.vTrack = null;
  try { state.pub.aTrack?.stop(); } catch{}; state.pub.aTrack = null;
  clearPubAudio();
}

/* Timeline overlay (مع crossOrigin للصور/الفيديو) */
function overlayRect(canvasW, canvasH, pos, baseW=0.4, baseH=0.4) {
  if (pos === 'full') return {x:0,y:0,w:canvasW,h:canvasH};
  const w = Math.floor(canvasW * baseW), h = Math.floor(canvasH * baseH);
  const map = {
    'center': { x:(canvasW-w)/2, y:(canvasH-h)/2 },
    'top-left': { x:20, y:20 },
    'top-right': { x:canvasW-w-20, y:20 },
    'bottom-left': { x:20, y:canvasH-h-20 },
    'bottom-right': { x:canvasW-w-20, y:canvasH-h-20 }
  };
  const p = map[pos] || map['center'];
  return { x:p.x, y:p.y, w, h };
}
function loadAsset(ev) {
  const src = ev?.payload?.src;
  if (!src) return null;
  if (state.assets.has(src)) return state.assets.get(src);

  if (ev.type === 'image') {
    const img = new Image();
    img.crossOrigin = 'anonymous';           // مهم قبل src
    img.src = src;
    const rec = { kind:'image', el: img };
    state.assets.set(src, rec);
    return rec;
  }
  if (ev.type === 'video') {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';             // مهم قبل src
    v.muted = true; v.loop = true; v.playsInline = true;
    v.preload = 'auto';
    v.src = src;
    v.load();
    v.addEventListener('canplay', () => { v.play().catch(()=>{}); }, { once:true });
    const rec = { kind:'video', el: v };
    state.assets.set(src, rec);
    return rec;
  }
  return null;
}
function wrapFillText(ctx, text, cx, cy, maxWidth, lineHeight) {
  const words = text.split(/\s+/); const lines = []; let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  const totalH = lines.length * lineHeight;
  let y = cy - totalH/2 + lineHeight/2;
  for (const L of lines) { ctx.fillText(L, cx, y); y += lineHeight; }
}
function renderTimelineOverlays(ctx, canvas) {
  const tl = state.timeline;
  if (!tl?.running || !Array.isArray(tl.events) || !tl.startedAt) return;
  const now = Date.now(); const t = now - tl.startedAt;

  for (const ev of tl.events) {
    const start = ev.startOffsetMs|0; const end = start + (ev.durationMs|0);
    if (t < start || t > end) continue;

    const pos = ev.payload?.pos || 'center';
    if (ev.type === 'text') {
      const r = overlayRect(canvas.width, canvas.height, pos, 0.6, 0.24);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 42px system-ui,Segoe UI,Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const text = (ev.payload?.text || '').slice(0, 200);
      try { wrapFillText(ctx, text, r.x + r.w/2, r.y + r.h/2, r.w - 40, 48); } catch {}
      ctx.restore();
    } else if (ev.type === 'image') {
      const asset = loadAsset(ev); const img = asset?.el;
      if (img && img.complete) {
        const r = overlayRect(canvas.width, canvas.height, pos, 0.5, 0.5);
        try { ctx.drawImage(img, r.x, r.y, r.w, r.h); } catch {}
      }
    } else if (ev.type === 'video') {
      const asset = loadAsset(ev); const v = asset?.el;
      if (v && v.readyState >= 2) {
        const r = overlayRect(canvas.width, canvas.height, pos, 0.6, 0.6);
        try { ctx.drawImage(v, r.x, r.y, r.w, r.h); } catch {}
      }
    }
    // audio: لا ندمجه في مخرج المشاهدة (الصوت من مدينة واحدة حسب اختيار المشرف)
  }
}

/* Timeline fetch/poll */
async function refreshTimeline() {
  try {
    if (!state.currentWatch?.id) return;
    const s = API.session();
    const r = await fetch('/api/timeline/' + state.currentWatch.id, {
      headers: { 'Authorization':'Bearer ' + (s?.token||'') }
    });
    if (!r.ok) { console.warn('[admin] timeline fetch not ok'); return; }
    const tl = await r.json();
    state.timeline = {
      running: !!tl?.running,
      startedAt: tl?.startedAt || null,
      events: Array.isArray(tl?.events) ? tl.events : []
    };
    console.log('[admin] timeline sync:', state.timeline.running, 'events=', state.timeline.events.length);
  } catch (e) { console.warn('[admin] timeline fetch err', e); }
}
function startTimelinePolling() {
  clearInterval(state.tlPollId);
  state.tlPollId = setInterval(refreshTimeline, 1500);
}

/* View modal (sources + audio pick) */
function openViewModal() {
  const modal = document.getElementById('viewModal');
  const sel = document.getElementById('camCount');
  const slots = document.getElementById('slots');

  const rebuild = () => {
    const n = parseInt(sel.value, 10) || 6;
    slots.innerHTML = '';

    const noneRow = h('div', { class:'grid cols-2', style:'align-items:center' }, [
      h('div', {}, [ h('label', { text:'صوت المكس:' }) ]),
      (() => {
        const wrap = document.createElement('div');
        wrap.style.display = 'flex'; wrap.style.alignItems = 'center'; wrap.style.gap = '10px';
        const none = document.createElement('label'); none.className = 'badge';
        const noneInp = document.createElement('input'); noneInp.type = 'radio'; noneInp.name = 'audioSel'; noneInp.value = '';
        noneInp.checked = !state.pub.audioChoice;
        none.appendChild(noneInp); none.appendChild(document.createTextNode('بدون صوت'));
        wrap.appendChild(none); return wrap;
      })()
    ]);
    slots.appendChild(noneRow);

    for (let i=0;i<n;i++){
      const wrap = h('div', { class:'grid cols-2' }, [
        h('div', {}, [
          h('label', { text:`المصدر ${i+1}` }),
          (() => {
            const s = h('select', { class:'input', id:`slot-${i}` });
            CITY_ROOMS.forEach(rn => {
              const o = document.createElement('option'); o.value = rn; o.textContent = rn; s.appendChild(o);
            });
            s.value = CITY_ROOMS[i] || CITY_ROOMS[0];
            return s;
          })()
        ]),
        (() => {
          const lbl = document.createElement('label'); lbl.className = 'badge';
          const r = document.createElement('input'); r.type = 'radio'; r.name = 'audioSel'; r.value = `slot-${i}`;
          const pre = state.pub.audioChoice; if (pre && CITY_ROOMS[i] === pre) r.checked = true;
          lbl.appendChild(r); lbl.appendChild(document.createTextNode('استخدم صوت هذا المصدر'));
          return lbl;
        })()
      ]);
      slots.appendChild(wrap);
    }
  };

  sel.onchange = rebuild; rebuild();
  modal.classList.add('open');
}
function closeViewModal(){ document.getElementById('viewModal')?.classList.remove('open'); }
function readSelectionFromSlots() {
  const sel = document.getElementById('camCount'); const n = parseInt(sel.value, 10) || 6; const out = [];
  for (let i=0;i<n;i++){ const s = document.getElementById(`slot-${i}`); if (s && s.value) out.push(s.value); }
  const chosen = document.querySelector('input[name="audioSel"]:checked');
  if (chosen && chosen.value && chosen.value.startsWith('slot-')) {
    const idx = parseInt(chosen.value.slice(5), 10); const s = document.getElementById(`slot-${idx}`);
    state.pub.audioChoice = s?.value || null;
  } else { state.pub.audioChoice = null; }
  return out;
}

/* Toolbar */
function wireTopbar() {
  const monitor = document.getElementById('monitorAudio');
  monitor?.addEventListener('change', () => { state.monitorAudio = !!monitor.checked; }, { passive: true });

  document.getElementById('viewModeBtn')?.addEventListener('click', openViewModal);
  document.getElementById('closeModalBtn')?.addEventListener('click', closeViewModal);
  document.getElementById('createWatchBtn')?.addEventListener('click', createWatchFromModal);
  document.getElementById('applyBtn')?.addEventListener('click', applySelectionToWatch);
  document.getElementById('stopBtn')?.addEventListener('click', stopWatch);
  document.getElementById('goWatchBtn')?.addEventListener('click', goWatchNow);

  window.addEventListener('timeline:changed', async () => {
    await refreshTimeline();
    startTimelinePolling();
  }, false);
}

async function createWatchFromModal() {
  try {
    const selection = readSelectionFromSlots();
    if (!selection.length) { alert('اختر مصادر على الأقل'); return; }
    const rec = await API.createWatch(selection);
    state.currentWatch = rec;
    document.getElementById('stopBtn').disabled = false;
    document.getElementById('goWatchBtn').disabled = false;
    closeViewModal();
    alert('تم إنشاء جلسة المشاهدة.');

    await startWatchPublisher(selection);
    await refreshTimeline(); startTimelinePolling();
  } catch (e) {
    alert('فشل إنشاء جلسة المشاهدة'); console.error(e);
  }
}
async function applySelectionToWatch() {
  try {
    if (!state.currentWatch?.id) { alert('لا توجد جلسة نشطة'); return; }
    const selection = readSelectionFromSlots();
    const s = API.session();
    const r = await fetch('/api/watch/' + state.currentWatch.id, {
      method:'PUT', headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + (s?.token||'') },
      body: JSON.stringify({ selection })
    });
    if (!r.ok) throw new Error('apply failed');
    const rec = await r.json(); state.currentWatch = rec; alert('تم تطبيق التغييرات.');
    await startWatchPublisher(selection);
  } catch (e) { alert('تعذر تطبيق التغييرات'); console.error(e); }
}
async function stopWatch() {
  try {
    if (!state.currentWatch?.id) {
      const active = await API.getActiveWatch(); if (!active) { alert('لا توجد جلسة نشطة'); return; }
      state.currentWatch = active;
    }
    const s = API.session();
    const r = await fetch('/api/watch/' + state.currentWatch.id + '/stop', {
      method:'POST', headers: { 'Authorization':'Bearer ' + (s?.token||'') }
    });
    if (!r.ok) throw new Error('stop failed');
    state.currentWatch.active = false; document.getElementById('stopBtn').disabled = true;
    alert('تم إيقاف البث.');
  } catch (e) { alert('تعذر الإيقاف'); console.error(e); }
  finally { await stopWatchPublisher(); clearInterval(state.tlPollId); state.tlPollId = null; }
}
async function goWatchNow() {
  try {
    const rec = state.currentWatch?.id ? state.currentWatch : (await API.getActiveWatch());
    if (!rec) { alert('لا توجد جلسة نشطة'); return; }
    window.open('/watch.html?id=' + rec.id, '_blank');
  } catch (e) { alert('تعذر فتح المشاهدة'); console.error(e); }
}

/* Init + timeline polling */
async function startPreview() {
  const s = API.session();
  if (!s || s.role !== 'admin') { location.href = '/'; return; }
  lk = await ensureLivekit(); try { lk.setLogLevel?.('info'); } catch {}
  buildPreviewGrid();
  for (let i=0;i<CITY_ROOMS.length;i++){
    const rn = CITY_ROOMS[i];
    try { await connectRoom(rn, `admin-${s.username}-${i+1}`); }
    catch (e) { console.warn('[admin] failed to connect', rn, e?.message || e); }
  }
}
(async function init() {
  const s = API.session();
  if (!s || s.role !== 'admin') { location.href = '/'; return; }
  document.getElementById('logoutBtn')?.addEventListener('click', async (e) => {
    e.preventDefault(); try { await API.logout(); } catch {} try { localStorage.removeItem('session'); } catch {}
    location.replace('/');
  }, { passive:false });

  wireTopbar();
  await startPreview();

  try {
    const active = await API.getActiveWatch();
    if (active) {
      state.currentWatch = active;
      document.getElementById('stopBtn').disabled = false;
      document.getElementById('goWatchBtn').disabled = false;
      state.pub.audioChoice = null;
      await startWatchPublisher(active.selection || []);
      await refreshTimeline(); startTimelinePolling();
    }
  } catch {}
})();
