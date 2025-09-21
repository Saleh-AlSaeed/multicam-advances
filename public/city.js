// ===== مدينة: نشر الكاميرا والمايك =====

// محمّل LiveKit مرن يحاول عدة مسارات (محلي ثم بدائل CDN) ويعطي سجل أخطاء واضح
let __lkLoading = null;
async function ensureLivekit(timeoutMs = 15000) {
  if (window.livekit) return window.livekit;

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload = () => setTimeout(() => resolve({ ok: !!window.livekit, url }), 0);
      s.onerror = () => reject(new Error('script failed: ' + url));
      document.head.appendChild(s);
    });
  }

  const candidates = [
    // ملفاتك المحلية داخل public/vendor
    '/vendor/livekit-client.umd.min.js',
    '/vendor/livekit-client.umd.js',
    '/vendor/livekit-client.js',
    // بدائل CDN (للنسخ الاحتياطية فقط)
    'https://cdn.jsdelivr.net/npm/livekit-client@2/dist/livekit-client.umd.min.js',
    'https://unpkg.com/livekit-client@2.15.7/dist/livekit-client.umd.js',
  ];

  if (!__lkLoading) {
    __lkLoading = (async () => {
      const errors = [];
      for (const u of candidates) {
        try {
          console.debug('[LK loader] trying:', u);
          const r = await loadScript(u);
          if (r.ok && window.livekit) {
            console.debug('[LK loader] loaded from:', r.url);
            return;
          }
          errors.push('loaded but window.livekit missing: ' + u);
        } catch (e) {
          errors.push(e.message || String(e));
        }
      }
      throw new Error('All candidates failed:\n' + errors.join('\n'));
    })();
  }

  await Promise.race([
    __lkLoading,
    new Promise((_, rej) => setTimeout(() => rej(new Error('LiveKit client did not load (timeout)')), timeoutMs)),
  ]);

  if (!window.livekit) throw new Error('LiveKit client did not load');
  return window.livekit;
}

// ===== صلاحيات وتخطيط الصفحة =====
let lkRoom = null;
let previewStream = null;
let hasPermission = false;

function ensureAuthCity() {
  const s = requireAuth();
  if (!s || s.role !== 'city') location.href = '/';
  return s;
}

// زر خروج احتياطي إن لم تُحمَّل دوال common.js بعد
function safeAttachLogout() {
  const btn = document.getElementById('logoutBtn');
  if (!btn) return;
  if (typeof window.attachLogout === 'function') {
    window.attachLogout(btn);
  } else {
    btn.onclick = null;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      try { localStorage.removeItem('session'); } catch(_) {}
      location.replace('/');
    }, { passive: false });
  }
}

// ===== التعامل مع الأجهزة =====
async function listDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const camSel = document.getElementById('camSel');
    const micSel = document.getElementById('micSel');
    camSel.innerHTML = '';
    micSel.innerHTML = '';

    devices.filter(d => d.kind === 'videoinput').forEach(d => {
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || d.deviceId;
      camSel.appendChild(o);
    });
    devices.filter(d => d.kind === 'audioinput').forEach(d => {
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || d.deviceId;
      micSel.appendChild(o);
    });

    if (devices.some(d => d.label)) {
      document.getElementById('status').textContent = 'الأجهزة ظاهرة.';
      hasPermission = true;
    } else {
      document.getElementById('status').textContent = 'أسماء الأجهزة غير ظاهرة — امنح الإذن أولاً.';
    }
  } catch {
    document.getElementById('status').textContent = 'تعذّر قراءة الأجهزة.';
  }
}

async function requestPermission() {
  try {
    const camId = document.getElementById('camSel').value || undefined;
    const micId = document.getElementById('micSel').value || undefined;

    previewStream = await navigator.mediaDevices.getUserMedia({
      video: camId ? { deviceId: { exact: camId } } : true,
      audio: micId ? { deviceId: { exact: micId } } : true
    });

    const v = document.getElementById('preview');
    v.srcObject = previewStream;
    v.play().catch(() => {});

    hasPermission = true;
    document.getElementById('status').textContent = 'تم منح الإذن.';
    await listDevices();
  } catch (e) {
    alert('لم يتم منح الإذن: ' + (e?.message || ''));
  }
}

// ===== الانضمام/المغادرة =====
async function join() {
  try {
    const lk = await ensureLivekit();
    const { Room, createLocalTracks, LocalVideoTrack } = lk;

    const s = ensureAuthCity();
    const roomName = qs('room');
    const identity = `${s.username}`;

    const cameraId = document.getElementById('camSel').value || undefined;
    const micId    = document.getElementById('micSel').value || undefined;

    if (!hasPermission) await requestPermission();

    const localTracks = await createLocalTracks({
      audio: micId ? { deviceId: micId } : true,
      video: cameraId ? { deviceId: cameraId } : true
    });

    const tk = await API.token(roomName, identity, true, true);
    const room = new Room({});
    await room.connect(tk.url, tk.token, { tracks: localTracks });

    const v = document.getElementById('preview');
    const vt = localTracks.find(t => t instanceof LocalVideoTrack);
    if (vt) vt.attach(v);

    lkRoom = room;
    document.getElementById('joinBtn').disabled = true;
    document.getElementById('leaveBtn').disabled = false;
    document.getElementById('status').textContent = 'متصل.';
  } catch (e) {
    console.error('[city] join error:', e);
    alert('فشل الاتصال: ' + (e?.message || e));
  }
}

async function leave() {
  try { if (lkRoom) { lkRoom.disconnect(); lkRoom = null; } } catch {}
  try { if (previewStream) { previewStream.getTracks().forEach(t => t.stop()); previewStream = null; } } catch {}
  const v = document.getElementById('preview'); if (v) v.srcObject = null;

  document.getElementById('joinBtn').disabled = false;
  document.getElementById('leaveBtn').disabled = true;
  document.getElementById('status').textContent = 'تمت المغادرة.';
}

// ===== تهيئة الصفحة =====
(function init() {
  ensureAuthCity();
  safeAttachLogout();

  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    document.getElementById('status').textContent = 'المتصفح لا يدعم enumerateDevices.';
  } else {
    listDevices();
  }

  document.getElementById('grantBtn').addEventListener('click', requestPermission, { passive: true });
  document.getElementById('joinBtn').addEventListener('click', join, { passive: false });
  document.getElementById('leaveBtn').addEventListener('click', leave, { passive: true });
})();
