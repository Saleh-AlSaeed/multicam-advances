// ===== لوحة المشرف =====

// محمّل LiveKit مرن مع سجلّ أخطاء واضح
let __lkLoading = null;
async function ensureLivekit(timeoutMs = 15000) {
  if (window.livekit) return window.livekit;

  async function loadScript(url) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload = () => {
        // أحيانًا يستغرق ربط window.livekit نبضة event loop واحدة
        setTimeout(() => resolve({ ok: !!window.livekit, url }), 0);
      };
      s.onerror = () => reject(new Error('script failed: ' + url));
      document.head.appendChild(s);
    });
  }

  const candidates = [
    '/vendor/livekit-client.umd.js'
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

  // مهلة قصوى
  await Promise.race([
    __lkLoading,
    new Promise((_, rej) => setTimeout(() => rej(new Error('LiveKit client did not load (timeout)')), timeoutMs)),
  ]);

  if (!window.livekit) throw new Error('LiveKit client did not load');
  return window.livekit;
}

function ensureAuth() {
  const s = requireAuth();
  if (!s || s.role !== 'admin') location.href = '/';
  return s;
}

// خروج آمن (بدل attachLogout غير المعرف أحيانًا)
function safeAttachLogout() {
  const btn = document.getElementById('logoutBtn');
  if (!btn) return;
  if (typeof window.attachLogout === 'function') window.attachLogout(btn);
  else {
    btn.onclick = null;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      try { localStorage.removeItem('session'); } catch (_) {}
      location.replace('/');
    }, { passive: false });
  }
}

const CITIES = [
  { label: 'مدينة رقم1', room: 'city-1' },
  { label: 'مدينة رقم2', room: 'city-2' },
  { label: 'مدينة رقم3', room: 'city-3' },
  { label: 'مدينة رقم4', room: 'city-4' },
  { label: 'مدينة رقم5', room: 'city-5' },
  { label: 'مدينة رقم6', room: 'city-6' },
];

let livekitUrl = null;
let cityRooms = [];
let composer = null;
let composite = null;

function layoutRects(n, W, H) {
  const rects = [];
  if (n === 1) rects.push({ x: 0, y: 0, w: W, h: H });
  else if (n === 2) { const w=W/2,h=H; rects.push({x:0,y:0,w,h},{x:w,y:0,w,h}); }
  else if (n === 3) { const w=W/3,h=H; for (let i=0;i<3;i++) rects.push({x:i*w,y:0,w,h}); }
  else if (n === 4) { const w=W/2,h=H/2; rects.push({x:0,y:0,w,h},{x:w,y:0,w,h},{x:0,y:h,w,h},{x:w,y:h,w,h}); }
  else if (n === 5) { const w=W/3,h=H/2; let i=0; for (let r=0;r<2;r++) for (let c=0;c<3;c++){ if(i<5) rects.push({x:c*w,y:r*h,w,h}); i++; } }
  else if (n === 6) { const w=W/3,h=H/2; for (let r=0;r<2;r++) for (let c=0;c<3;c++) rects.push({x:c*w,y:r*h,w,h}); }
  return rects;
}

async function connectCityPreviews() {
  ensureAuth();
  const lk = await ensureLivekit();
  const { Room, RoomEvent } = lk;

  const cfg = await API.getConfig();
  livekitUrl = cfg.LIVEKIT_URL;

  const grid = document.getElementById('previewGrid');
  grid.innerHTML = '';
  cityRooms = [];

  for (const item of CITIES) {
    const id = 'tile-' + item.room;
    const tile = document.createElement('div');
    tile.className = 'video-tile';
    tile.innerHTML = `
      <div class="meter"><i></i></div>
      <video id="${id}" autoplay playsinline muted></video>
      <div class="label">${item.label}</div>`;
    grid.appendChild(tile);

    const lkRoom = new Room({ adaptiveStream: true, dynacast: true });
    const identity = `admin-preview-${item.room}`;
    const tk = await API.token(item.room, identity, false, true);
    await lkRoom.connect(tk.url, tk.token);

    const videoEl = tile.querySelector('video');
    const meterFill = tile.querySelector('.meter > i');

    lkRoom.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === 'video') track.attach(videoEl);
      if (track.kind === 'audio') {
        try {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const src = audioCtx.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          src.connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);
          const loop = () => {
            analyser.getByteTimeDomainData(data);
            let sum=0; for (let i=0;i<data.length;i++){ const v=(data[i]-128)/128; sum+=v*v; }
            const rms = Math.sqrt(sum/data.length);
            meterFill.style.width = Math.min(100, Math.max(0, Math.round(rms*200))) + '%';
            requestAnimationFrame(loop);
          };
          loop();
        } catch(_) {}
      }
    });

    cityRooms.push({ ...item, lkRoom, tileEl: tile, videoEl, meterEl: meterFill });
  }
}

function openViewModal(){ document.getElementById('viewModal').classList.add('open'); renderSlots(); }
function closeViewModal(){ document.getElementById('viewModal').classList.remove('open'); }
function renderSlots(){
  const n = parseInt(document.getElementById('camCount').value, 10);
  const slots = document.getElementById('slots');
  slots.innerHTML = '';
  for (let i=0;i<n;i++){
    const field = document.createElement('fieldset');
    field.innerHTML = `
      <legend>كاميرا رقم ${i+1}</legend>
      <div class="grid cols-2">
        <div>
          <label>اختر المستخدم:</label>
          <select class="input userSel">
            ${CITIES.map(c => `<option value="${c.room}">${c.label}</option>`).join('')}
          </select>
        </div>
        <div>
          <label>خيارات:</label>
          <div class="controls-row">
            <label class="badge"><input type="checkbox" class="optVideo" checked> كاميرا</label>
            <label class="badge"><input type="checkbox" class="optAudio" checked> مايك</label>
          </div>
        </div>
      </div>`;
    slots.appendChild(field);
  }
}
function readSelectionFromUI(){
  const slots = [...document.querySelectorAll('#slots fieldset')];
  return slots.map(el => ({
    room: el.querySelector('.userSel').value,
    video: el.querySelector('.optVideo').checked,
    audio: el.querySelector('.optAudio').checked,
  }));
}

async function startComposer(rec){
  const lk = await ensureLivekit();
  const { Room, LocalVideoTrack, LocalAudioTrack } = lk;

  const s = API.session();
  const canvas = document.getElementById('mixerCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  const room = new Room({});
  const tk = await API.token(rec.roomName, `admin-composer-${s.username}`, true, false);
  await room.connect(tk.url, tk.token);

  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const dest = audioCtx.createMediaStreamDestination();

  const videos = [];
  for (const sel of rec.selection) {
    const vidEl = document.getElementById('tile-' + sel.room);
    videos.push(sel.video ? vidEl : null);
    if (sel.audio) {
      const city = cityRooms.find(c => c.room === sel.room);
      if (city) {
        city.lkRoom.remoteParticipants.forEach(p => {
          p.audioTracks.forEach(pub => {
            if (pub.track) {
              const src = audioCtx.createMediaStreamSource(new MediaStream([pub.track.mediaStreamTrack]));
              src.connect(dest);
            }
          });
        });
      }
    }
  }

  const vTrack = canvas.captureStream(30).getVideoTracks()[0];
  const localV = new LocalVideoTrack(vTrack);
  await room.localParticipant.publishTrack(localV, { name: 'composite' });

  const aTrack = dest.stream.getAudioTracks()[0];
  if (aTrack) {
    const localA = new LocalAudioTrack(aTrack);
    await room.localParticipant.publishTrack(localA, { name: 'mixed' });
  }

  const rects = layoutRects(rec.selection.length, W, H);
  let rafId = 0;
  function draw(){
    ctx.fillStyle = '#000'; ctx.fillRect(0,0,W,H);
    videos.forEach((v,i)=>{ const r=rects[i]; if(v&&r){ try{ ctx.drawImage(v,r.x,r.y,r.w,r.h);}catch(_){}}});
    rafId = requestAnimationFrame(draw);
  }
  draw();

  composer = {
    room,
    stop: async () => {
      try { cancelAnimationFrame(rafId); } catch(_){}
      try { [...room.localParticipant.tracks.values()].forEach(pub => { try{ pub.unpublish(); }catch(_){}}); } catch(_){}
      try { room.disconnect(); } catch(_){}
    }
  };
}

async function stopComposer(){ if (composer?.stop) { await composer.stop(); composer = null; } }
async function restartComposer(rec, selection){ await stopComposer(); await startComposer({ ...rec, selection }); }

async function createWatch(){
  const selection = readSelectionFromUI();
  if (selection.length === 0) return alert('اختر عدد الكاميرات');
  const rec = await API.createWatch(selection);
  closeViewModal();
  await startComposer(rec);
  document.getElementById('stopBtn').disabled = false;
  document.getElementById('goWatchBtn').disabled = false;
  alert('تم إنشاء غرفة المشاهدة: ' + rec.roomName);
}

async function applyChanges(){
  if (!composite) return openViewModal();
  const selection = readSelectionFromUI();
  await fetch(`/api/watch/${composite.id}`, {
    method: 'PUT',
    headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+API.session().token },
    body: JSON.stringify({ selection })
  });
  await restartComposer(composite, selection);
  alert('تم تطبيق التغييرات على البث الحالي.');
}

async function stopBroadcast(){
  if (!composite) return;
  await fetch(`/api/watch/${composite.id}/stop`, { method:'POST', headers: { 'Authorization':'Bearer '+API.session().token }});
  await stopComposer();
  document.getElementById('stopBtn').disabled = true;
  alert('تم إيقاف البث.');
}
function openWatchWindow(){
  if (!composite) return alert('أنشئ جلسة مشاهدة أولاً');
  window.open(`/watch.html?id=${composite.id}`, '_blank');
}

function setupUI(){
  document.getElementById('viewModeBtn').addEventListener('click', openViewModal);
  document.getElementById('closeModalBtn').addEventListener('click', closeViewModal);
  document.getElementById('camCount').addEventListener('change', renderSlots);
  document.getElementById('createWatchBtn').addEventListener('click', createWatch);
  document.getElementById('goWatchBtn').addEventListener('click', openWatchWindow);
  document.getElementById('applyBtn').addEventListener('click', applyChanges);
  document.getElementById('stopBtn').addEventListener('click', stopBroadcast);
  safeAttachLogout();
}

(async function init(){
  try {
    ensureAuth();
    setupUI();
    renderSlots();
    await ensureLivekit();       // ← أجبر التحميل هنا
    await connectCityPreviews(); // ← ثم اتصل بالمدن
  } catch (e) {
    console.error('[admin] ensureLivekit error:', e);
    alert(e.message || e);
  }
})();
