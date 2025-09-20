const API = {
  async _request(path, opts = {}) {
    const r = await fetch(path, opts);
    const text = await r.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!r.ok) {
      const msg = typeof data === 'string' ? data : (data?.error || r.statusText);
      throw new Error(`${r.status} ${msg}`);
    }
    return data;
  },

  async getConfig() { return this._request('/api/config'); },

  async login(username, password) {
    const data = await this._request('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    localStorage.setItem('session', JSON.stringify(data));
    return data;
  },

  session() {
    const s = localStorage.getItem('session');
    return s ? JSON.parse(s) : null;
  },

  async logout() {
    const s = API.session();
    if (!s) return;
    try {
      await this._request('/api/logout', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + s.token }
      });
    } finally {
      localStorage.removeItem('session');
    }
  },

  async token(roomName, identity, publish=false, subscribe=true) {
    const s = API.session();
    return this._request('/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + s.token
      },
      body: JSON.stringify({ roomName, publish, subscribe, identity })
    });
  },

  async createWatch(selection) {
    const s = API.session();
    return this._request('/api/create-watch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.token },
      body: JSON.stringify({ selection })
    });
  },

  async getActiveWatch() {
    const s = API.session();
    return this._request('/api/watch/active', {
      headers: { 'Authorization': 'Bearer ' + s.token }
    });
  },

  async getWatch(id) {
    const s = API.session();
    return this._request('/api/watch/' + id, {
      headers: { 'Authorization': 'Bearer ' + s.token }
    });
  }
};

function goTo(role, room) {
  if (role === 'admin') location.href = '/admin.html';
  else if (role === 'city') location.href = `/city.html?room=${encodeURIComponent(room || 'city-1')}`;
  else if (role === 'watcher') location.href = `/watchers.html`;
}

function requireAuth() {
  const s = API.session();
  if (!s) { location.href = '/'; return null; }
  return s;
}

function logoutBtnHandler(btn) {
  btn?.addEventListener('click', async () => {
    try { await API.logout(); } finally { location.href = '/'; }
  });
}

function qs(k, def='') {
  const u = new URL(location.href);
  return u.searchParams.get(k) ?? def;
}
