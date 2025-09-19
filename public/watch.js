// Watch page, robust against late LiveKit loading

let lkRoom = null;

async function ensureLivekit(timeoutMs = 10000) {
  if (window.livekit) return window.livekit;
  const start = Date.now();
  return await new Promise((resolve, reject) => {
    const i = setInterval(() => {
      if (window.livekit) { clearInterval(i); resolve(window.livekit); }
      else if (Date.now() - start > timeoutMs) { clearInterval(i); reject(new Error('LiveKit client did not load')); }
    }, 50);
  });
}

function ensureAuthWatch() {
  const s = requireAuth();
  if (!s) location.href = '/';
  return s;
}

async function start() {
  try {
    ensureAuthWatch();
    logoutBtnHandler(document.getElementById('logoutBtn'));

    const id = qs('id');
    if (!id) { alert('لا توجد جلسة مشاهدة'); return; }

    const lk = await ensureLivekit(); // ← انتظر LiveKit
    const { Room, RoomEvent } = lk;

    const rec = await API.getWatch(id);
    const tk  = await API.token(rec.roomName, `viewer-${API.session().username}`, false, true);

    lkRoom = new Room({ adaptiveStream: true });
    await lkRoom.connect(tk.url, tk.token);

    const player = document.getElementById('player');
    lkRoom.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === 'video') track.attach(player);
      if (track.kind === 'audio') track.attach(player);
    });

    document.getElementById('fsBtn')?.addEventListener('click', async () => {
      const elem = player;
      if (document.fullscreenElement) document.exitFullscreen();
      else if (elem.requestFullscreen) elem.requestFullscreen();
    });
  } catch (e) {
    console.error('watch start error:', e);
    alert('تعذر فتح البث: ' + (e.message || e));
  }
}
start();
