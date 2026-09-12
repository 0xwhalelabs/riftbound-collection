// 정적 파일 서버 + Firebase 인증 핸들러 프록시
// /__/* 요청을 firebaseapp.com으로 중계해 로그인 창에 우리 도메인이 표시되게 함
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const FIREBASE_HOST = 'riftbound-whale-28edd.firebaseapp.com';
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(req.url.split('?')[0]); }
  catch { res.writeHead(400); res.end('Bad Request'); return; }
  if (urlPath === '/t1korean' || urlPath === '/t1korean/') urlPath = '/t1korean/index.html';

  if (urlPath === '/t1korean/admin' || urlPath === '/t1korean/admin/') urlPath = '/t1korean/admin.html';

  // Firebase rules validate both public and authenticated administrator requests.
  if (urlPath === '/api/t1-image') {
    const photoPath = new URL(req.url, 'http://localhost').searchParams.get('path') || '';
    if (req.method !== 'GET' || !/^t1Evidence\/[A-Za-z0-9_-]+\/KR-(Doran|Oner|Faker|Gumayusi|Keria)-[0-9]{1,4}\/[012]\.jpg$/.test(photoPath)) {
      res.writeHead(400); res.end('Invalid image path'); return;
    }
    const upstream = https.get({
      hostname: 'firebasestorage.googleapis.com',
      path: '/v0/b/riftbound-whale-28edd.firebasestorage.app/o/' + encodeURIComponent(photoPath) + '?alt=media',
      timeout: 15000,
      headers: req.headers.authorization ? {Authorization: req.headers.authorization} : {},
    }, image => {
      if (image.statusCode !== 200) {
        image.resume(); res.writeHead(404, {'Cache-Control':'no-store'}); res.end('Image unavailable'); return;
      }
      res.writeHead(200, {'Content-Type':'image/jpeg', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
      image.on('error', () => res.destroy());
      image.pipe(res);
    });
    upstream.on('timeout', () => upstream.destroy());
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Image unavailable'); });
    res.on('close', () => upstream.destroy());
    return;
  }

  // Firebase 인증 핸들러 프록시
  if (urlPath.startsWith('/__/')) {
    const opts = {
      hostname: FIREBASE_HOST,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: FIREBASE_HOST },
    };
    const proxy = https.request(opts, pres => {
      res.writeHead(pres.statusCode, pres.headers);
      pres.pipe(res);
    });
    proxy.on('error', () => { res.writeHead(502); res.end('proxy error'); });
    req.pipe(proxy);
    return;
  }

  // 정적 파일 서빙
  let filePath = path.normalize(path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath));
  if (!filePath.startsWith(ROOT + path.sep) || urlPath.split('/').some(part => part.startsWith('.')) || urlPath.startsWith('/firebase/') || urlPath === '/server.js' || urlPath === '/package.json' || urlPath === '/package-lock.json') { res.writeHead(403); res.end(); return; }
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('Not Found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    const noCache = ['.html', '.js', '.css', '.json'].includes(ext);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': noCache ? 'no-cache' : 'public, max-age=86400',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}).listen(PORT, '0.0.0.0', () => console.log('listening on ' + PORT));
