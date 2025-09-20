// public/livekit-loader.js
(function () {
  function load(src, cb) {
    var s = document.createElement('script');
    s.src = src;
    s.defer = true;
    s.onload = cb;
    s.onerror = cb;
    document.head.appendChild(s);
  }

  function ensure() {
    if (window.livekit) return;

    // المحاولة الأولى: النسخة المضافة داخل public/vendor
    load('/vendor/livekit-client.umd.min.js', function () {
      if (window.livekit) return;

      // المحاولة الثانية: CDN jsDelivr
      load('https://cdn.jsdelivr.net/npm/@livekit/client@2.3.0/dist/livekit-client.umd.min.js', function () {
        if (window.livekit) return;

        // المحاولة الثالثة: fallback إلى unpkg
        load('https://unpkg.com/@livekit/client@latest/dist/livekit-client.umd.min.js', function () {
          if (!window.livekit) {
            console.error('❌ LiveKit client did not load from any source.');
          }
        });
      });
    });
  }

  if (!window.livekit) {
    ensure();
  }
})();
