// ===== API Base + helpers =====
(function(){
  const raw = (window.API_BASE ?? '');
  const base = (''+raw).replace(/\/+$/,''); // بدون / في النهاية
  window.apiFetch = function apiFetch(path, opts) {
    const url = base + path;
    return fetch(url, opts);
  };
})();

const API = {
  async getConfig() { const r = await apiFetch('/api/config'); return r.json(); },
  async login(username, password) {
    const r = await apiFetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!r.ok) throw new Error('خطأ في الدخول');
    const data = await r.json();
    localStorage.setItem('session', JSON.stringify(data));
    return data;
  },
  session() {
    try { const s = localStorage.getItem('session'); return s ? JSON.parse(s) : null; }
    catch { return null; }
  },
  async logout() {
    const s = API.session();
    if (!s) return;
    try {
      await apiFetch('/api/logout', { method:'POST', headers: { 'Authorization': 'Bearer ' + (s?.token || '') } });
    } catch(_) {}
  },
  async token(roomName, identity, publish=false, subscribe=true) {
    const s = API.session();
    const r = await apiFetch('/api/token', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + (s?.token || '') },
      body: JSON.stringify({ roomName, publish, subscribe, identity })
    });
    if (!r.ok) throw new Error('فشل إنشاء التوكن');
    return r.json();
  },
  async createWatch(selection) {
    const s = API.session();
    const r = await apiFetch('/api/create-watch', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + (s?.token || '') },
      body: JSON.stringify({ selection })
    });
    if (!r.ok) throw new Error('فشل إنشاء جلسة المشاهدة');
    return r.json();
  },
  async getActiveWatch() {
    const s = API.session();
    const r = await apiFetch('/api/watch/active', { headers: { 'Authorization':'Bearer ' + (s?.token || '') } });
    return r.json();
  },
  async getWatch(id) {
    const s = API.session();
    const r = await apiFetch('/api/watch/' + id, { headers: { 'Authorization':'Bearer ' + (s?.token || '') } });
    if (!r.ok) throw new Error('غير موجود');
    return r.json();
  }
};

function goTo(role, room) {
  if (role === 'admin') location.href = '/admin.html';
  else if (role === 'city') location.href = `/city.html?room=${encodeURIComponent(room)}`;
  else if (role === 'watcher') location.href = `/watchers.html`;
}
function requireAuth() { const s = API.session(); if (!s) { location.href = '/'; return null; } return s; }

function attachLogout(btn) {
  if (!btn) return;
  const handler = async (e) => {
    e.preventDefault();
    try { await API.logout(); } catch(_) {}
    try { localStorage.removeItem('session'); } catch(_) {}
    location.replace('/');
  };
  btn.onclick = null;
  btn.addEventListener('click', handler, { passive:false });
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('logoutBtn');
  if (btn) attachLogout(btn);
});

function qs(k, def='') { const u = new URL(location.href); return u.searchParams.get(k) ?? def; }
