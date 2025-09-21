// ===== صفحة المدينة: اتصال الكاميرا/المايك وبثّهما إلى غرفة المدينة =====

let lkRoom = null;
let previewStream = null;
let hasPermission = false;

// انتظار توفر window.livekit (الـ UMD) قبل أي استخدام
async function ensureLivekit(timeoutMs = 15000) {
  if (window.livekit) return window.livekit;
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const t = setInterval(() => {
      if (window.livekit) {
        clearInterval(t);
        resolve(window.livekit);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(t);
        reject(new Error('LiveKit client did not load'));
      }
    }, 50);
  });
}

function ensureAuthCity() {
  const s = requireAuth();
  if (!s || s.role !== 'city') location.href = '/';
  return s;
}

async function listDevices() {
  const status = document.getElementById('status');
  try {
    if (!navigator.mediaDevices?.enumerateDevices) {
      status.textContent = 'المتصفح لا يدعم enumerateDevices.';
      return;
    }
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

    if (devices.some(d => d.label)) {
      status.textContent = 'الأجهزة ظاهرة.';
      hasPermission = true;
    } else {
      status.textContent = 'أسماء الأجهزة غير ظاهرة — امنح الإذن أولاً.';
    }
  } catch (e) {
    console.error('listDevices error:', e);
    status.textContent = 'تعذّر قراءة الأجهزة.';
  }
}

async function requestPermission() {
  const status = document.getElementById('status');
  try {
    const camId = document.getElementById('camSel').value || undefined;
    const micId = document.getElementById('micSel').value || undefined;

    // طلب إذن وتشغيل المعاينة
    previewStream = await navigator.mediaDevices.getUserMedia({
      video: camId ? { deviceId: { exact: camId } } : true,
      audio: micId ? { deviceId: { exact: micId } } : true
    });

    const v = document.getElementById('preview');
    v.srcObject = previewStream;
    v.play?.().catch(()=>{});

    hasPermission = true;
    status.textContent = 'تم منح الإذن.';
    // بعد الإذن تظهر أسماء الأجهزة بوضوح
    await listDevices();
  } catch (e) {
    console.error('requestPermission error:', e);
    alert('لم يتم منح الإذن: ' + (e?.message || ''));
  }
}

async function join() {
  const status = document.getElementById('status');
  try {
    // تأكد من تحميل UMD
    const lk = await ensureLivekit();
    const { Room, createLocalTracks, LocalVideoTrack } = lk;

    const s = ensureAuthCity();
    const roomName = qs('room');
    const identity = `${s.username}`;

    const cameraId = document.getElementById('camSel').value || undefined;
    const micId    = document.getElementById('micSel').value || undefined;

    // تأكد من الإذن قبل الاتصال
    if (!hasPermission) {
      await requestPermission();
      if (!hasPermission) throw new Error('لم يتم منح إذن الكاميرا/المايك');
    }

    // تجهيز التراكات المحلية بناءً على اختيار المستخدم
    const localTracks = await createLocalTracks({
      audio: micId ? { deviceId: micId } : true,
      video: cameraId ? { deviceId: cameraId } : true
    });

    // توكن + اتصال
    const tk = await API.token(roomName, identity, true, true);
    const room = new Room({});
    await room.connect(tk.url, tk.token, { tracks: localTracks });

    // عرض المعاينة من التراك نفسه (لضمان المطابقة)
    const v = document.getElementById('preview');
    const vt = localTracks.find(t => t instanceof LocalVideoTrack);
    if (vt) vt.attach(v);

    // حفظ الريفرنس وتعطيل/تمكين الأزرار
    lkRoom = room;
    document.getElementById('joinBtn').disabled = true;
    document.getElementById('leaveBtn').disabled = false;
    status.textContent = 'متصل.';
  } catch (e) {
    console.error('join error:', e);
    alert('فشل الاتصال: ' + (e?.message || e));
    status.textContent = 'فشل الاتصال.';
  }
}

async function leave() {
  try {
    if (lkRoom) { lkRoom.disconnect(); lkRoom = null; }
  } catch (e) {
    console.warn('leave room err:', e);
  }
  try {
    if (previewStream) {
      previewStream.getTracks().forEach(t => t.stop());
      previewStream = null;
    }
  } catch (e) {
    console.warn('stop preview err:', e);
  }
  const v = document.getElementById('preview');
  if (v) v.srcObject = null;

  document.getElementById('joinBtn').disabled = false;
  document.getElementById('leaveBtn').disabled = true;
  document.getElementById('status').textContent = 'تمت المغادرة.';
}

(function init() {
  ensureAuthCity();

  // ربط الخروج (موجود أيضاً في common.js كاحتياط)
  const lo = document.getElementById('logoutBtn');
  lo?.addEventListener('click', async (e) => {
    e.preventDefault();
    try { await API.logout(); } catch(_) {}
    try { localStorage.removeItem('session'); } catch(_) {}
    location.replace('/');
  }, { passive:false });

  // بداية: قراءة الأجهزة، وتحديثها عند تغيّر الأجهزة
  listDevices();
  if (navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', listDevices);
  }

  document.getElementById('grantBtn').addEventListener('click', requestPermission, { passive:true });
  document.getElementById('joinBtn').addEventListener('click', join, { passive:false });
  document.getElementById('leaveBtn').addEventListener('click', leave, { passive:true });
})();
