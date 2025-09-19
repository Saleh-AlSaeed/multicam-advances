// ===== API =====
const API = {
  async getConfig() {
    const r = await fetch('/api/config');
    return r.json();
  },
  async login(username, password) {
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!r.ok) throw new Error('خطأ في الدخول');
    const data = await r.json();
    localStorage.setItem('session', JSON.stringify(data));
    return data;
  },
  session() {
    try {
      const s = localStorage.getItem('session');
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  },
  async logout() {
    const s = API.session();
    if (!s) return;
    try {
      await fetch('/api/logout', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + (s?.token || '') }
      });
    } catch (_) {}
  },
  async token(roomName, identity, publish=false, subscribe=true) {
    const s = API.session();
    const r = await fetch('/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (s?.token || '')
      },
      body: JSON.stringify({ roomName, publish, subscribe, identity })
    });
    if (!r.ok) throw new Error('فشل إنشاء التوكن');
    return r.json();
  },
  async createWatch(selection) {
    const s = API.session();
    const r = await fetch('/api/create-watch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (s?.token || '')
      },
      body: JSON.stringify({ selection })
    });
    if (!r.ok) throw new Error('فشل إنشاء جلسة المشاهدة');
    return r.json();
  },
  async getActiveWatch() {
    const s = API.session();
    const r = await fetch('/api/watch/active', {
      headers: { 'Authorization': 'Bearer ' + (s?.token || '') }
    });
    return r.json();
  },
  async getWatch(id) {
    const s = API.session();
    const r = await fetch('/api/watch/' + id, {
      headers: { 'Authorization': 'Bearer ' + (s?.token || '') }
    });
    if (!r.ok) throw new Error('غير موجود');
    return r.json();
  }
};

// ===== Routing =====
function goTo(role, room) {
  if (role === 'admin') location.href = '/admin.html';
  else if (role === 'city') location.href = `/city.html?room=${encodeURIComponent(room)}`;
  else if (role === 'watcher') location.href = `/watchers.html`;
}

function requireAuth() {
  const s = API.session();
  if (!s) { location.href = '/'; return null; }
  return s;
}

// ===== Logout button (robust) =====
function logoutBtnHandler(btn) {
  if (!btn) return;
  const onClick = async (ev) => {
    ev.preventDefault();
    try { await API.logout(); } catch (_) {}
    try { localStorage.removeItem('session'); } catch (_) {}
    // استخدم replace حتى لا تعود الصفحة السابقة من الكاش
    location.replace('/');
  };
  // إزالة مستمعين قدامى إن وجدوا ثم إضافة الحالي
  btn.removeEventListener('click', onClick);
  btn.addEventListener('click', onClick, { passive: false });
}

// ===== Helpers =====
function qs(k, def='') {
  const u = new URL(location.href);
  return u.searchParams.get(k) ?? def;
}
