// public/city.js
const { Room, createLocalTracks, LocalVideoTrack } = window.livekit || {};

let lkRoom = null;
let localTracks = [];

async function listDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const camSel = document.getElementById('camSel');
  const micSel = document.getElementById('micSel');
  camSel.innerHTML = ''; micSel.innerHTML = '';
  devices.filter(d=>d.kind==='videoinput').forEach(d=>{
    const o = document.createElement('option'); o.value=d.deviceId; o.textContent=d.label||d.deviceId; camSel.appendChild(o);
  });
  devices.filter(d=>d.kind==='audioinput').forEach(d=>{
    const o = document.createElement('option'); o.value=d.deviceId; o.textContent=d.label||d.deviceId; micSel.appendChild(o);
  });
  document.getElementById('devReady').textContent = '✅';
}

async function join() {
  try {
    AppCommon.ensureLivekitLoaded();
  } catch (e) {
    alert('فشل الاتصال: ' + e.message);
    return;
  }
  const s = requireAuth();
  if (!s || s.role !== 'city') return;

  const roomName = new URL(location.href).searchParams.get('room');
  const identity = s.username;

  const cameraId = document.getElementById('camSel').value || undefined;
  const micId = document.getElementById('micSel').value || undefined;

  try {
    localTracks = await createLocalTracks({ audio: { deviceId: micId }, video: { deviceId: cameraId } });
  } catch (e) {
    const ok = await AppCommon.warmupPermissions(true, true);
    if (!ok) return;
    localTracks = await createLocalTracks({ audio: { deviceId: micId }, video: { deviceId: cameraId } });
  }

  const tk = await API.token(roomName, identity, true, true);
  lkRoom = new Room({});
  await lkRoom.connect(tk.url, tk.token, { tracks: localTracks });

  const v = document.getElementById('preview');
  const vt = localTracks.find(t => t instanceof LocalVideoTrack);
  if (vt) vt.attach(v);

  document.getElementById('joinBtn').disabled = true;
  document.getElementById('leaveBtn').disabled = false;
}

async function leave() {
  try { if (lkRoom) lkRoom.disconnect(); } catch {}
  lkRoom = null;
  try { localTracks.forEach(t => t.stop()); } catch {}
  localTracks = [];
  document.getElementById('joinBtn').disabled = false;
  document.getElementById('leaveBtn').disabled = true;
}

document.addEventListener('DOMContentLoaded', async () => {
  const s = requireAuth();
  if (!s || s.role !== 'city') return;

  // إذا لم تُحمَّل المكتبة — نمنع الأعطال
  if (!window.livekit) {
    alert('LiveKit client did not load');
    return;
  }

  await listDevices();
  document.getElementById('grantBtn')?.addEventListener('click', () => AppCommon.warmupPermissions(true, true));
  document.getElementById('joinBtn')?.addEventListener('click', join);
  document.getElementById('leaveBtn')?.addEventListener('click', leave);
});
