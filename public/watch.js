const { Room, RoomEvent } = window.livekit;
let lkRoom = null;

function ensureAuthWatch() {
  const s = requireAuth();
  if (!s) location.href = '/';
  return s;
}
async function start() {
  ensureAuthWatch();
  logoutBtnHandler(document.getElementById('logoutBtn'));
  const id = qs('id');
  const rec = await API.getWatch(id);
  const tk = await API.token(rec.roomName, `viewer-${API.session().username}`, false, true);
  lkRoom = new Room({ adaptiveStream: true });
  await lkRoom.connect(tk.url, tk.token);
  const player = document.getElementById('player');
  lkRoom.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
    if (track.kind === 'video') track.attach(player);
    if (track.kind === 'audio') track.attach(player);
  });
  document.getElementById('fsBtn').addEventListener('click', async () => {
    const elem = player;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (elem.requestFullscreen) elem.requestFullscreen();
  });
}
start();
