let lkRoom = null;
let previewStream = null;
let hasPermission = false;

function ensureAuthCity() {
  const s = requireAuth();
  if (!s || s.role !== 'city') location.href = '/';
  return s;
}

async function ensureLivekit(timeoutMs = 12000) {
  if (window.livekit && window.livekit.Room) return window.livekit;
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const t = setInterval(() => {
      if (window.livekit && window.livekit.Room) {
        clearInterval(t); resolve(window.livekit);
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(t); reject(new Error('LiveKit client did not load'));
      }
    }, 50);
  });
}

async function listDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const camSel = document.getElementById('camSel');
    const micSel = document.getElementById('micSel');
    camSel.innerHTML = ''; micSel.innerHTML = '';

    devices.filter(d => d.kind === 'videoinput').forEach(d => {
      const o = document.createElement('option'); o.value = d.deviceId; o.textContent = d.label || d.deviceId; camSel.appendChild(o);
    });
    devices.filter(d => d.kind === 'audioinput').forEach(d => {
      const o = document.createElement('option'); o.value = d.deviceId; o.textContent = d.label || d.deviceId; micSel.appendChild(o);
    });

    if (devices.some(d => d.label)) { document.getElementById('status').textContent = 'الأجهزة ظاهرة.'; hasPermission = true; }
    else { document.getElementById('status').textContent = 'أسماء الأجهزة غير ظاهرة — امنح الإذن أولاً.'; }
  } catch { document.getElementById('status').textContent = 'تعذّر قراءة الأجهزة.'; }
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
    v.srcObject = previewStream; v.play().catch(()=>{});

    hasPermission = true;
    document.getElementById('status').textContent = 'تم منح الإذن.';
    await listDevices();
  } catch (e) {
    alert('لم يتم منح الإذن: ' + (e?.message || ''));
  }
}

async function join() {
  try {
    const lk = await ensureLivekit(); // ← يضمن أن UMD محمّل
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

(async function init() {
  ensureAuthCity();

  const lo = document.getElementById('logoutBtn');
  if (lo) lo.addEventListener('click', (e)=>{ e.preventDefault(); }, { passive:false });

  // عطّل زر الاتصال حتى نتأكد من وجود livekit
  const joinBtn = document.getElementById('joinBtn');
  joinBtn.disabled = true;
  ensureLivekit().then(() => { joinBtn.disabled = false; }).catch(() => { /* ستظهر رسالة عند الضغط */ });

  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    document.getElementById('status').textContent = 'المتصفح لا يدعم enumerateDevices.';
  } else {
    listDevices();
  }

  document.getElementById('grantBtn').addEventListener('click', requestPermission, { passive:true });
  joinBtn.addEventListener('click', join, { passive:false });
  document.getElementById('leaveBtn').addEventListener('click', leave, { passive:true });
})();
