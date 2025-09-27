// ===== admin.js =====

// حماية الوصول
(function() {
  const s = API.session();
  if (!s || s.role !== 'admin') {
    location.href = '/';
    return;
  }
})();

const state = {
  camCount: 6,
  selection: [],     // قائمة الغرف المختارة للعرض
  activeWatch: null, // {id, roomName, ...}
  monitorAudio: false,
};

// عناصر DOM
const previewGrid = document.getElementById('previewGrid');
const viewModal = document.getElementById('viewModal');
const btnViewMode = document.getElementById('viewModeBtn');
const btnApply = document.getElementById('applyBtn');
const btnStop = document.getElementById('stopBtn');
const btnGoWatch = document.getElementById('goWatchBtn');
const btnCloseModal = document.getElementById('closeModalBtn');
const btnCreateWatch = document.getElementById('createWatchBtn');
const selCamCount = document.getElementById('camCount');
const slotsDiv = document.getElementById('slots');
const monitorAudioChk = document.getElementById('monitorAudio');

// ===== معاينة المدن (تخطيط/مكان فقط؛ بدون اتصال من هنا) =====
// نعمل مربعات 6 تمثل city-1 .. city-6 للمعاينة الاسمية
const CITIES = Array.from({length:6}, (_,i)=>`city-${i+1}`);

function renderPreview() {
  previewGrid.innerHTML = '';
  // نجعل 6 مربعات ثابتة كمعاينة
  CITIES.forEach((roomKey, idx) => {
    const tile = document.createElement('div');
    tile.className = 'video-tile';
    tile.style.display = 'flex';
    tile.style.alignItems = 'center';
    tile.style.justifyContent = 'center';
    tile.style.color = '#fff';
    tile.style.border = '1px solid rgba(255,255,255,.15)';
    tile.innerHTML = `
      <div style="text-align:center">
        <div class="label">${roomKey}</div>
        <div class="small" style="color:#ddd">Camera/Mic preview placeholder</div>
      </div>
    `;
    previewGrid.appendChild(tile);
  });
}

renderPreview();

// ===== طريقة المشاهدة / اختيار الكاميرات =====
function openViewModal() {
  selCamCount.value = String(state.camCount);
  buildSlotEditors();
  viewModal.classList.add('open');
}
function closeViewModal() {
  viewModal.classList.remove('open');
}
function buildSlotEditors() {
  const n = Number(selCamCount.value || 6);
  slotsDiv.innerHTML = '';
  for (let i=0;i<n;i++){
    const wrap = document.createElement('div');
    wrap.className = 'grid cols-2';
    wrap.innerHTML = `
      <div>
        <label>فتحة ${i+1} - غرفة:</label>
        <select class="input slot-room">
          ${CITIES.map(c=>`<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      <div>
        <label>الوصف (اختياري):</label>
        <input class="input slot-label" placeholder="مثلاً: مدينة ${i+1}" />
      </div>
    `;
    slotsDiv.appendChild(wrap);
  }
}

btnViewMode?.addEventListener('click', openViewModal, { passive:true });
btnCloseModal?.addEventListener('click', closeViewModal, { passive:true });
selCamCount?.addEventListener('change', buildSlotEditors, { passive:true });

btnCreateWatch?.addEventListener('click', async () => {
  try {
    state.camCount = Number(selCamCount.value || 6);
    const rooms = Array.from(slotsDiv.querySelectorAll('.slot-room')).map(el=>el.value);
    const labels = Array.from(slotsDiv.querySelectorAll('.slot-label')).map(el=>el.value.trim());

    // selection: مصفوفة عناصر تمثل الفتحات
    state.selection = rooms.map((r, i)=>({ roomKey: r, label: labels[i] || r }));
    if (!state.selection.length) {
      alert('اختر على الأقل فتحة واحدة');
      return;
    }
    const rec = await API.createWatch(state.selection);
    state.activeWatch = rec;
    btnGoWatch.disabled = false;
    btnStop.disabled = false;
    alert('تم إنشاء رابط المشاهدة');
    closeViewModal();
  } catch (e) {
    alert('فشل إنشاء جلسة المشاهدة');
  }
}, { passive:false });

btnApply?.addEventListener('click', async () => {
  if (!state.activeWatch) {
    alert('أنشئ جلسة مشاهدة أولًا');
    return;
  }
  try {
    // حالياً لا نغير شيء على السيرفر إلا لو أردت تعديل selection:
    const res = await fetch(`/api/watch/${state.activeWatch.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type':'application/json',
        'Authorization':'Bearer ' + (API.session()?.token || '')
      },
      body: JSON.stringify({ selection: state.selection })
    });
    if (!res.ok) throw new Error();
    alert('تم تطبيق التغييرات');
  } catch {
    alert('فشل تطبيق التغييرات');
  }
}, { passive:false });

btnStop?.addEventListener('click', async () => {
  if (!state.activeWatch) return;
  if (!confirm('إيقاف البث الحالي؟')) return;
  try {
    const r = await fetch(`/api/watch/${state.activeWatch.id}/stop`, {
      method: 'POST',
      headers: { 'Authorization':'Bearer ' + (API.session()?.token||'') }
    });
    if (!r.ok) throw new Error();
    alert('تم إيقاف البث');
  } catch {
    alert('تعذر الإيقاف');
  }
}, { passive:false });

btnGoWatch?.addEventListener('click', () => {
  if (!state.activeWatch) return;
  window.open(`/watch.html?id=${state.activeWatch.id}`, '_blank');
}, { passive:true });

monitorAudioChk?.addEventListener('change', (e) => {
  state.monitorAudio = !!e.target.checked;
}, { passive:true });

// ===== زر الخروج =====
document.getElementById('logoutBtn')?.addEventListener('click', async (e) => {
  e.preventDefault();
  try { await API.logout(); } catch(_) {}
  try { localStorage.removeItem('session'); } catch(_) {}
  location.replace('/');
}, { passive:false });

// ===== Timeline UI (Admin) =====
(function timelineAdmin() {
  const modal = document.getElementById('timelineModal');
  const btnOpen = document.getElementById('timelineBtn');
  const btnClose = document.getElementById('tlCloseBtn');
  const tlList = document.getElementById('tlList');
  const lblWatchId = document.getElementById('tlWatchIdLabel');

  const addBtn = document.getElementById('tlAddBtn');
  const saveBtn = document.getElementById('tlSaveBtn');
  const startBtn = document.getElementById('tlStartBtn');
  const stopBtn = document.getElementById('tlStopBtn');

  const fType = document.getElementById('tlType');
  const fStart = document.getElementById('tlStart');
  const fDur = document.getElementById('tlDur');
  const fSrc = document.getElementById('tlSrc');
  const fPos = document.getElementById('tlPos');
  const fVol = document.getElementById('tlVol');

  let events = [];            // working copy

  function renderList() {
    tlList.innerHTML = '';
    if (!events.length) {
      tlList.textContent = 'لا توجد أحداث.';
      return;
    }
    events
      .slice()
      .sort((a,b)=>a.startOffsetMs-b.startOffsetMs)
      .forEach(ev => {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.gap = '8px';
        div.style.margin = '6px 0';
        div.innerHTML = `
          <span class="tag">${ev.type}</span>
          <span>t+${ev.startOffsetMs}ms</span>
          <span>dur=${ev.durationMs}ms</span>
          <code style="direction:ltr">${(ev.payload?.src||ev.payload?.text||ev.payload?.cameraKey||'')}</code>
          <span class="small">pos=${ev.payload?.position||'center'} vol=${ev.payload?.volume??1}</span>
          <button class="btn danger" style="margin-inline-start:auto">حذف</button>
        `;
        div.querySelector('button').addEventListener('click', async () => {
          events = events.filter(e => e.id !== ev.id);
          renderList();
        }, { passive: true });
        tlList.appendChild(div);
      });
  }

  async function openModal() {
    if (!state.activeWatch) {
      // حاول العثور على آخر بث نشط إن لم يكن مخزونًا محليًا
      const active = await API.getActiveWatch();
      if (!active) {
        alert('لا توجد جلسة مشاهدة نشطة. أنشئ ارتباط للمشاهدة أولاً.');
        return;
      }
      state.activeWatch = active;
    }
    lblWatchId.textContent = 'Watch ID: ' + state.activeWatch.id;

    // حمّل التايملاين السابق (إن وجد)
    try {
      const t = await (await fetch(`/api/timeline/${state.activeWatch.id}`, {
        headers: { 'Authorization': 'Bearer ' + (API.session()?.token||'') }
      })).json();
      events = Array.isArray(t?.events) ? t.events.slice() : [];
    } catch { events = []; }

    renderList();
    modal.classList.add('open');
  }

  function closeModal() {
    modal.classList.remove('open');
  }

  function addEvent() {
    const type = fType.value;
    const startOffsetMs = Number(fStart.value||0);
    const durationMs = Number(fDur.value||0);
    const val = fSrc.value.trim();
    const pos = fPos.value;
    const vol = Number(fVol.value||1);

    const payload = { position: pos, volume: vol };
    if (type === 'text') payload.text = val || '—';
    else if (type === 'layout') payload.cameraKey = val || '';
    else payload.src = val;

    const ev = {
      id: crypto.randomUUID ? crypto.randomUUID() : (Date.now()+'-'+Math.random().toString(16).slice(2)),
      type, startOffsetMs, durationMs, payload
    };
    events.push(ev);
    renderList();
  }

  async function saveAll() {
    if (!state.activeWatch) return;
    const r = await fetch(`/api/timeline/${state.activeWatch.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (API.session()?.token||'')
      },
      body: JSON.stringify({ events })
    });
    if (!r.ok) return alert('فشل الحفظ');
    alert('تم الحفظ');
  }

  async function startNow() {
    if (!state.activeWatch) return;
    await saveAll();
    const r = await fetch(`/api/timeline/${state.activeWatch.id}/start`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + (API.session()?.token||'') }
    });
    if (!r.ok) return alert('تعذر التشغيل');
    alert('تم تشغيل الـ Timeline');
  }

  async function stopNow() {
    if (!state.activeWatch) return;
    const r = await fetch(`/api/timeline/${state.activeWatch.id}/stop`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + (API.session()?.token||'') }
    });
    if (!r.ok) return alert('تعذر الإيقاف');
    alert('تم إيقاف الـ Timeline');
  }

  btnOpen?.addEventListener('click', openModal, { passive: true });
  btnClose?.addEventListener('click', closeModal, { passive: true });
  addBtn?.addEventListener('click', addEvent, { passive: false });
  saveBtn?.addEventListener('click', saveAll, { passive: false });
  startBtn?.addEventListener('click', startNow, { passive: false });
  stopBtn?.addEventListener('click', stopNow, { passive: false });
})();
