let lkRoom = null;
let previewStream = null;  // للمعاينة قبل الاتصال
let hasPermission = false;

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
      document.getElementById('status').textContent = 'لم تُعرض أسماء الأجهزة — امنح الإذن أولاً.';
    }
  } catch (e) {
    document.getElementById('status').textContent = 'تعذّر قراءة الأجهزة.';
  }
}

async function requestPermission() {
  try {
    // اختر القيود الأولية (يمكن تغييرها لاحقًا من القوائم)
    const camId = document.getElementById('camSel').value || undefined;
    const micId = document.getElementById('micSel').value || undefined;

    previewStream = await navigator.mediaDevices.getUserMedia({
      video: camId ? { deviceId: { exact: camId } } : true,
      audio: micId ? { deviceId: { exact: micId } } : true
    });

    const v = document.getElementById('preview');
    v.srcObject = previewStream;
    v.play().catch(()=>{});

    hasPermission = true;
    document.getElementById('status').textContent = 'تم منح الإذن.';
    await listDevices(); // لتظهر أسماء الأجهزة
  } catch (e) {
    alert('لم يتم منح الإذن: ' + (e?.message || ''));
  }
}

async function join() {
  // تحقق من تحميل مكتبة LiveKit
  if (!window.livekit || !window.livekit.Room || !window.livekit.createLocalTracks) {
    alert('LiveKit client did not load');
    return;
  }
  const { Room, createLocalTracks, LocalVideoTrack } = window.livekit;

  const s = ensureAuthCity();
  const roomName = qs('room');
  const identity = `${s.username}`;

  const cameraId = document.getElementById('camSel').value || undefined;
  const micId    = document.getElementById('micSel').value || undefined;

  try {
    if (!hasPermission) await requestPermission();

    // أنشئ مسارات LiveKit من الأجهزة المختارة
    const localTracks = await createLocalTracks({
      audio: micId ? { deviceId: micId } : true,
      video: cameraId ? { deviceId: cameraId } : true
    });

    // اتصال LiveKit
    const tk = await API.token(roomName, identity, true, true);
    lkRoom = new Room({});
    await lkRoom.connect(tk.url, tk.token, { tracks: localTracks });

    // عيّن المعاينة على الفيديو المحلي المنشور
    const v = document.getElementById('preview');
    const vt = localTracks.find(t => t instanceof LocalVideoTrack);
    if (vt) vt.attach(v);

    document.getElementById('joinBtn').disabled = true;
    document.getElementById('leaveBtn').disabled = false;
    document.getElementById('status').textContent = 'متصل.';
  } catch (e) {
    alert('فشل الاتصال: ' + (e?.message || e));
  }
}

async function leave() {
  try {
    if (lkRoom) { lkRoom.disconnect(); lkRoom = null; }
  } catch {}
  try {
    if (previewStream) {
      previewStream.getTracks().forEach(t => t.stop());
      previewStream = null;
    }
  } catch {}
  const v = document.getElementById('preview');
  if (v) v.srcObject = null;

  document.getElementById('joinBtn').disabled = false;
  document.getElementById('leaveBtn').disabled = true;
  document.getElementById('status').textContent = 'تمت المغادرة.';
}

(function init() {
  ensureAuthCity();
  logoutBtnHandler(document.getElementById('logoutBtn'));

  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    document.getElementById('status').textContent = 'المتصفح لا يدعم enumerateDevices.';
  } else {
    listDevices();
  }

  document.getElementById('grantBtn').addEventListener('click', requestPermission, { passive: true });
  document.getElementById('joinBtn').addEventListener('click', join, { passive: false });
  document.getElementById('leaveBtn').addEventListener('click', leave, { passive: true });
})();
