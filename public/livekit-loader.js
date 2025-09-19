(function(){
  function load(u, cb){
    var s=document.createElement('script');
    s.src=u;
    s.defer=true;
    s.onload=cb;
    s.onerror=cb;
    document.head.appendChild(s);
  }
  function ensure(){
    if(window.livekit) return;
    load('https://cdn.jsdelivr.net/npm/livekit-client@2/dist/livekit-client.umd.min.js', function(){
      if(window.livekit) return;
      load('https://unpkg.com/livekit-client@latest/dist/livekit-client.umd.js', function(){});
    });
  }
  if(!window.livekit){ ensure(); }
})();
