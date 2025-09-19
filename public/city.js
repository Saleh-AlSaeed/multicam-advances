// City page logic
let lkRoom = null;
let localTracks = [];

function ensureAuthCity() {
  const s = requireAuth();
  if (!s || s.role !== 'city') location.href = '/';
  return s;
}

// 🟢 تحديث قائمة الأجهزة
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
      o.textContent = d.label || `كاميرا (${d.deviceId})`;
      camSel.appendChild(o);
    });

    devices.filter(d => d.kind === 'audioinput').forEach(d => {
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || `مايك (${d.deviceId})`;
      micSel.appendChild(o);
    });

    document.getElementById('status').textContent = 'الأجهزة جاهزة ✅';
  } catch (e) {
    document.getElementById('status').textContent = 'فشل في قراءة الأجهزة ❌';
    console.error(e);
  }
}

// 🟢 طلب إذن الكاميرا والمايك
async function requestPermissions() {
  try {
    document.getElementById('status').textContent = 'جاري طلب الإذن...';
    await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById('status').textContent = 'تم منح الإذن ✅';
    await listDevices();
  } catch (e) {
    document.getElementById('status').textContent = 'تم رفض الإذن ❌';
    alert('يجب منح إذن الكاميرا والمايك للاستمرار');
  }
}

// 🟢 الانضمام للغرفة
async function join() {
  try {
    const s = ensureAuthCity();
    const roomName = qs('room');
    const identity = s.username;

    const cameraId = document.getElementById('camSel').value || undefined;
    const micId = document.getElementById('micSel').value || undefined;

    // إنشاء التراكات المحلية
    localTracks = await window.livekit.createLocalTracks({
      audio: micId ? { deviceId: micId } : true,
      video: cameraId ? { deviceId: cameraId } : true
    });

    // طلب التوكن
    const tk = await API.token(roomName, identity, true, true);

    // إنشاء غرفة LiveKit
    lkRoom = new window.livekit.Room({});
    await lkRoom.connect(tk.url, tk.token, { tracks: localTracks });

    // عرض الفيديو المحلي
    const v = document.getElementById('preview');
    const vt = localTracks.find(t => t.kind === 'video');
    if (vt) vt.attach(v);

    document.getElementById('joinBtn').disabled = true;
    document.getElementById('leaveBtn').disabled = false;

    document.getElementById('status').textContent = 'تم الاتصال ✅';
  } catch (e) {
    console.error('join() error:', e);
    document.getElementById('status').textContent = 'فشل الاتصال ❌';
    alert('فشل الاتصال: ' + (e.message || e));
  }
}

// 🟢 مغادرة الغرفة
async function leave() {
  try {
    if (lkRoom) {
      lkRoom.disconnect();
      lkRoom = null;
    }
    localTracks.forEach(t => t.stop());
    localTracks = [];

    document.getElementById('joinBtn').disabled = false;
    document.getElementById('leaveBtn').disabled = true;
    document.getElementById('status').textContent = 'تمت المغادرة ✅';
  } catch (e) {
    console.error('leave() error:', e);
  }
}

// 🟢 التهيئة
(function init() {
  ensureAuthCity();
  logoutBtnHandler(document.getElementById('logoutBtn'));

  // زر منح الإذن
  const permBtn = document.getElementById('permBtn');
  if (permBtn) {
    permBtn.style.display = 'inline-block';
    permBtn.addEventListener('click', requestPermissions);
  }

  document.getElementById('joinBtn').addEventListener('click', join);
  document.getElementById('leaveBtn').addEventListener('click', leave);

  // تحديث الأجهزة أول ما تجهز الصفحة
  if (navigator.mediaDevices) {
    listDevices();
  }
})();
