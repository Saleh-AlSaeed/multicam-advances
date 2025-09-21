// ===== لوحة المشرف (Admin) =====

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
let currentSelection = [];

async function ensureLivekit(timeoutMs = 12000) {
  if (window.livekit) return window.livekit;
  const t0 = Date.now();
  return new Promise((res, rej) => {
    const t = setInterval(() => {
      if (window.livekit) { clearInterval(t); res(window.livekit); }
      else if (Date.now() - t0 > timeoutMs) { clearInterval(t); rej(new Error('LiveKit client did not load')); }
    }, 50);
  });
}
function ensureAuth() { const s = requireAuth(); if (!s || s.role !== 'admin') location.href = '/'; return s; }

function attachAudioMeter(track, meterEl){
  try {
    const AC = new (window.AudioContext || window.webkitAudioContext)();
    const src = AC.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
    const an = AC.createAnalyser(); an.fftSize = 256; src.connect(an);
    const buf = new Uint8Array(an.frequencyBinCount);
    (function loop(){
      an.getByteTimeDomainData(buf);
      let sum=0; for(let i=0;i<buf.length;i++){ const v=(buf[i]-128)/128; sum+=v*v; }
      const rms = Math.sqrt(sum/buf.length);
      meterEl.style.width = Math.min(100, Math.round(rms*200)) + '%';
      requestAnimationFrame(loop);
    })();
  } catch {}
}

async function connectCityPreviews(){
  ensureAuth();
  const lk = await ensureLivekit();
  const { Room, RoomEvent, Track } = lk;

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

    const videoEl = tile.querySelector('video');
    const meterEl = tile.querySelector('.meter > i');

    // الاشتراك تلقائياً لتفادي حالات السباق
    const lkRoom = new Room({
      adaptiveStream: true,
      dynacast: true,
      autoSubscribe: true,
    });

    const identity = `admin-preview-${item.room}`;
    const tk = await API.token(item.room, identity, false, true);
    await lkRoom.connect(tk.url, tk.token);

    // 🔔 مهم: أي مسار يُنشر لاحقاً، نجبر الاشتراك فيه
    lkRoom.on(RoomEvent.TrackPublished, async (pub, participant) => {
      try { await pub.setSubscribed(true); } catch {}
    });

    // عند اكتمال الاشتراك بأي مسار، اربط الفيديو/المقياس وشغّل الفيديو فوراً
    lkRoom.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
      try {
        if (track.kind === Track.Kind.Video) {
          track.attach(videoEl);
          videoEl.muted = true;
          videoEl.playsInline = true;
          videoEl.autoplay = true;
          videoEl.play().catch(()=>{});
          console.log('[admin] attached video from', participant?.identity);
        } else if (track.kind === Track.Kind.Audio) {
          attachAudioMeter(track, meterEl);
          console.log('[admin] attached audio from', participant?.identity);
        }
      } catch (e) {
        console.warn('TrackSubscribed attach err:', e);
      }
    });

    // لو كانت المسارات منشورة قبل تركيب المستمعين، أرفقها الآن وأجبر الاشتراك
    const attachExisting = () => {
      lkRoom.remoteParticipants.forEach(p => {
        p.trackPublications.forEach(async (pub) => {
          try { await pub.setSubscribed(true); } catch {}
          const t = pub.track;
          if (t) {
            if (t.kind === Track.Kind.Video) {
              t.attach(videoEl);
              videoEl.muted = true;
              videoEl.playsInline = true;
              videoEl.autoplay = true;
              videoEl.play().catch(()=>{});
            } else if (t.kind === Track.Kind.Audio) {
              attachAudioMeter(t, meterEl);
            }
          } else {
            // لو ما توفر التراك بعد، اربطه عند الاشتراك
            pub.on?.('subscribed', (track) => {
              if (track.kind === Track.Kind.Video) {
                track.attach(videoEl);
                videoEl.muted = true;
                videoEl.playsInline = true;
                videoEl.autoplay = true;
                videoEl.play().catch(()=>{});
              } else if (track.kind === Track.Kind.Audio) {
                attachAudioMeter(track, meterEl);
              }
            });
          }
        });
      });
    };
    attachExisting();

    lkRoom.on(RoomEvent.ParticipantConnected, attachExisting);

    cityRooms.push({ ...item, lkRoom, tileEl: tile, videoEl, meterEl });
  }
}

function openViewModal(){ document.getElementById('viewModal').classList.add('open'); renderSlots(); }
function closeViewModal(){ document.getElementById('viewModal').classList.remove('open'); }
function renderSlots(){
  const n = parseInt(document.getElementById('camCount').value, 10);
  const slots = document.getElementById('slots'); slots.innerHTML = '';
  for (let i=0;i<n;i++){
    const f = document.createElement('fieldset');
    f.innerHTML = `
      <legend>كاميرا رقم ${i+1}</legend>
      <div class="grid cols-2">
        <div>
          <label>اختر المستخدم:</label>
          <select class="input userSel">
            ${CITIES.map(c=>`<option value="${c.room}">${c.label}</option>`).join('')}
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
    slots.appendChild(f);
  }
}
function readSelectionFromUI(){
  const slots = [...document.querySelectorAll('#slots fieldset')];
  return slots.map(el=>({
    room: el.querySelector('.userSel').value,
    video: el.querySelector('.optVideo').checked,
    audio: el.querySelector('.optAudio').checked,
  }));
}

function layoutRects(n,W,H){
  const r=[]; if(n===1) r.push({x:0,y:0,w:W,h:H});
  else if(n===2){const w=W/2,h=H;r.push({x:0,y:0,w,h},{x:w,y:0,w,h});}
  else if(n===3){const w=W/3,h=H;for(let i=0;i<3;i++)r.push({x:i*w,y:0,w,h});}
  else if(n===4){const w=W/2,h=H/2;r.push({x:0,y:0,w:h},{x:w,y:0,w,h},{x:0,y:h,w,h},{x:w,y:h,w,h});}
  else if(n===5){const w=W/3,h=H/2;let i=0;for(let rr=0;rr<2;rr++)for(let c=0;c<3;c++){if(i<5)r.push({x:c*w,y:rr*h,w,h});i++;}}
  else if(n===6){const w=W/3,h=H/2;for(let rr=0;rr<2;rr++)for(let c=0;c<3;c++)r.push({x:c*w,y:rr*h,w,h});}
  return r;
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

  const videos = [];
  for(const sel of rec.selection){
    const city = cityRooms.find(c=>c.room===sel.room);
    videos.push(sel.video && city ? city.videoEl : null);
  }

  const AC = new (window.AudioContext || window.webkitAudioContext)();
  const dest = AC.createMediaStreamDestination();
  for (const sel of rec.selection) {
    if (!sel.audio) continue;
    const city = cityRooms.find(c => c.room === sel.room);
    try {
      city?.lkRoom?.remoteParticipants?.forEach(p=>{
        p.audioTracks?.forEach(pub=>{
          if (pub.track?.mediaStreamTrack){
            const src = AC.createMediaStreamSource(new MediaStream([pub.track.mediaStreamTrack]));
            src.connect(dest);
          }
        });
      });
    } catch {}
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
  let raf=0;
  (function draw(){
    ctx.fillStyle = '#000'; ctx.fillRect(0,0,W,H);
    videos.forEach((v,i)=>{ const r=rects[i]; if(v&&r){ try{ ctx.drawImage(v,r.x,r.y,r.w,r.h);}catch{}}});
    raf = requestAnimationFrame(draw);
  })();

  composer = { room, stop: async ()=>{ try{cancelAnimationFrame(raf);}catch{} try{[...room.localParticipant.tracks.values()].forEach(p=>{try{p.unpublish();}catch{}});}catch{} try{room.disconnect();}catch{} } };
}
async function stopComposer(){ if (composer?.stop) await composer.stop(); composer=null; }
async function restartComposer(rec, sel){ await stopComposer(); await startComposer({ ...rec, selection: sel }); }

async function createWatch(){
  const selection = readSelectionFromUI();
  if(!selection.length) return alert('اختر عدد الكاميرات');
  const rec = await API.createWatch(selection);
  composite = rec; currentSelection = selection;
  closeViewModal(); await startComposer(rec);
  document.getElementById('stopBtn').disabled = false;
  document.getElementById('goWatchBtn').disabled = false;
  alert('تم إنشاء غرفة المشاهدة: ' + rec.roomName);
}
async function applyChanges(){
  if(!composite) return openViewModal();
  const selection = readSelectionFromUI(); currentSelection = selection;
  await fetch(`/api/watch/${composite.id}`, {
    method:'PUT',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+API.session().token},
    body: JSON.stringify({ selection })
  });
  await restartComposer(composite, selection);
  alert('تم تطبيق التغييرات على البث الحالي.');
}
async function stopBroadcast(){
  if (!composite) return;
  await fetch(`/api/watch/${composite.id}/stop`, { method:'POST', headers:{ 'Authorization':'Bearer '+API.session().token }});
  await stopComposer();
  document.getElementById('stopBtn').disabled = true;
  alert('تم إيقاف البث.');
}
function openWatchWindow(){ if(!composite) return alert('أنشئ جلسة مشاهدة أولاً'); window.open(`/watch.html?id=${composite.id}`,'_blank'); }

function setupUI(){
  document.getElementById('viewModeBtn').addEventListener('click', openViewModal);
  document.getElementById('closeModalBtn').addEventListener('click', closeViewModal);
  document.getElementById('camCount').addEventListener('change', renderSlots);
  document.getElementById('createWatchBtn').addEventListener('click', createWatch);
  document.getElementById('goWatchBtn').addEventListener('click', openWatchWindow);
  document.getElementById('applyBtn').addEventListener('click', applyChanges);
  document.getElementById('stopBtn').addEventListener('click', stopBroadcast);
  attachLogout(document.getElementById('logoutBtn'));
}

(async function init(){
  ensureAuth();
  setupUI();
  renderSlots();
  await connectCityPreviews();
})();
