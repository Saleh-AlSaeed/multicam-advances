const API = {
  logout: async () => {
    try { localStorage.removeItem('session'); } catch (_) {}
  },
  session: () => {
    try {
      const s = localStorage.getItem('session');
      return s ? JSON.parse(s) : null;
    } catch (_) {
      return null;
    }
  }
};

function logoutBtnHandler(btn){
  btn?.addEventListener('click', async () => {
    await API.logout();
    location.href = '/';
  });
}

function qs(k, def=''){
  const u = new URL(location.href);
  return u.searchParams.get(k) ?? def;
}
