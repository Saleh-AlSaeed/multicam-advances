document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  try { await API.logout(); } catch (_) {}
  location.href = '/';
});
