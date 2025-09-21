// ===== صفحة المدينة: بث الكاميرا والمايك إلى غرفة المدينة =====

let lkRoom = null;
let previewStream = null;
let hasPermission = false;

/* توحيد اسم مكتبة LiveKit على window.livekit */
function normalizeLivekitGlobal() {
  const g =
    window.livekit ||
    window.LivekitClient ||
    window.LiveKit ||
    window.lk ||
    null;
  if (g && !window.livekit) window.livekit = g;
  return !!window.livekit;
}

/* انتظار تحميل UMD */
async function ensureLivekit(timeoutMs = 15000) {
  if (normalizeLivekitGlobal()) return window.livekit;
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const t = setInterval(() => {
      if (normalizeLivekitGlobal()) {
        clearInterval(t);
        resolve(window.livekit);
      } else if (Date.now() - t0 > timeoutMs) {
        clearInterval(t);
        reject(new Error("LiveKit client did not load"));
      }
    }, 50);
  });
}

function requireAuthCity() {
  const s = requireAuth();
  if (!s || s.role !== "city") {
    location.href = "/";
    throw new Error("unauthorized");
  }
  return s;
}

function qs(k, def = "") {
  const u = new URL(location.href);
  return u.searchParams.get(k) ?? def;
}

async function listDevices() {
  const status = document.getElementById("status");
  try {
    if (!navigator.mediaDevices?.enumerateDevices) {
      status.textContent = "المتصفح لا يدعم enumerateDevices.";
      return;
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    const camSel = document.getElementById("camSel");
    const micSel = document.getElementById("micSel");
    camSel.innerHTML = "";
    micSel.innerHTML = "";

    devices
      .filter((d) => d.kind === "videoinput")
      .forEach((d) => {
        const o = document.createElement("option");
        o.value = d.deviceId;
        o.textContent = d.label || d.deviceId;
        camSel.appendChild(o);
      });

    devices
      .filter((d) => d.kind === "audioinput")
      .forEach((d) => {
        const o = document.createElement("option");
        o.value = d.deviceId;
        o.textContent = d.label || d.deviceId;
        micSel.appendChild(o);
      });

    if (devices.some((d) => d.label)) {
      status.textContent = "الأجهزة ظاهرة.";
      hasPermission = true;
    } else {
      status.textContent = "أسماء الأجهزة غير ظاهرة — امنح الإذن أولاً.";
    }
  } catch (e) {
    console.error("[city] listDevices error:", e);
    status.textContent = "تعذّر قراءة الأجهزة.";
  }
}

async function requestPermission() {
  const status = document.getElementById("status");
  try {
    const camId = document.getElementById("camSel").value || undefined;
    const micId = document.getElementById("micSel").value || undefined;

    previewStream = await navigator.mediaDevices.getUserMedia({
      video: camId ? { deviceId: { exact: camId } } : true,
      audio: micId ? { deviceId: { exact: micId } } : true,
    });

    const v = document.getElementById("preview");
    v.srcObject = previewStream;
    v.muted = true;
    v.playsInline = true;
    try { await v.play(); } catch {}

    hasPermission = true;
    status.textContent = "تم منح الإذن.";
    await listDevices(); // بعد الإذن تظهر أسماء الأجهزة
  } catch (e) {
    console.error("[city] requestPermission error:", e);
    alert("لم يتم منح الإذن: " + (e?.message || ""));
  }
}

/* نشر مسار فيديو على عنصر الفيديو مع تشغيل مضمون */
async function attachAndPlay(track, videoEl) {
  try {
    track.attach(videoEl);
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.autoplay = true;
    try { await videoEl.play(); } catch {}
  } catch (e) {
    console.warn("[city] attachAndPlay fail:", e);
  }
}

async function join() {
  const status = document.getElementById("status");
  try {
    const lk = await ensureLivekit();
    const { Room, createLocalTracks, LocalVideoTrack } = lk;

    const s = requireAuthCity();
    const roomName = qs("room");
    if (!roomName) throw new Error("room is missing");

    const identity = s.username;
    const cameraId = document.getElementById("camSel").value || undefined;
    const micId = document.getElementById("micSel").value || undefined;

    if (!hasPermission) {
      await requestPermission();
      if (!hasPermission) throw new Error("لم يتم منح إذن الكاميرا/المايك");
    }

    // 1) أنشئ التراكات المحلية
    const localTracks = await createLocalTracks({
      audio: micId ? { deviceId: micId } : true,
      video: cameraId ? { deviceId: cameraId } : true,
    });

    // 2) اتصل بالغرفة بدون تمرير tracks (أوضح وأكثر تحكماً)
    const tk = await API.token(roomName, identity, true, true);
    const room = new Room({});
    await room.connect(tk.url, tk.token);

    // 3) انشر التراكات يدوياً لضمان النشر
    for (const t of localTracks) {
      await room.localParticipant.publishTrack(t);
      console.log("[city] published", t.kind);
    }

    // 4) اعرض المعاينة من تراك الفيديو المنشور
    const v = document.getElementById("preview");
    const vt = localTracks.find((t) => t instanceof LocalVideoTrack);
    if (vt) await attachAndPlay(vt, v);

    lkRoom = room;
    document.getElementById("joinBtn").disabled = true;
    document.getElementById("leaveBtn").disabled = false;
    status.textContent = "متصل.";
  } catch (e) {
    console.error("[city] join error:", e);
    alert("فشل الاتصال: " + (e?.message || e));
    status.textContent = "فشل الاتصال.";
  }
}

async function leave() {
  try {
    if (lkRoom) {
      lkRoom.disconnect();
      lkRoom = null;
    }
  } catch {}
  try {
    if (previewStream) {
      previewStream.getTracks().forEach((t) => t.stop());
      previewStream = null;
    }
  } catch {}
  const v = document.getElementById("preview");
  if (v) v.srcObject = null;

  document.getElementById("joinBtn").disabled = false;
  document.getElementById("leaveBtn").disabled = true;
  document.getElementById("status").textContent = "تمت المغادرة.";
}

(function init() {
  requireAuthCity();

  // ربط زر الخروج (محفوظ أيضاً في common.js، وهذا احتياط)
  const lo = document.getElementById("logoutBtn");
  lo?.addEventListener(
    "click",
    async (e) => {
      e.preventDefault();
      try { await API.logout(); } catch {}
      try { localStorage.removeItem("session"); } catch {}
      location.replace("/");
    },
    { passive: false }
  );

  listDevices();
  if (navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", listDevices);
  }

  document
    .getElementById("grantBtn")
    .addEventListener("click", requestPermission, { passive: true });
  document
    .getElementById("joinBtn")
    .addEventListener("click", join, { passive: false });
  document
    .getElementById("leaveBtn")
    .addEventListener("click", leave, { passive: true });
})();
