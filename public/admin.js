const { Room, RoomEvent, LocalVideoTrack, LocalAudioTrack } = window.livekit;

const CITIES = [
  { label: 'مدينة رقم 1', room: 'city-1' },
  { label: 'مدينة رقم 2', room: 'city-2' },
  { label: 'مدينة رقم 3', room: 'city-3' },
  { label: 'مدينة رقم 4', room: 'city-4' },
  { label: 'مدينة رقم 5', room: 'city-5' },
  { label: 'مدينة رقم 6', room: 'city-6' },
];

let livekitUrl = null;
let cityRooms = [];
let composite = null;
let composer = null;
let currentSelection = [];

function ensureAuth() {
  const s = requireAuth();
  if (!s || s.role !== 'admin') { location.href = '/'; }
  return s;
}

async function connectCityPreviews() {
  ensureAuth();
  const cfg = await API.getConfig();
  livekitUrl = cfg.LIVEKIT_URL;

  const grid = document.getElementById('previewGrid');
  grid.innerHTML = '';
  cityRooms = [];

  for (const item of CITIES) {
    const id = 'tile-' + item.room;
    const tile = document.createElement('div');
    tile.className = 'video-tile';
    tile.innerHTML = `<div class="meter"><i></i></div><video id="${id}" autoplay playsinline muted></video><div class="label">${item.label}</div>`;
    grid.appendChild(tile);

    const lkRoom = new Room({ adaptiveStream: true, dynacast: true });
    const identity = `admin-preview-${item.room}`;
    const tk = await API.token(item.room, identity, false, true);
    await lkRoom.connect(tk.url, tk.token);

    const videoEl = tile.querySelector('video');
    const meterFill = tile.querySelector('.meter > i');

    let audioCtx = null;
    let analyser = null;
    let rafId = null;

    lkRoom.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
      if (track.kind === 'video') {
        track.attach(videoEl);
      }
      if (track.kind === 'audio') {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const ms = new MediaStream([track.mediaStreamTrack]);
        const src = audioCtx.createMediaStreamSource(ms);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);

        const data = new Uint8Array(analyser.frequencyBinCount);
        const loop = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i=0;i<data.length;i++) {
            const v = (data[i]-128)/128;
            sum += v*v;
          }
          const rms = Math.sqrt(sum/data.length);
          const pct = Math.min(100, Math.max(0, Math.round(rms * 200)));
          meterFill.style.width = pct + '%';
          rafId = requestAnimationFrame(loop);
        };
        if (rafId) cancelAnimationFrame(rafId);
        loop();

        const monitorChk = document.getElementById('monitorAudio');
        if (monitorChk && monitorChk.checked) {
          const audioEl = new Audio();
          audioEl.srcObject = ms;
          audioEl.volume = 0.3;
          audioEl.play().catch(()=>{});
          tile._monitorAudioEl = audioEl;
        }
      }
    });

    cityRooms.push({ ...item, lkRoom, tileEl: tile, videoEl, meterEl: meterFill });
  }
}

// Modal and rest identical from user version (omitted for brevity in this snippet)
