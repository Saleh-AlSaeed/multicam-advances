// ===== صفحة المشاهدة (مشترك) =====

let lkRoom = null;
let currentVideoPub = null; // آخر RemoteTrackPublication للفيديو المشترك

/* توحيد مرجع مكتبة LiveKit على window.livekit */
function normalizeLivekit() {
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
  if (normalizeLivekit()) return window.livekit;
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const t = setInterval(() => {
      if (normalizeLivekit()) { clearInterval(t); resolve(window.livekit); }
      else if (Date.now() - t0 > timeoutMs) { clearInterval(t); reject(new Error('LiveKit client did not load')); }
    }, 50);
  });
}

function qs(k, def=''){ const u=new URL(location.href); return u.searchParams.get(k) ?? def; }

function requireAuthWatch() {
  const s = requireAuth();
  if (!s) { location.href = '/'; throw new Error('unauthorized'); }
  return s;
}

function showOverlay(show) {
  const ov = document.getElementById('overlay');
  if (!ov) return;
  ov.classList.toggle('show', !!show);
}

async function safePlay(videoEl, wantUnmute=false) {
  if (!videoEl) return;
  if (wantUnmute) videoEl.muted = false;
  videoEl.playsInline = true;
  try { await videoEl.play(); } catch(e) { showOverlay(true); }
}

/** تطبيق إعداد الجودة على الـ publication المتاح */
async function applyQualitySetting(quality) {
  if (!lkRoom) return;
  const lk = window.livekit || {};
  const VideoQuality = lk.VideoQuality || { LOW: 'low', MEDIUM: 'medium', HIGH: 'high' };

  // Auto = نعيد تفعيل adaptiveStream
  if (quality === 'auto') {
    try { lkRoom.setAdaptiveStream?.(true); } catch {}
    return;
  }

  // غير Auto: أوقف adaptiveStream واطلب طبقة محددة
  try { lkRoom.setAdaptiveStream?.(false); } catch {}

  // إن لم نمتلك publication بعد، سنطبّق عند وصوله
  const pub = currentVideoPub;
  if (!pub) return;

  // API حديثة: setSubscriptionSettings({ videoQuality })
  if (typeof pub.setSubscriptionSettings === 'function') {
    const vq =
      quality === 'low' ? VideoQuality.LOW :
      quality === 'high' ? VideoQuality.HIGH :
      VideoQuality.MEDIUM;
    try {
      await pub.setSubscriptionSettings({ videoQuality: vq });
      return;
    } catch {}
  }

  // بديل لنسخ أقدم: setVideoDimensions بأبعاد تقريبية
  if (typeof pub.setVideoDimensions === 'function') {
    const dims = quality === 'low'
      ? { width: 320, height: 180 }
      : quality === 'high'
      ? { width: 1280, height: 720 }
      : { width: 640, height: 360 };
    try {
      await pub.setVideoDimensions(dims);
      return;
    } catch {}
  }

  // إن لم تتوفر أي دوال، نكتفي بإبقاء adaptiveStream off (سيحاول أعلى طبقة)
}

/** حين اختيار المستخدم جودة من القائمة */
function wireQualitySelector() {
  const sel = document.getElementById('qualitySel');
  if (!sel) return;
  sel.addEventListener('change', () => {
    applyQualitySetting(sel.value);
  }, { passive: true });
}

async function start() {
  try {
    const s = requireAuthWatch();
    attachLogout(document.getElementById('logoutBtn'));
    wireQualitySelector();

    const id = qs('id');
    if (!id) { alert('لا توجد جلسة مشاهدة'); return; }

    const lk = await ensureLivekit();
    const { Room, RoomEvent, Track } = lk;

    const rec = await API.getWatch(id);
    if (!rec || !rec.active) {
      alert('جلسة المشاهدة غير فعّالة حالياً.');
      return;
    }

    const tk  = await API.token(rec.roomName, `viewer-${s.username}`, false, true);

    const player = document.getElementById('player');
    // ابدأ Muted لضمان autoplay
    player.muted = true;
    player.playsInline = true;
    player.autoplay = true;

    lkRoom = new Room({ adaptiveStream: true, autoSubscribe: true });
    await lkRoom.connect(tk.url, tk.token);

    const attachVideo = (track, pub) => {
      currentVideoPub = pub || currentVideoPub;
      track.attach(player);
      safePlay(player, /*unmute*/ false);
      // طبّق الجودة الحالية (قد تكون غير Auto)
      const sel = document.getElementById('qualitySel');
      if (sel && sel.value !== 'auto') applyQualitySetting(sel.value);
    };

    lkRoom.on(RoomEvent.TrackSubscribed, (track, pub) => {
      try {
        if (track.kind === Track.Kind.Video) {
          attachVideo(track, pub);
        } else if (track.kind === Track.Kind.Audio) {
          const a = document.getElementById('hidden-audio') || (() => {
            const el = document.createElement('audio');
            el.id = 'hidden-audio';
            el.style.display = 'none';
            document.body.appendChild(el);
            return el;
          })();
          track.attach(a);
        }
      } catch(e) {
        console.warn('[watch] attach error', e);
      }
    });

    // لو كانت التراكات موجودة أصلاً
    const attachExisting = () => {
      lkRoom.remoteParticipants.forEach(p => {
        p.trackPublications.forEach(pub => {
          const t = pub.track;
          if (!t) return;
          if (t.kind === Track.Kind.Video) {
            attachVideo(t, pub);
          } else if (t.kind === Track.Kind.Audio) {
            const a = document.getElementById('hidden-audio') || (() => {
              const el = document.createElement('audio');
              el.id = 'hidden-audio';
              el.style.display = 'none';
              document.body.appendChild(el);
              return el;
            })();
            t.attach(a);
          }
        });
      });
    };
    attachExisting();
    lkRoom.on(RoomEvent.ParticipantConnected, attachExisting);

    // أزرار التحكم
    document.getElementById('fsBtn')?.addEventListener('click', async () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else player.requestFullscreen?.();
    });
    document.getElementById('playBtn')?.addEventListener('click', async () => {
      await safePlay(player, /*unmute*/ true);
      showOverlay(false);
      const a = document.getElementById('hidden-audio');
      if (a) { try { a.muted = false; await a.play(); } catch {} }
    });

    // إن فشل التشغيل التلقائي، أظهر تلميح التفاعل
    setTimeout(() => { if (player.paused) showOverlay(true); }, 1200);
  } catch (e) {
    console.error('watch start error:', e);
    alert('تعذر فتح البث: ' + (e.message || e));
  }
}

start();
