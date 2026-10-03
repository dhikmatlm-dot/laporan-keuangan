/**
 * local-server.js — jalankan aplikasi di komputer sendiri tanpa akun Google (data contoh di memori).
 *   node tools/local-server.js   lalu buka http://localhost:8787
 * Masuk sebagai admin@demo.test (Super Admin) atau klien.a@demo.test (Klien).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createBackend } = require('./mock-gas');
const { seed } = require('./seed');

const be = createBackend({ quiet: false });
seed(be);
const root = path.join(__dirname, '..', 'frontend');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.svg': 'image/svg+xml' };
const devConfig = "window.APP_CONFIG={API_URL:'/api',GOOGLE_CLIENT_ID:'',APP_NAME:'Sistem Laporan Keuangan',APP_SHORT:'Laporan Keuangan',KONSULTAN:'Konsultan Akuntansi, Keuangan, Pajak, dan Manajemen',DEV_LOGIN:true};";

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let out;
      try { out = be.raw(body); } catch (e) { out = { ok: false, error: String(e) }; }
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out));
    });
    return;
  }
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  if (p === '/config.js') { res.writeHead(200, { 'Content-Type': types['.js'] }); return res.end(devConfig); }
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end('Tidak ditemukan'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(process.env.PORT || 8787, () => console.log('Buka http://localhost:' + (process.env.PORT || 8787)));
