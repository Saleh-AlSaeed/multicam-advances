// ===== Backup/Restore (Admin) =====

// public/backup-admin.js
console.log('[backup-admin] placeholder loaded');

(function backupAdmin() {
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const importFile = document.getElementById('importFile');

  function requireAdmin() {
    const s = API.session?.();
    if (!s || s.role !== 'admin') {
      alert('يلزم دخول كمسؤول (admin)');
      return null;
    }
    return s;
  }

  function download(filename, text) {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 500);
  }

  async function doExport() {
    const s = requireAdmin(); if (!s) return;
    try {
      const r = await fetch('/api/backup', {
        headers: { 'Authorization': 'Bearer ' + (s.token || '') }
      });
      if (!r.ok) throw new Error('backup failed');
      const data = await r.json();
      const ts = new Date().toISOString().replace(/[:-]/g,'').replace(/\..+/,'');
      download(`multicam-backup-${ts}.json`, JSON.stringify(data, null, 2));
    } catch (e) {
      alert('تعذر إنشاء النسخة الاحتياطية.');
      console.error('[backup] export error', e);
    }
  }

  async function doImport(file) {
    const s = requireAdmin(); if (!s) return;
    try {
      const txt = await file.text();
      let parsed = null;
      try { parsed = JSON.parse(txt); } catch { throw new Error('ملف JSON غير صالح'); }
      // اختر وضع الدمج أو الاستبدال
      let mode = prompt('طريقة الاستيراد: اكتب "replace" للاستبدال الكامل أو "merge" للدمج (افتراضي merge):', 'merge');
      mode = (mode || 'merge').toLowerCase() === 'replace' ? 'replace' : 'merge';

      const r = await fetch('/api/backup?mode=' + encodeURIComponent(mode), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (s.token || '')
        },
        body: JSON.stringify(parsed)
      });
      if (!r.ok) throw new Error('restore failed');
      const out = await r.json();
      alert('تم الاستيراد بنجاح (' + (out?.mode || mode) + ').');
      // لا حاجة لإعادة تحميل الصفحة إلا إذا رغبت
    } catch (e) {
      alert('تعذر استيراد النسخة الاحتياطية: ' + (e?.message || ''));
      console.error('[backup] import error', e);
    }
  }

  exportBtn?.addEventListener('click', doExport, { passive: true });
  importBtn?.addEventListener('click', () => importFile?.click(), { passive: true });
  importFile?.addEventListener('change', (e) => {
    const f = e.target?.files?.[0];
    if (f) doImport(f);
    importFile.value = '';
  }, { passive: false });
})();
