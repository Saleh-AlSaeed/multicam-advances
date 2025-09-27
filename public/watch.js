// ===== صفحة المشاهدة (مشترك) =====

let lkRoom = null;
let currentVideoPub = null; // آخر RemoteTrackPublication للفيديو المشترك

/* توحيد مرجع مكتبة LiveKit على window.livekit */
function normalizeLivekit() {
  const g =
    window.livekit ||
    window.LivekitClient ||
    window.LiveKit ||
    window.lk ||
    null;
  if (g && !window.livekit) window.livekit = g;
  return !!window.livekit;
}

/* انتظار تحميل UMD */
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

function qs(k, def=''){ const u=new URL(location.href); return u.searchParams.get(k) ?? def; }

function requireAuthWatch() {
  const s = requireAuth();
  if (!s) { location.href = '/'; throw new Error('unauthorized'); }
  return s;
}

function showOverlay(show) {
  const ov = document.getElementById('overlay');
  if (!ov) return;
  ov.classList.toggle('show', !!show);
}

async function safePlay(videoEl, wantUnmute=false) {
  if (!videoEl) return;
  if (wantUnmute) videoEl.muted = false;
  videoEl.playsInline = true;
  try { await videoEl.play(); } catch(e) { showOverlay(true); }
}

/** تطبيق إعداد الجودة على الـ publication المتاح */
async function applyQualitySetting(quality) {
  if (!lkRoom) return;
  const lk = window.livekit || {};
  const VideoQuality = lk.VideoQuality || { LOW: 'low', MEDIUM: 'medium', HIGH: 'high' };

  if (quality === 'auto') {
    try { lkRoom.setAdaptiveStream?.(true); } catch {}
    return;
  }

  try { lkRoom.setAdaptiveStream?.(false); } catch {}

  const pub = currentVideoPub;
  if (!pub) return;

  if (typeof pub.setSubscriptionSettings === 'function') {
    const vq =
      quality === 'low' ? VideoQuality.LOW :
      quality === 'high' ? VideoQuality.HIGH :
      VideoQuality.MEDIUM;
    try {
      await pub.setSubscriptionSettings({ videoQuality: vq });
      return;
    } catch {}
  }

  if (typeof pub.setVideoDimensions === 'function') {
    const dims = quality === 'low'
      ? { width: 320, height: 180 }
      : quality === 'high'
      ? { width: 1280, height: 720 }
      : { width: 640, height: 360 };
    try {
      await pub.setVideoDimensions(dims);
      return;
    } catch {}
  }
}

function wireQualitySelector() {
  const sel = document.getElementById('qualitySel');
  if (!sel) return;
  sel.addEventListener('change', () => {
    applyQualitySetting(sel.value);
  }, { passive: true });
}

// ===== Timeline Runner (Viewer) =====
let tlActive = false;
let tlStartAt = null;
let tlEvents = [];
let tlFired = new Set();
let tlPollTimer = null;
let tlTickTimer = null;
let tlContainer = null;

function tlClearOverlays() {
  if (!tlContainer) return;
  tlContainer.innerHTML = '';
}

function tlPlace(el, position='center') {
  el.style.position = 'absolute';
  el.style.maxWidth = '100%';
  el.style.maxHeight = '100%';
  el.style.pointerEvents = 'none';

  const reset = () => {
    el.style.top = el.style.right = el.style.bottom = el.style.left = '';
    el.style.transform = '';
    el.style.width = el.style.height = '';
  };
  reset();

  switch (position) {
    case 'full':
      el.style.inset = '0';
      el.style.objectFit = 'contain';
      break;
    case 'top-left':
      el.style.top = '10px'; el.style.left = '10px';
      el.style.width = '30%';
      break;
    case 'top-right':
      el.style.top = '10px'; el.style.right = '10px';
      el.style.width = '30%';
      break;
    case 'bottom-left':
      el.style.bottom = '10px'; el.style.left = '10px';
      el.style.width = '30%';
      break;
    case 'bottom-right':
      el.style.bottom = '10px'; el.style.right = '10px';
      el.style.width = '30%';
      break;
    default:
      el.style.top = '50%'; el.style.left = '50%';
      el.style.transform = 'translate(-50%,-50%)';
      el.style.width = '60%';
  }
}

function tlFire(ev) {
  const { type, durationMs, payload = {} } = ev;
  const pos = payload.position || 'center';
  const vol = (payload.volume == null ? 1 : Number(payload.volume));
  const z = (payload.zIndex == null ? 10 : Number(payload.zIndex));
  const opacity = (payload.opacity == null ? 1 : Number(payload.opacity));

  if (!tlContainer) return;
  let el = null;

  if (type === 'image') {
    el = document.createElement('img');
    el.src = payload.src || '';
    tlPlace(el, pos);
    el.style.zIndex = String(z);
    el.style.opacity = String(opacity);
    tlContainer.appendChild(el);
    setTimeout(()=>{ el.remove(); }, Math.max(0, durationMs||0));
  } else if (type === 'video') {
    el = document.createElement('video');
    el.src = payload.src || '';
    el.autoplay = true; el.muted = (vol <= 0); el.loop = false; el.controls = false; el.playsInline = true;
    el.style.objectFit = 'contain';
    tlPlace(el, pos);
    el.style.zIndex = String(z);
    el.style.opacity = String(opacity);
    el.oncanplay = () => { try { if (vol > 0) el.volume = Math.max(0, Math.min(1, vol)); el.play(); } catch{} };
    tlContainer.appendChild(el);
    setTimeout(()=>{ try { el.pause(); } catch{} el.remove(); }, Math.max(0, durationMs||0));
  } else if (type === 'audio') {
    el = document.createElement('audio');
    el.src = payload.src || '';
    el.autoplay = true; el.controls = false;
    el.style.display = 'none';
    tlContainer.appendChild(el);
    el.oncanplay = () => { try { el.volume = Math.max(0, Math.min(1, vol)); el.play(); } catch{} };
    setTimeout(()=>{ try { el.pause(); } catch{} el.remove(); }, Math.max(0, durationMs||0));
  } else if (type === 'text') {
    el = document.createElement('div');
    el.textContent = payload.text || '';
    el.style.background = 'rgba(0,0,0,0.45)';
    el.style.color = '#fff';
    el.style.padding = '10px 14px';
    el.style.borderRadius = '12px';
    el.style.fontWeight = '700';
    if (payload.style) el.style.cssText += ';' + payload.style;
    tlPlace(el, pos);
    el.style.zIndex = String(z);
    el.style.opacity = String(opacity);
    tlContainer.appendChild(el);
    setTimeout(()=>{ el.remove(); }, Math.max(0, durationMs||0));
  } else if (type === 'layout') {
    el = document.createElement('div');
    el.textContent = `Layout hint → ${payload.cameraKey || ''}`;
    el.className = 'tag';
    el.style.background = '#0ea5e9';
    el.style.color = '#fff';
    el.style.padding = '8px 12px';
    tlPlace(el, 'top-left');
    el.style.zIndex = '999';
    tlContainer.appendChild(el);
    setTimeout(()=>{ el.remove(); }, Math.max(0, durationMs||0));
  }
}

async function tlPollLoop(watchId) {
  const hdrs = { 'Authorization': 'Bearer ' + (API.session()?.token||'') };
  try {
    const r = await fetch(`/api/timeline/${watchId}`, { headers: hdrs });
    if (!r.ok) throw new Error('tl fetch fail');
    const t = await r.json();
    const wasActive = tlActive;
    tlActive = !!t?.active;
    tlStartAt = (t?.startAt || null);
    tlEvents = Array.isArray(t?.events) ? t.events.slice() : [];
    if (!tlActive) {
      tlFired.clear();
      tlClearOverlays();
    } else if (!wasActive) {
      tlFired.clear();
    }
  } catch (e) {
    // تجاهل مؤقت
  }
}

function tlTick() {
  if (!tlActive || !tlStartAt) return;
  const now = Date.now();
  const elapsed = now - tlStartAt;
  if (elapsed < 0) return;

  for (const ev of tlEvents) {
    const start = Number(ev.startOffsetMs||0);
    const end = start + Number(ev.durationMs||0);
    if (elapsed >= start && (ev.durationMs ? elapsed <= end : true)) {
      if (!tlFired.has(ev.id)) {
        tlFired.add(ev.id);
        tlFire(ev);
      }
    }
  }
}
function startTimelineRuntime(watchId) {
  tlContainer = document.getElementById('tl-container');
  if (tlPollTimer) clearInterval(tlPollTimer);
  if (tlTickTimer) clearInterval(tlTickTimer);
  tlPollLoop(watchId);
  tlPollTimer = setInterval(()=>tlPollLoop(watchId), 2000);
  tlTickTimer = setInterval(()=>tlTick(), 200);
}

// ===== تشغيل صفحة المشاهدة =====
async function start() {
  try {
    const s = requireAuthWatch();
    attachLogout(document.getElementById('logoutBtn'));
    wireQualitySelector();

    const id = qs('id');
    if (!id) { alert('لا توجد جلسة مشاهدة'); return; }

    const lk = await ensureLivekit();
    const { Room, RoomEvent, Track } = lk;

    const rec = await API.getWatch(id);
    if (!rec || !rec.active) {
      alert('جلسة المشاهدة غير فعّالة حالياً.');
      return;
    }

    const tk  = await API.token(rec.roomName, `viewer-${s.username}`, false, true);

    const player = document.getElementById('player');
    player.muted = true;
    player.playsInline = true;
    player.autoplay = true;

    lkRoom = new Room({ adaptiveStream: true, autoSubscribe: true });
    await lkRoom.connect(tk.url, tk.token);

    const attachVideo = (track, pub) => {
      currentVideoPub = pub || currentVideoPub;
      track.attach(player);
      safePlay(player, false);
      const sel = document.getElementById('qualitySel');
      if (sel && sel.value !== 'auto') applyQualitySetting(sel.value);
    };

    lkRoom.on(RoomEvent.TrackSubscribed, (track, pub) => {
      try {
        if (track.kind === Track.Kind.Video) {
          attachVideo(track, pub);
        } else if (track.kind === Track.Kind.Audio) {
          const a = document.getElementById('hidden-audio') || (() => {
            const el = document.createElement('audio');
            el.id = 'hidden-audio';
            el.style.display = 'none';
            document.body.appendChild(el);
            return el;
          })();
          track.attach(a);
        }
      } catch(e) {
        console.warn('[watch] attach error', e);
      }
    });

    const attachExisting = () => {
      lkRoom.remoteParticipants.forEach(p => {
        p.trackPublications.forEach(pub => {
          const t = pub.track;
          if (!t) return;
          if (t.kind === Track.Kind.Video) {
            attachVideo(t, pub);
          } else if (t.kind === Track.Kind.Audio) {
            const a = document.getElementById('hidden-audio') || (() => {
              const el = document.createElement('audio');
              el.id = 'hidden-audio';
              el.style.display = 'none';
              document.body.appendChild(el);
              return el;
            })();
            t.attach(a);
          }
        });
      });
    };
    attachExisting();
    lkRoom.on(RoomEvent.ParticipantConnected, attachExisting);

    document.getElementById('fsBtn')?.addEventListener('click', async () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else player.requestFullscreen?.();
    });
    document.getElementById('playBtn')?.addEventListener('click', async () => {
      await safePlay(player, true);
      showOverlay(false);
      const a = document.getElementById('hidden-audio');
      if (a) { try { a.muted = false; await a.play(); } catch {} }
    });

    setTimeout(() => { if (player.paused) showOverlay(true); }, 1200);

    // شغّل مجدول الـ Timeline
    startTimelineRuntime(id);
  } catch (e) {
    console.error('watch start error:', e);
    alert('تعذر فتح البث: ' + (e.message || e));
  }
}

start();
