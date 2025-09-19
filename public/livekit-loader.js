// public/livekit-loader.js
(function () {
  function load(url, cb) {
    var s = document.createElement('script');
    s.src = url;
    s.defer = true;
    s.onload = cb;
    s.onerror = cb;
    document.head.appendChild(s);
  }
  function ensureLiveKit() {
    if (window.livekit) return;
    // المحاولة الأولى: jsDelivr
    load('https://cdn.jsdelivr.net/npm/livekit-client@2/dist/livekit-client.umd.min.js', function () {
      if (window.livekit) return;
      // المحاولة الثانية: unpkg
      load('https://unpkg.com/livekit-client@latest/dist/livekit-client.umd.js', function(){});
    });
  }
  // لو فشل المحلي، هذا الملف يضمن التحميل من CDN
  if (!window.livekit) {
    ensureLiveKit();
  }
})();
