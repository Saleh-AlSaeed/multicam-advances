// نعتمد مرجع ثابت للمكتبة منذ البداية
const LK = window.livekit;

let lkRoom = null;
let localTracks = [];
let devicesReady = false;

<!-- ضع هذا السكربت أعلى السكربتات الأخرى -->
<script>
(async () => {
  if (window.livekit) return; // محمّل مسبقًا

  const sources = [
    '/vendor/livekit-client.umd.min.js', // محلي (أفضل خيار)
    'https://cdnjs.cloudflare.com/ajax/libs/livekit-client/2.15.7/livekit-client.umd.js',
    'https://unpkg.com/@livekit/client@2.15.7/dist/livekit-client.umd.min.js',
  ];

  for (const src of sources) {
    try {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = false;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('failed: ' + src));
        document.head.appendChild(s);
      });
      if (window.livekit) {
        console.log('[LiveKit] loaded from', src);
        break;
      }
    } catch (e) {
      console.warn('[LiveKit] load failed:', e.message);
    }
  }

  if (!window.livekit) {
    alert('LiveKit client did not load (missing UMD).');
  }
})();
</script>
// UI helpers
function $(id){ return document.getElementById(id); }
function setStatus(ok, msg){
  const el = $('hwStatus');
  if(!el) return;
  el.textContent = msg || (ok ? 'الأجهزة ظاهرة.' : 'فشل الاتصال');
  el.style.color = ok ? '#16a34a' : '#dc2626';
}

async function listDevices() {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    const camSel = $('camSel');
    const micSel = $('micSel');
    camSel.innerHTML = '';
    micSel.innerHTML = '';
    devs.filter(d => d.kind === 'videoinput').forEach(d => {
      const o = document.createElement('option');
      o.value = d.deviceId; o.textContent = d.label || d.deviceId;
      camSel.appendChild(o);
    });
    devs.filter(d => d.kind === 'audioinput').forEach(d => {
      const o = document.createElement('option');
      o.value = d.deviceId; o.textContent = d.label || d.deviceId;
      micSel.appendChild(o);
    });
    devicesReady = true;
    setStatus(true, 'الأجهزة ظاهرة.');
  } catch (e) {
    console.error('enumerateDevices failed:', e);
    setStatus(false, 'أذونات الأجهزة مطلوبة');
  }
}

async function grantPermissions() {
  try {
    const camId = $('camSel').value || undefined;
    const micId = $('micSel').value || undefined;

    // إن لم توجد المكتبة لا تكمل
    if (!LK) {
      alert('LiveKit client did not load (missing UMD)');
      return;
    }

    // أنشئ مسارات محلية للمعاينة
    localTracks = await LK.createLocalTracks({
      audio: micId ? { deviceId: micId } : true,
      video: camId ? { deviceId: camId } : true
    });

    // اعرض الفيديو في المعاينة
    const LocalVideoTrack = LK.LocalVideoTrack;
    const v = $('preview');
    const vt = localTracks.find(t => t instanceof LocalVideoTrack);
    if (vt) vt.attach(v);

    await listDevices();
  } catch (e) {
    console.error('grantPermissions error:', e);
    alert('فشل منح الإذن: ' + (e?.message || e));
  }
}

async function join() {
  const s = requireAuth(); // من common.js
  if (!s || s.role !== 'city') { location.href = '/'; return; }

  try {
    $('joinBtn').disabled = true;

    if (!LK) {
      alert('LiveKit client did not load (window.livekit missing)');
      return;
    }

    const roomName = new URL(location.href).searchParams.get('room');
    const identity = s.username || 'city-user';

    // إن لم يكن لدينا مسارات محلية (لم يضغط منح الإذن)، أنشئها الآن
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

    // اطلب التوكن
    const tkResp = await API.token(roomName, identity, true, true);
    console.log('token response:', tkResp);

    if (!tkResp?.token || !tkResp?.url) {
      console.error('Bad token payload:', tkResp);
      alert('فشل الاتصال: لم نستلم token/url من السيرفر');
      return;
    }
    if (!/^wss:\/\//i.test(tkResp.url)) {
      console.error('LIVEKIT_URL must start with wss://. Got:', tkResp.url);
      alert('فشل الاتصال: LIVEKIT_URL غير صحيح (يجب أن يبدأ wss://)');
      return;
    }

    // اتصل بالغرفة
    lkRoom = new LK.Room({});
    await lkRoom.connect(tkResp.url, tkResp.token, { tracks: localTracks });

    $('leaveBtn').disabled = false;
    setStatus(true, 'متصل ✅');
  } catch (e) {
    console.error('join/connect error:', e);
    // أعرض السبب الحقيقي بدل الرسالة العامة
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
  } catch (e) {
    console.error('leave error:', e);
  }
}

(function init() {
  const s = requireAuth();
  if (!s || s.role !== 'city') { location.href = '/'; return; }

  // زر الخروج
  $('logoutBtn')?.addEventListener('click', async () => {
    try { await API.logout(); } finally { location.href = '/'; }
  });

  // اربط الأزرار
  $('grantBtn')?.addEventListener('click', grantPermissions);
  $('joinBtn')?.addEventListener('click', join);
  $('leaveBtn')?.addEventListener('click', leave);

  // أول تحميل: أظهر الأجهزة (قد يطلب إذن)
  listDevices();
})();
