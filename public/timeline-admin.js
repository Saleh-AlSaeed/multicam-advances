// ===== Timeline Admin UI (works with /api/timeline/* endpoints) =====
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

  function uid() { return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16)); }

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
          `• ${ev.type}  |  t=${ev.startOffsetMs}ms  dur=${ev.durationMs}ms  ` +
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
          } catch (e) {
            alert('تعذر حذف الحدث'); console.error(e);
          }
        };

        row.appendChild(meta);
        row.appendChild(del);
        listEl.appendChild(row);
      });
  }

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
    // محتوى الكاميرا من مدينة محددة (لو كتبت city-3 مثلاً)
    if (/^city-\d+$/i.test(src)) { payload.city = src; }

    return {
      id: uid(),
      type: t,
      startOffsetMs: start,
      durationMs: dur,
      payload
    };
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
    } catch (e) {
      alert('تعذر الحفظ'); console.error(e);
    }
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
    } catch (e) {
      alert('تعذر تشغيل الـ Timeline'); console.error(e);
    }
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
    } catch (e) {
      alert('تعذر الإيقاف'); console.error(e);
    }
  });

  closeBtn?.addEventListener('click', () => closeModal(), { passive: true });

  btn?.addEventListener('click', async () => {
    const s = requireAdmin(); if (!s) return;

    // استخرج الـ watch الحالي (النشط) ليُربط به التايملاين
    try {
      const active = await API.getActiveWatch();
      if (!active) {
        alert('لا توجد جلسة مشاهدة نشطة. أنشئ Watch أولًا.');
        return;
      }
      state.watchId = active.id;
      watchIdLabel.textContent = `Watch ID: ${active.id}`;
      // اجلب التايملاين إن وُجد
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
      alert('تعذر جلب الجلسة النشطة'); console.error(e);
    }
  }, { passive: false });
})();
