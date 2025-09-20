// مرجع ثابت للمكتبة
const LK = window.livekit;

let lkRoom = null;
let localTracks = [];

function $(id){ return document.getElementById(id); }
function setStatus(ok, msg){
  const el = $('hwStatus'); if (!el) return;
  el.textContent = msg || (ok ? 'الأجهزة ظاهرة.' : 'فشل');
  el.style.color = ok ? '#16a34a' : '#dc2626';
}

async function listDevices() {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    const camSel = $('camSel'), micSel = $('micSel');
    camSel.innerHTML = ''; micSel.innerHTML = '';
    devs.filter(d=>d.kind==='videoinput').forEach(d=>{
      const o = document.createElement('option'); o.value=d.deviceId; o.textContent=d.label||d.deviceId; camSel.appendChild(o);
    });
    devs.filter(d=>d.kind==='audioinput').forEach(d=>{
      const o = document.createElement('option'); o.value=d.deviceId; o.textContent=d.label||d.deviceId; micSel.appendChild(o);
    });
    setStatus(true, 'الأجهزة ظاهرة.');
  } catch (e) {
    console.error('enumerateDevices:', e);
    setStatus(false, 'أذونات الأجهزة مطلوبة');
  }
}

async function grantPermissions() {
  try {
    if (!LK) { alert('LiveKit client did not load (missing UMD).'); return; }
    const camId = $('camSel').value || undefined;
    const micId = $('micSel').value || undefined;

    localTracks = await LK.createLocalTracks({
      audio: micId ? { deviceId: micId } : true,
      video: camId ? { deviceId: camId } : true
    });

    const LocalVideoTrack = LK.LocalVideoTrack;
    const v = $('preview');
    const vt = localTracks.find(t => t instanceof LocalVideoTrack);
    if (vt) vt.attach(v);

    await listDevices();
  } catch (e) {
    console.error('grantPermissions:', e);
    alert('فشل منح الإذن: ' + (e?.message || e));
  }
}

async function join() {
  const s = requireAuth(); if (!s || s.role !== 'city') return;

  // لا تُظهر رسالة "client did not load" إلا إن كانت فعلاً غير محمّلة
  if (!LK) { alert('LiveKit client did not load (missing UMD).'); return; }

  $('joinBtn').disabled = true;
  try {
    // لو ما في Tracks (لم يضغط منح الإذن) ننشئها الآن
    if (!localTracks.length) {
      const camId = $('camSel').value || undefined;
      const micId = $('micSel').value || undefined;
      localTracks = await LK.createLocalTracks({
        audio: micId ? { deviceId: micId } : true,
        video: camId ? { deviceId: camId } : true
      });
      const LocalVideoTrack = LK.LocalVideoTrack;
      const v = $('preview');
      const vt = localTracks.find(t => t instanceof LocalVideoTrack);
      if (vt) vt.attach(v);
    }

    const roomName = qs('room', 'city-1');
    const identity = s.username || 'city-user';

    // token
    let tk;
    try {
      tk = await API.token(roomName, identity, true, true);
    } catch (err) {
      console.error('token error:', err);
      alert('فشل التوكن: ' + err.message);
      return;
    }

    if (!tk?.token || !tk?.url) {
      console.error('Bad token payload:', tk);
      alert('فشل الاتصال: لم نستلم token/url صحيحين من السيرفر');
      return;
    }
    if (!/^wss:\/\//i.test(tk.url)) {
      console.error('LIVEKIT_URL invalid:', tk.url);
      alert('فشل الاتصال: LIVEKIT_URL غير صحيح (يجب أن يبدأ wss://)');
      return;
    }

    lkRoom = new LK.Room({});
    await lkRoom.connect(tk.url, tk.token, { tracks: localTracks });

    $('leaveBtn').disabled = false;
    setStatus(true, 'متصل ✅');
  } catch (e) {
    console.error('connect error:', e);
    alert('فشل الاتصال: ' + (e?.message || e));
  } finally {
    $('joinBtn').disabled = false;
  }
}

async function leave() {
  try {
    if (lkRoom) { lkRoom.disconnect(); lkRoom = null; }
    localTracks.forEach(t => t.stop());
    localTracks = [];
    $('leaveBtn').disabled = true;
    setStatus(false, 'مغادرة');
  } catch (e) { console.error('leave:', e); }
}

(function init() {
  const s = requireAuth();
  if (!s || s.role !== 'city') { location.href = '/'; return; }

  logoutBtnHandler($('logoutBtn'));
  $('grantBtn')?.addEventListener('click', grantPermissions);
  $('joinBtn')?.addEventListener('click', join);
  $('leaveBtn')?.addEventListener('click', leave);

  listDevices();
})();
