// public/common.js
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
    try {
      if (s) await fetch('/api/logout', { method:'POST', headers: { 'Authorization': 'Bearer ' + s.token } });
    } catch {}
    localStorage.removeItem('session');
  },
  async token(roomName, identity, publish=false, subscribe=true) {
    const s = API.session();
    const r = await fetch('/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + s.token
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
        'Authorization': 'Bearer ' + s.token
      },
      body: JSON.stringify({ selection })
    });
    if (!r.ok) throw new Error('فشل إنشاء جلسة المشاهدة');
    return r.json();
  },
  async getActiveWatch() {
    const s = API.session();
    const r = await fetch('/api/watch/active', {
      headers: { 'Authorization': 'Bearer ' + s.token }
    });
    return r.json();
  },
  async getWatch(id) {
    const s = API.session();
    const r = await fetch('/api/watch/' + id, {
      headers: { 'Authorization': 'Bearer ' + s.token }
    });
    if (!r.ok) throw new Error('غير موجود');
    return r.json();
  }
};

// تنقّل حسب الدور
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

// زر الخروج (يعمل في كل الصفحات)
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('logoutBtn');
  if (btn) {
    btn.addEventListener('click', async () => {
      try { await API.logout(); } finally { location.href = '/'; }
    });
  }
});

// فحص تحميل LiveKit UMD
function ensureLivekitLoaded() {
  if (!window.livekit) {
    throw new Error('LiveKit client did not load');
  }
}

// أداة سريعة لمنح الإذن (بدون LiveKit) لتسخين الصلاحيات
async function warmupPermissions(audio = true, video = true) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio, video });
    stream.getTracks().forEach(t => t.stop());
    return true;
  } catch (e) {
    alert('الرجاء السماح للكاميرا/المايك من المتصفح.');
    return false;
  }
}

window.AppCommon = { ensureLivekitLoaded, warmupPermissions };
