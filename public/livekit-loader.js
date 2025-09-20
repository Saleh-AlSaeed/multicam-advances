(function () {
  // لا تحملها مرتين
  if (window.__livekitLoaderInitialized) return;
  window.__livekitLoaderInitialized = true;

  // --------- مصادر التحميل بالترتيب ---------
  // 1) الملف المحلي الذي يقدّمه السيرفر لديك من node_modules
  // 2) CDNs احتياطية بالحزمة الصحيحة @livekit/client
  var SOURCES = [
    '/vendor/livekit-client.umd.min.js',
    'https://cdn.jsdelivr.net/npm/@livekit/client@2.3.0/dist/livekit-client.umd.min.js',
    'https://cdn.jsdelivr.net/npm/@livekit/client/dist/livekit-client.umd.min.js'
  ];

  // مهلة الانتظار القصوى حتى تتوفر window.livekit
  var READY_TIMEOUT_MS = 12000;

  // استخدم هذا الوعد لو أردت الانتظار صراحةً من سكربتاتك
  var readyResolve, readyReject;
  window.livekitReady = new Promise(function (res, rej) {
    readyResolve = res;
    readyReject  = rej;
  });

  // إن كانت محمّلة مسبقًا نغادر
  if (window.livekit && window.livekit.Room) {
    readyResolve(window.livekit);
    return;
  }

  // تحميل سكربت مرة واحدة وإرجاع Promise يتحقق عند onload/onerror
  function loadOnce(url) {
    return new Promise(function (resolve) {
      try {
        var s = document.createElement('script');
        s.src = url;
        s.async = true;
        s.defer = true;
        // تقليل مشاكل نوع الـ MIME أو الـ referrer
        s.referrerPolicy = 'no-referrer';
        s.crossOrigin = 'anonymous';

        s.onload = function () {
          // نعطي المتصفح نبضة قصيرة لتهيئة الـ UMD على window
          setTimeout(function () { resolve({ ok: true, url: url }); }, 0);
        };
        s.onerror = function () {
          resolve({ ok: false, url: url });
        };

        document.head.appendChild(s);
      } catch (_) {
        resolve({ ok: false, url: url });
      }
    });
  }

  // نجرّب المصادر بالتسلسل حتى تنجح واحدة
  (async function ensure() {
    if (window.livekit && window.livekit.Room) {
      readyResolve(window.livekit);
      return;
    }

    for (var i = 0; i < SOURCES.length; i++) {
      var url = SOURCES[i];
      var r = await loadOnce(url);

      if (!r.ok) {
        console.warn('[LiveKit Loader] failed to load:', url);
        continue;
      }

      // ننتظر حتى تظهر window.livekit أو تنقضي المهلة
      var started = Date.now();
      while (!(window.livekit && window.livekit.Room)) {
        if (Date.now() - started > READY_TIMEOUT_MS) break;
        await new Promise(function (z) { setTimeout(z, 50); });
      }

      if (window.livekit && window.livekit.Room) {
        console.info('[LiveKit Loader] loaded from:', url);
        readyResolve(window.livekit);
        return;
      } else {
        console.warn('[LiveKit Loader] script loaded but window.livekit missing (timeout):', url);
      }
    }

    // لو وصلنا هنا فشلنا من كل المصادر
    var msg = 'LiveKit client did not load (missing UMD from all sources).';
    console.error('[LiveKit Loader]', msg, '\nTried:\n- ' + SOURCES.join('\n- '));
    try {
      // رسالة مفيدة للمستخدم النهائي عند الضرورة (اختياري)
      // alert(msg);
    } catch (_) {}
    readyReject(new Error(msg));
  })();
})();
