// ===== صفحة المشاهدة (مشترك) =====

let lkRoom = null;

async function ensureLivekit(timeoutMs = 12000) {
  if (window.livekit) return window.livekit;
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const t = setInterval(() => {
      if (window.livekit) { clearInterval(t); resolve(window.livekit); }
      else if (Date.now() - started > timeoutMs) { clearInterval(t); reject(new Error('LiveKit client did not load')); }
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

    const lk = await ensureLivekit();
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
      if (document.fullscreenElement) document.exitFullscreen();
      else player.requestFullscreen?.();
    });
  } catch (e) {
    console.error('watch start error:', e);
    alert('تعذر فتح البث: ' + (e.message || e));
  }
}
start();
