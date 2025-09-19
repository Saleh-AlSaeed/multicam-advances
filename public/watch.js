// ===== صفحة المشاهدة =====
const { Room, RoomEvent } = window.livekit;
let lkRoom = null;

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

    // استرجاع بيانات جلسة المشاهدة (تعرف اسم الغرفة)
    const rec = await API.getWatch(id);

    // طلب توكن للانضمام كمشاهد (اشتراك فقط)
    const tk = await API.token(rec.roomName, `viewer-${API.session().username}`, false, true);

    lkRoom = new Room({ adaptiveStream: true });
    await lkRoom.connect(tk.url, tk.token);

    const player = document.getElementById('player');

    // عند الاشتراك في التراكات، إلصق الصوت/الفيديو في فيديو واحد
    lkRoom.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === 'video') track.attach(player);
      if (track.kind === 'audio') track.attach(player);
    });

    // زر ملء الشاشة
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
