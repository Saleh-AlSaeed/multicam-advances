// ===== لوحة المشرف: معاينة غرف المدن + إنشاء/إيقاف جلسة المشاهدة =====

let lk = null;
const CITY_ROOMS = ['city-1','city-2','city-3','city-4','city-5','city-6'];

const state = {
  rooms: new Map(),          // roomName -> { room }
  currentWatch: null,        // { id, roomName, selection, active }
  monitorAudio: false,
};

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
  if (wantUnmute) videoEl.muted = false;
  videoEl.playsInline = true;
  videoEl.autoplay = true;
  videoEl.play().catch(()=>{});
}

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
    v.muted = true; // للسماح بـ autoplay
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
    a.muted = !state.monitorAudio;
    if (!a.muted) a.play().catch(()=>{});
    console.log(`[admin] 🎧 attached AUDIO for ${roomName} (muted=${a.muted})`);
  } catch (e) {
    console.warn(`[admin] attachAudio failed for ${roomName}:`, e);
  }
}

/** إجبار الاشتراك على جميع الـ publications المتاحة */
async function forceSubscribeAll(room) {
  try {
    const { Track } = lk;
    room.remoteParticipants.forEach(p => {
      p.trackPublications.forEach(pub => {
        try {
          // بعض إصدارات LiveKit توفّر setSubscribed(boolean)
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
  // ملاحظـة: نوقف adaptiveStream للمعاينة لنجبر الاشتراك
  const room = new lk.Room({ adaptiveStream: false, autoSubscribe: true });
  room.name = roomName;

  const { RoomEvent, Track, ConnectionState } = lk;

  room.on(RoomEvent.ConnectionStateChanged, (state) => {
    console.log(`[admin] ${roomName} connState=`, state);
  });

  room.on(RoomEvent.TrackSubscribed, (track /* RemoteTrack */, pub, participant) => {
    try {
      if (track.kind === Track.Kind.Video) attachVideo(roomName, track);
      else if (track.kind === Track.Kind.Audio) attachAudio(roomName, track);
      console.log(`[admin] ➕ TrackSubscribed ${track.kind} from ${participant?.identity} in ${roomName}`);
    } catch(e){ console.warn('[admin] attach on TrackSubscribed error', e); }
  });

  room.on(RoomEvent.TrackPublished, async (pub, participant) => {
    // أحيانًا يُطلق هذا قبل الاشتراك التلقائي — نجرب الاشتراك يدويًا
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

  room.on(RoomEvent.TrackUnsubscribed, (track /* RemoteTrack */) => {
    try { track.detach(); } catch {}
    console.log(`[admin] ➖ TrackUnsubscribed ${track?.kind} in ${roomName}`);
  });

  await room.connect(tk.url, tk.token);
  console.log(`[admin] ✅ connected to ${roomName}`);

  // فور الاتصال، أجبر الاشتراك على الموجود حالياً
  await forceSubscribeAll(room);

  state.rooms.set(roomName, { room });
}

async function startPreview() {
  const s = API.session();
  if (!s || s.role !== 'admin') {
    location.href = '/'; return;
  }
  lk = await ensureLivekit();

  // (اختياري) رفع مستوى التسجيل لمعرفة أين يتوقف
  try { lk.setLogLevel?.('info'); } catch {}

  buildPreviewGrid();

  // صِل لكل غرف المدن كمشترك فقط
  for (let i=0;i<CITY_ROOMS.length;i++){
    const rn = CITY_ROOMS[i];
    try {
      await connectRoom(rn, `admin-${s.username}-${i+1}`);
    } catch (e) {
      console.warn('[admin] failed to connect', rn, e?.message || e);
    }
  }
}

function wireTopbar() {
  const monitor = document.getElementById('monitorAudio');
  monitor?.addEventListener('change', () => {
    state.monitorAudio = !!monitor.checked;
    document.querySelectorAll('audio[data-room]').forEach(a => {
      a.muted = !state.monitorAudio;
      if (!a.muted) a.play().catch(()=>{});
    });
  }, { passive: true });

  document.getElementById('viewModeBtn')?.addEventListener('click', openViewModal);
  document.getElementById('closeModalBtn')?.addEventListener('click', closeViewModal);
  document.getElementById('createWatchBtn')?.addEventListener('click', createWatchFromModal);
  document.getElementById('applyBtn')?.addEventListener('click', applySelectionToWatch);
  document.getElementById('stopBtn')?.addEventListener('click', stopWatch);
  document.getElementById('goWatchBtn')?.addEventListener('click', goWatchNow);
}

function openViewModal() {
  const modal = document.getElementById('viewModal');
  const sel = document.getElementById('camCount');
  const slots = document.getElementById('slots');

  const rebuild = () => {
    const n = parseInt(sel.value, 10) || 6;
    slots.innerHTML = '';
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
        ])
      ]);
      slots.appendChild(wrap);
    }
  };

  sel.onchange = rebuild;
  rebuild();
  modal.classList.add('open');
}
function closeViewModal(){ document.getElementById('viewModal')?.classList.remove('open'); }

function readSelectionFromSlots() {
  const sel = document.getElementById('camCount');
  const n = parseInt(sel.value, 10) || 6;
  const out = [];
  for (let i=0;i<n;i++){
    const s = document.getElementById(`slot-${i}`);
    if (s && s.value) out.push(s.value);
  }
  return out;
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
      method:'PUT',
      headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + (s?.token||'') },
      body: JSON.stringify({ selection })
    });
    if (!r.ok) throw new Error('apply failed');
    const rec = await r.json();
    state.currentWatch = rec;
    alert('تم تطبيق التغييرات.');
  } catch (e) {
    alert('تعذر تطبيق التغييرات'); console.error(e);
  }
}

async function stopWatch() {
  try {
    if (!state.currentWatch?.id) {
      const active = await API.getActiveWatch();
      if (!active) { alert('لا توجد جلسة نشطة'); return; }
      state.currentWatch = active;
    }
    const s = API.session();
    const r = await fetch('/api/watch/' + state.currentWatch.id + '/stop', {
      method:'POST',
      headers: { 'Authorization':'Bearer ' + (s?.token||'') }
    });
    if (!r.ok) throw new Error('stop failed');
    state.currentWatch.active = false;
    document.getElementById('stopBtn').disabled = true;
    alert('تم إيقاف البث.');
  } catch (e) {
    alert('تعذر الإيقاف'); console.error(e);
  }
}

async function goWatchNow() {
  try {
    const rec = state.currentWatch?.id ? state.currentWatch : (await API.getActiveWatch());
    if (!rec) { alert('لا توجد جلسة نشطة'); return; }
    window.open('/watch.html?id=' + rec.id, '_blank');
  } catch (e) {
    alert('تعذر فتح المشاهدة'); console.error(e);
  }
}

(async function init() {
  const s = API.session();
  if (!s || s.role !== 'admin') { location.href = '/'; return; }

  const lo = document.getElementById('logoutBtn');
  lo?.addEventListener('click', async (e) => {
    e.preventDefault();
    try { await API.logout(); } catch {}
    try { localStorage.removeItem('session'); } catch {}
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
    }
  } catch {}
})();
