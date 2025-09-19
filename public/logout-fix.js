document.addEventListener('DOMContentLoaded', () => {
  const b = document.getElementById('logoutBtn');
  if (!b || b.dataset.bound === '1') return;
  b.dataset.bound = '1';
  b.addEventListener('click', async (e) => {
    e.preventDefault();
    try { await API.logout(); } catch (_) {}
    location.href = '/';
  });
});
