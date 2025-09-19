const out=document.getElementById('out');const vid=document.getElementById('vid');let curStream=null;
function log(o){out.textContent+=(typeof o==='string'?o:JSON.stringify(o,null,2))+"\n";out.scrollTop=out.scrollHeight}
async function stopStream(){try{curStream&&curStream.getTracks().forEach(t=>t.stop())}catch(_){}curStream=null;try{vid.srcObject=null}catch(_){}} 
async function askPerm(){if(location.protocol!=='https:'&&location.hostname!=='localhost'){log('❌ HTTPS required');alert('HTTPS required');return}
  try{log('🔔 Requesting mic+cam...');const s=await navigator.mediaDevices.getUserMedia({video:true,audio:true});s.getTracks().forEach(t=>t.stop());log('✅ Permission granted')}
  catch(e){log('❌ '+e.name+' '+e.message);alert('Error: '+e.name)}}
async function list(){try{const devs=await navigator.mediaDevices.enumerateDevices();log('📋 Devices:');devs.forEach(d=>log(`- ${d.kind} id=${d.deviceId||''} label=${d.label||''}`))}catch(e){log('❌ '+e.message)}}
async function playFacing(mode){try{await stopStream();log('▶️ facing='+JSON.stringify(mode));const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:mode},audio:true});curStream=s;vid.srcObject=s}catch(e){log('❌ '+e.name+' '+e.message);alert('Error: '+e.name)}}
document.getElementById('ask').addEventListener('click',askPerm);
document.getElementById('list').addEventListener('click',list);
document.getElementById('front').addEventListener('click',()=>playFacing('user'));
document.getElementById('back').addEventListener('click',()=>playFacing({exact:'environment'}));
document.getElementById('stop').addEventListener('click',stopStream);
log('UA: '+navigator.userAgent);
log('HTTPS: '+(location.protocol==='https:'||location.hostname==='localhost'));
log('mediaDevices: '+!!navigator.mediaDevices);
