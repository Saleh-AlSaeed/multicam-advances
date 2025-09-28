<!-- احفظ هذا الملف باسم: public/api-base.js -->
<script>
(function() {
  // ✏️ غيّر هذا إلى دومين خدمتك على Render عند الفصل بين Netlify (واجهة) وRender (API):
  // مثال: 'https://multicam-advances.onrender.com'
  const DEFAULT_API_BASE = ''; // اتركه فارغًا لو الواجهة والخادم على نفس الدومين

  const stored = (localStorage.getItem('API_BASE') || '').trim();
  const sameOrigin = (
    location.hostname === 'localhost' ||
    /\.onrender\.com$/i.test(location.hostname) ||
    /\.koyeb\.app$/i.test(location.hostname)
  );

  // إذا نحن على نفس الدومين، لا نحتاج Base. لو كنا على Netlify، استخدم المخزن أو الافتراضي.
  const base = stored || (sameOrigin ? '' : DEFAULT_API_BASE);

  window.API_BASE = base; // '' يعني relative (نفس الدومين)
  window.setApiBase = function(u) {
    localStorage.setItem('API_BASE', u || '');
    window.API_BASE = (u || '');
    console.log('[api-base] API_BASE =', window.API_BASE || '(same-origin)');
  };

  console.log('[api-base] using', window.API_BASE || '(same-origin)');
})();
</script>
