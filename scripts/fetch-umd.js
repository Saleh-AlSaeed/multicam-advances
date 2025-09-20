/* scripts/fetch-umd.js */
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// أين سنحفظ الـ UMD
const outDir  = path.join(__dirname, '..', 'public', 'vendor');
const outFile = path.join(outDir, 'livekit-client.umd.min.js');

// من أين ننزّله (مسار صحيح ومجرّب)
const UMD_URL = 'https://cdn.jsdelivr.net/npm/@livekit/client@2.3.0/dist/livekit-client.umd.min.js';

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    }).on('error', reject);
  });
}

(async () => {
  try {
    await download(UMD_URL, outFile);
    console.log('[fetch-umd] downloaded:', UMD_URL, '->', outFile);
  } catch (e) {
    // لا نفشل البناء – اللودر في الواجهة سيحاول CDN تلقائيًا
    console.warn('[fetch-umd] warn:', e?.message || e);
  }
})();
