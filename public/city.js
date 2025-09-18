'use strict';

let lkRoom = null;
let localTracks = [];
let permissionsGranted = false;

function setStatus(msg) {
  var el = document.getElementById('status');
  if (el) el.textContent = msg;
  try { console.log('[CITY]', msg); } catch(_) {}
}
function ensureAuthCity() {
  var s = API.session && API.session();
  if (!s || s.role !== 'city') { location.href = '/'; return null; }
  return s;
}
function buildVideoConstraints(choice) {
  if (choice === 'front') return { facingMode: 'user' };
  if (choice === 'environment') return { facingMode: { exact: 'environment' } };
  if (choice) return { deviceId: choice };
  return true;
}
function waitForLiveKit(timeoutMs) {
  if (!timeoutMs) timeoutMs = 8000;
  return new Promise(function(resolve, reject){
    if (window.livekit) return resolve(window.livekit);
    var t0 = Date.now();
    var id = setInterval(function(){
      if (window.livekit) { clearInterval(id); resolve(window.livekit); }
      else if (Date.now() - t0 > timeoutMs) { clearInterval(id); reject(new Error('LiveKit client did not load')); }
    }, 50);
  });
}
async function requestPermissionsOnce() {
  if (permissionsGranted) return true;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
    setStatus('❌ يجب فتح الصفحة عبر HTTPS.');
    return false;
  }
  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
    setStatus('❌ المتصفح لا يدعم الكاميرا/المايك.');
    return false;
  }
  try {
    setStatus('🔔 طلب إذن الكاميرا/المايك…');
    var s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    s.getTracks().forEach(function(t){ t.stop(); });
    permissionsGranted = true;
    setStatus('✅ تم منح الإذن. اختر الأجهزة أو اضغط "اتصال".');
    return true;
  } catch (e) {
    try { console.error('Permission error:', e); } catch(_){}
    setStatus('❌ رُفض الإذن. فعّل من إعدادات المتصفح أو اضغط "منح الإذن".');
    var pb = document.getElementById('permBtn');
    if (pb) pb.removeAttribute('style');
    return false;
  }
}
async function listDevices() {
  try {
    var devs = await navigator.mediaDevices.enumerateDevices();
    var camSel = document.getElementById('camSel');
    var micSel = document.getElementById('micSel');
    if (!camSel || !micSel) return;
    camSel.innerHTML = '';
    micSel.innerHTML = '';
    var cams = devs.filter(function(d){ return d.kind === 'videoinput'; });
    var mics = devs.filter(function(d){ return d.kind === 'audioinput'; });
    cams.forEach(function(d, i){
      var o = document.createElement('option');
      o.value = d.deviceId || '';
      o.textContent = (d.label && d.label.trim()) ? d.label : (i===0 ? 'الكاميرا الأمامية (افتراضي)' : ('كاميرا ' + (i+1)));
      camSel.appendChild(o);
    });
    mics.forEach(function(d, i){
      var o = document.createElement('option');
      o.value = d.deviceId || '';
      o.textContent = (d.label && d.label.trim()) ? d.label : (i===0 ? 'مايك افتراضي' : ('مايك ' + (i+1)));
      micSel.appendChild(o);
    });
    if (cams.length === 0) {
      var o1 = document.createElement('option'); o1.value='front'; o1.textContent='الكاميرا الأمامية'; camSel.appendChild(o1);
      var o2 = document.createElement('option'); o2.value='environment'; o2.textContent='الكاميرا الخلفية'; camSel.appendChild(o2);
    }
    setStatus('📋 الأجهزة جاهزة.');
  } catch (e) {
    try { console.error('enumerateDevices failed:', e); } catch(_){}
    setStatus('❌ تعذر قراءة الأجهزة.');
  }
}
async function join() {
  var s = ensureAuthCity();
  if (!s) return;
  try {
    var livekit = await waitForLiveKit();
    var Room = livekit.Room;
    var createLocalTracks = livekit.createLocalTracks;
    var LocalVideoTrack = livekit.LocalVideoTrack;

    var ok = await requestPermissionsOnce();
    if (!ok) return;
    await listDevices();
    var roomName = qs('room');
    var identity = '' + s.username;
    var camChoice = (document.getElementById('camSel') || {}).value;
    var micChoice = (document.getElementById('micSel') || {}).value;
    var videoConstraints = buildVideoConstraints(camChoice);
    var audioConstraints = micChoice ? { deviceId: micChoice } : true;
    setStatus('🎥 إنشاء المسارات المحلية…');
    localTracks = await createLocalTracks({ audio: audioConstraints, video: videoConstraints });
    setStatus('🔐 الحصول على توكن…');
    var tk = await API.token(roomName, identity, true, true);
    setStatus('🔌 الاتصال بـ LiveKit…');
    lkRoom = new Room({});
    await lkRoom.connect(tk.url, tk.token, { tracks: localTracks });
    var v = document.getElementById('preview');
    var vt = null;
    for (var i=0;i<localTracks.length;i++){
      if (localTracks[i] instanceof LocalVideoTrack) { vt = localTracks[i]; break; }
    }
    if (vt && v) vt.attach(v);
    var jb = document.getElementById('joinBtn'); if (jb) jb.disabled = true;
    var lb = document.getElementById('leaveBtn'); if (lb) lb.disabled = false;
    setStatus('✅ متصل وينشر الفيديو/الصوت.');
  } catch (e) {
    try { console.error('join failed:', e); } catch(_){}
    setStatus('❌ فشل الاتصال: ' + (e && (e.name || e.message) || ''));
    alert('فشل الاتصال: ' + ((e && e.message) || e));
  }
}
async function leave() {
  try {
    if (lkRoom) { lkRoom.disconnect(); lkRoom = null; }
    for (var i=0;i<localTracks.length;i++){ try { localTracks[i].stop(); } catch(_){ } }
    localTracks = [];
    var v = document.getElementById('preview'); if (v) { try { v.srcObject = null; } catch(_){ } }
    var jb = document.getElementById('joinBtn'); if (jb) jb.disabled = false;
    var lb = document.getElementById('leaveBtn'); if (lb) lb.disabled = true;
    setStatus('↩️ تمت المغادرة.');
  } catch (e) {
    try { console.error('leave failed:', e); } catch(_){}
    setStatus('❌ تعذر المغادرة.');
  }
}
document.addEventListener('DOMContentLoaded', async function(){
  ensureAuthCity();
  var lo = document.getElementById('logoutBtn');
  if (typeof logoutBtnHandler === 'function') logoutBtnHandler(lo);
  var pb = document.getElementById('permBtn');
  if (pb) pb.addEventListener('click', async function(){
    var ok = await requestPermissionsOnce();
    if (ok) await listDevices();
  });
  var jb = document.getElementById('joinBtn');
  if (jb) jb.addEventListener('click', join);
  var lb = document.getElementById('leaveBtn');
  if (lb) lb.addEventListener('click', leave);
  var ok = await requestPermissionsOnce();
  if (ok) await listDevices();
});
