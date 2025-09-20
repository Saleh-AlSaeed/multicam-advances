// public/livekit-loader.js
(function () {
  if (window.__livekitLoaderInitialized) return;
  window.__livekitLoaderInitialized = true;

  var SOURCES = [
    '/vendor/livekit-client.umd.min.js',
    'https://cdn.jsdelivr.net/npm/@livekit/client@2.3.0/dist/livekit-client.umd.min.js',
    'https://unpkg.com/@livekit/client@2.3.0/dist/livekit-client.umd.min.js'
  ];

  var READY_TIMEOUT_MS = 12000;
  var readyResolve, readyReject;
  window.livekitReady = new Promise(function (res, rej) {
    readyResolve = res;
    readyReject = rej;
  });

  function loadOnce(url) {
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = url;
      s.defer = true;
      s.async = true;
      s.onload = function () { resolve({ ok: true, url: url }); };
      s.onerror = function () { resolve({ ok: false, url: url }); };
      document.head.appendChild(s);
    });
  }

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

      // انتظر حتى تظهر window.livekit أو ينتهي الوقت
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
        console.warn('[LiveKit Loader] script loaded but livekit not initialized:', url);
      }
    }

    var msg = '❌ LiveKit client did not load from any source.';
    console.error(msg);
    readyReject(new Error(msg));
  })();
})();
