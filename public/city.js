// ===== صفحة المدينة (جهاز ناشر) =====

let lkRoom = null;
let localTracks = [];

// انتظر تحميل LiveKit من الـ CDN (مع مهلة)
async function ensureLivekit(timeoutMs = 12000) {
  if (window.livekit) return window.livekit;
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const t = setInterval(() => {
      if (window.livekit) { clearInterval(t); resolve(window.livekit); }
      else if (Date.now() - started > timeoutMs) { clearInterval(t); reject(new Error('LiveKit client did not load')); }
    }, 50);
  });
}

function ensureAuthCity() {
  const s = requireAuth();
  if (!s || s.role !== 'city') location.href = '/';
  return s;
}

async function listDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const camSel = document.getElementById('camSel');
    const micSel = document.getElementById('micSel');
    camSel.innerHTML = ''; micSel.innerHTML = '';

    devices.filter(d => d.kind === 'videoinput').forEach(d => {
      const o = document.createElement('option');
      o.value = d.deviceId; o.textContent = d.label || d.deviceId;
      camSel.appendChild(o);
    });
    devices.filter(d => d.kind === 'audioinput').forEach(d => {
      const o = document.createElement('option');
      o.value = d.deviceId; o.textContent = d.label || d.deviceId;
      micSel.appendChild(o);
    });

    document.getElementById('status').textContent = 'الأجهزة جاهزة ✅';
  } catch (e) {
    console.error(e);
    document.getElementById('status').textContent = 'تعذر قراءة الأجهزة ❌';
  }
}

async function requestPermissions() {
  try {
    document.getElementById('status').textContent = 'جاري طلب الإذن...';
    await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById('status').textContent = 'تم منح الإذن ✅';
    await listDevices();
  } catch (e) {
    alert('يجب منح إذن الكاميرا/المايك.');
    document.getElementById('status').textContent = 'تم رفض الإذن ❌';
  }
}

async function join() {
  try {
    const s = ensureAuthCity();
    const lk = await ensureLivekit();       // ← تأكد من جاهزية LiveKit
    const { Room, createLocalTracks } = lk;

    const roomName = qs('room');
    const identity = s.username;
    const camId = document.getElementById('camSel').value || undefined;
    const micId = document.getElementById('micSel').value || undefined;

    // tracks محلية
    localTracks = await createLocalTracks({
      video: camId ? { deviceId: camId } : true,
      audio: micId ? { deviceId: micId } : true
    });

    // توكن + اتصال
    const tk = await API.token(roomName, identity, true, true);
    lkRoom = new Room({});
    await lkRoom.connect(tk.url, tk.token, { tracks: localTracks });

    // عرض المعاينة
    const v = document.getElementById('preview');
    const vTrack = localTracks.find(t => t.kind === 'video');
    if (vTrack) vTrack.attach(v);

    document.getElementById('joinBtn').disabled = true;
    document.getElementById('leaveBtn').disabled = false;
    document.getElementById('status').textContent = 'تم الاتصال ✅';
  } catch (e) {
    console.error('join error:', e);
    alert('فشل الاتصال: ' + (e.message || e));
    document.getElementById('status').textContent = 'فشل الاتصال ❌';
  }
}

async function leave() {
  try {
    if (lkRoom) { lkRoom.disconnect(); lkRoom = null; }
    localTracks.forEach(t => t.stop());
    localTracks = [];
  } catch (_) {}
  document.getElementById('joinBtn').disabled = false;
  document.getElementById('leaveBtn').disabled = true;
  document.getElementById('status').textContent = 'تمت المغادرة ✅';
}

(function init() {
  ensureAuthCity();
  logoutBtnHandler(document.getElementById('logoutBtn'));

  // أزرار
  document.getElementById('permBtn')?.addEventListener('click', requestPermissions);
  document.getElementById('joinBtn').addEventListener('click', join);
  document.getElementById('leaveBtn').addEventListener('click', leave);

  if (navigator.mediaDevices) listDevices();
  else document.getElementById('status').textContent = 'لا يتوفر MediaDevices في هذا المتصفح ❌';
})();
