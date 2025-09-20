// public/admin.js
if (!window.livekit) {
  console.error('LiveKit UMD not loaded');
  alert('LiveKit client did not load');
}
// نسمح للصفحة تكمل بدون كراش
const { Room, RoomEvent, LocalVideoTrack, LocalAudioTrack } = window.livekit || {};

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

  if (!window.livekit) return; // لا نحاول الاتصال بدون المكتبة

  for (const item of CITIES) {
    const id = 'tile-' + item.room;
    const tile = document.createElement('div');
    tile.className = 'video-tile';
    tile.innerHTML = `<div class="meter"><i></i></div><video id="${id}" autoplay playsinline muted></video><div class="label">${item.label}</div>`;
    grid.appendChild(tile);

    const lkRoom = new Room({ adaptiveStream: true, dynacast: true });
    const identity = `admin-preview-${item.room}`;
    try {
      const tk = await API.token(item.room, identity, false, true);
      await lkRoom.connect(tk.url, tk.token);
    } catch (e) {
      console.warn('preview connect failed', item.room, e);
    }

    const videoEl = tile.querySelector('video');
    lkRoom?.on?.(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === 'video') track.attach(videoEl);
    });

    cityRooms.push({ ...item, lkRoom, tileEl: tile, videoEl });
  }
}

// Modal + mix (كما عندك)
function openViewModal() { document.getElementById('viewModal').classList.add('open'); renderSlots(); }
function closeViewModal() { document.getElementById('viewModal').classList.remove('open'); }
function renderSlots() {
  const n = parseInt(document.getElementById('camCount').value, 10);
  const slots = document.getElementById('slots');
  slots.innerHTML = '';
  for (let i=0;i<n;i++) {
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
      </div>
    `;
    slots.appendChild(field);
  }
}
function readSelectionFromUI() {
  const slots = [...document.querySelectorAll('#slots fieldset')];
  return slots.map(el => ({
    room: el.querySelector('.userSel').value,
    video: el.querySelector('.optVideo').checked,
    audio: el.querySelector('.optAudio').checked
  }));
}

async function createWatch() {
  const selection = readSelectionFromUI();
  if (selection.length === 0) return alert('اختر عدد الكاميرات');
  const rec = await API.createWatch(selection);
  composite = rec;
  currentSelection = selection;
  document.getElementById('goWatchBtn').disabled = false;
  document.getElementById('stopBtn').disabled = false;
  closeViewModal();
  alert('تم إنشاء غرفة المشاهدة: ' + rec.roomName);
}

async function applyChanges() {
  if (!composite) return openViewModal();
  const selection = readSelectionFromUI();
  currentSelection = selection;
  await fetch(`/api/watch/${composite.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API.session().token },
    body: JSON.stringify({ selection })
  });
  alert('تم تطبيق التغييرات.');
}

async function stopBroadcast() {
  if (!composite) return;
  await fetch(`/api/watch/${composite.id}/stop`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + API.session().token }
  });
  document.getElementById('stopBtn').disabled = true;
  alert('تم إيقاف البث.');
}

function openWatchWindow() {
  if (!composite) return alert('أنشئ جلسة مشاهدة أولاً');
  window.open(`/watch.html?id=${composite.id}`, '_blank');
}

function setupUI() {
  document.getElementById('viewModeBtn').addEventListener('click', openViewModal);
  document.getElementById('closeModalBtn').addEventListener('click', closeViewModal);
  document.getElementById('camCount').addEventListener('change', renderSlots);
  document.getElementById('createWatchBtn').addEventListener('click', createWatch);
  document.getElementById('goWatchBtn').addEventListener('click', openWatchWindow);
  document.getElementById('applyBtn').addEventListener('click', applyChanges);
  document.getElementById('stopBtn').addEventListener('click', stopBroadcast);
}

(async function init() {
  ensureAuth();
  setupUI();
  renderSlots();
  await connectCityPreviews();
})();
