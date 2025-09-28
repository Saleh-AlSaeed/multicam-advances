// ===== Timeline Admin UI (مع رفع ملفات) =====
(function timelineAdmin() {
  const btn = document.getElementById('timelineBtn');
  const modal = document.getElementById('timelineModal');
  if (!btn || !modal) return;

  const watchIdLabel = document.getElementById('tlWatchIdLabel');
  const listEl = document.getElementById('tlList');

  const typeEl = document.getElementById('tlType');
  const startEl = document.getElementById('tlStart');
  const durEl = document.getElementById('tlDur');
  const srcEl = document.getElementById('tlSrc');
  const posEl = document.getElementById('tlPos');
  const volEl = document.getElementById('tlVol');

  const fileRow = document.getElementById('tlFileRow');
  const fileInp = document.getElementById('tlFile');
  const uploadBtn = document.getElementById('tlUploadBtn');
  const uploadMsg = document.getElementById('tlUploadMsg');

  const addBtn = document.getElementById('tlAddBtn');
  const saveBtn = document.getElementById('tlSaveBtn');
  const startBtn = document.getElementById('tlStartBtn');
  const stopBtn = document.getElementById('tlStopBtn');
  const closeBtn = document.getElementById('tlCloseBtn');

  const state = {
    watchId: null,
    events: [],   // {id, type, startOffsetMs, durationMs, payload{ src|text|city, pos, volume }}
    timeline: null
  };

  function requireAdmin() {
    const s = API.session?.();
    if (!s || s.role !== 'admin') { alert('يلزم دخول كمسؤول'); return null; }
    return s;
  }
  function openModal() { modal.classList.add('open'); }
  function closeModal() { modal.classList.remove('open'); }

  function uid() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11)
      .replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
  }

  function renderList() {
    listEl.innerHTML = '';
    if (!state.events.length) {
      listEl.textContent = 'لا توجد أحداث بعد.';
      return;
    }
    state.events
      .slice()
      .sort((a,b)=>a.startOffsetMs - b.startOffsetMs)
      .forEach(ev => {
        const row = document.createElement('div');
        row.style.display='flex';
        row.style.alignItems='center';
        row.style.gap='8px';
        row.style.padding='6px 0';
        row.style.borderBottom='1px solid #eee';

        const meta = document.createElement('div');
        meta.className = 'small';
        meta.textContent =
          `• ${ev.type} | t=${ev.startOffsetMs}ms dur=${ev.durationMs}ms ` +
          (ev.payload?.src ? `src="${ev.payload.src}" ` : ev.payload?.city ? `city=${ev.payload.city} ` : ev.payload?.text ? `text="${ev.payload.text}" ` : '') +
          (ev.payload?.pos ? `pos=${ev.payload.pos} ` : '') +
          (typeof ev.payload?.volume === 'number' ? `vol=${ev.payload.volume}` : '');
        const del = document.createElement('button');
        del.className = 'btn danger';
        del.textContent = 'حذف';
        del.style.padding='4px 8px';
        del.onclick = async () => {
          const s = requireAdmin(); if (!s) return;
          if (!state.watchId || !ev.id) return;
          try {
            const r = await fetch(`/api/timeline/${encodeURIComponent(state.watchId)}/events/${encodeURIComponent(ev.id)}`, {
              method: 'DELETE',
              headers: { 'Authorization':'Bearer ' + (s.token||'') }
            });
            if (!r.ok) throw new Error('delete failed');
            state.events = state.events.filter(e => e.id !== ev.id);
            renderList();
          } catch (e) { alert('تعذر حذف الحدث'); }
        };

        row.appendChild(meta);
        row.appendChild(del);
        listEl.appendChild(row);
      });
  }

  function onTypeChanged() {
    const t = typeEl.value;
    // لغير النص، أظهر رفع الملف
    fileRow.style.display = (t === 'image' || t === 'video' || t === 'audio') ? 'flex' : 'none';
    // وسم الحقل
    const lbl = document.getElementById('tlSrcLabel');
    lbl.textContent = (t === 'text') ? 'النص' : 'رابط الوسيط (اختياري إذا سترفع ملفًا)';
  }
  typeEl.addEventListener('change', onTypeChanged, { passive:true });
  onTypeChanged();

  async function uploadSelectedFile() {
    const s = requireAdmin(); if (!s) return;
    uploadMsg.textContent = '';
    const f = fileInp.files?.[0];
    if (!f) { alert('اختر ملفًا أولًا'); return; }
    const fd = new FormData();
    fd.append('file', f, f.name);
    try {
      const r = await fetch('/api/upload', {
        method:'POST',
        headers: { 'Authorization':'Bearer ' + (s.token||'') },
        body: fd
      });
      if (!r.ok) throw new Error('failed');
      const out = await r.json();
      srcEl.value = out.url;   // ضع الـ URL مباشرة
      uploadMsg.textContent = 'تم الرفع: ' + out.url;
    } catch (e) {
      uploadMsg.textContent = 'فشل الرفع';
      alert('تعذر رفع الملف');
    }
  }
  uploadBtn?.addEventListener('click', uploadSelectedFile, { passive:false });

  function readEventFromForm() {
    const t = (typeEl?.value || 'text').trim();
    const start = parseInt(startEl?.value || '0', 10) || 0;
    const dur = parseInt(durEl?.value || '0', 10) || 0;
    const src = (srcEl?.value || '').trim();
    const pos = (posEl?.value || 'center').trim();
    const vol = parseFloat(volEl?.value || '1');

    const payload = { pos };
    if (!Number.isNaN(vol)) payload.volume = Math.max(0, Math.min(1, vol));

    if (t === 'text') { payload.text = src || 'نص'; }
    else if (t === 'image') { payload.src = src; }
    else if (t === 'video') { payload.src = src; }
    else if (t === 'audio') { payload.src = src; }
    else if (t === 'layout') { payload.hint = src; }
    if (/^city-\d+$/i.test(src)) { payload.city = src; }

    return { id: uid(), type: t, startOffsetMs: start, durationMs: dur, payload };
  }

  addBtn?.addEventListener('click', () => {
    const ev = readEventFromForm();
    state.events.push(ev);
    renderList();
  }, { passive: true });

  saveBtn?.addEventListener('click', async () => {
    const s = requireAdmin(); if (!s) return;
    if (!state.watchId) { alert('لا يوجد Watch نشط/محدد'); return; }
    try {
      const r = await fetch(`/api/timeline/${encodeURIComponent(state.watchId)}`, {
        method: 'PUT',
        headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + (s.token||'') },
        body: JSON.stringify({ events: state.events })
      });
      if (!r.ok) throw new Error('save failed');
      const out = await r.json();
      state.timeline = out;
      alert('تم حفظ الأحداث.');
      window.dispatchEvent(new CustomEvent('timeline:changed'));
    } catch (e) { alert('تعذر الحفظ'); }
  });

  startBtn?.addEventListener('click', async () => {
    const s = requireAdmin(); if (!s) return;
    if (!state.watchId) { alert('لا يوجد Watch نشط/محدد'); return; }
    try {
      const r = await fetch(`/api/timeline/${encodeURIComponent(state.watchId)}/start`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + (s.token||'') },
        body: JSON.stringify({ startAt: Date.now() })
      });
      if (!r.ok) throw new Error('start failed');
      const out = await r.json();
      state.timeline = out;
      alert('تم تشغيل الـ Timeline.');
      window.dispatchEvent(new CustomEvent('timeline:changed'));
    } catch (e) { alert('تعذر تشغيل الـ Timeline'); }
  });

  stopBtn?.addEventListener('click', async () => {
    const s = requireAdmin(); if (!s) return;
    if (!state.watchId) { alert('لا يوجد Watch نشط/محدد'); return; }
    try {
      const r = await fetch(`/api/timeline/${encodeURIComponent(state.watchId)}/stop`, {
        method: 'POST',
        headers: { 'Authorization':'Bearer ' + (s.token||'') }
      });
      if (!r.ok) throw new Error('stop failed');
      alert('تم إيقاف الـ Timeline.');
      window.dispatchEvent(new CustomEvent('timeline:changed'));
    } catch (e) { alert('تعذر الإيقاف'); }
  });

  closeBtn?.addEventListener('click', () => closeModal(), { passive: true });

  btn?.addEventListener('click', async () => {
    const s = requireAdmin(); if (!s) return;
    try {
      const active = await API.getActiveWatch();
      if (!active) { alert('لا توجد جلسة مشاهدة نشطة. أنشئ Watch أولًا.'); return; }
      state.watchId = active.id;
      watchIdLabel.textContent = `Watch ID: ${active.id}`;
      try {
        const r = await fetch(`/api/timeline/${encodeURIComponent(active.id)}`, {
          headers: { 'Authorization':'Bearer ' + (s.token||'') }
        });
        const t = r.ok ? await r.json() : null;
        state.timeline = t;
        state.events = Array.isArray(t?.events) ? t.events.slice() : [];
      } catch { state.events = []; }
      renderList();
      openModal();
    } catch (e) {
      alert('تعذر جلب الجلسة النشطة');
    }
  }, { passive: false });
})();
