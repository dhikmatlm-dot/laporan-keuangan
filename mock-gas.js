/**
 * mock-gas.js — tiruan layanan Google (SpreadsheetApp, DriveApp, dll.) di memori,
 * supaya backend Apps Script dapat dijalankan dan diuji di Node tanpa akun Google.
 * Hanya untuk pengembangan lokal; tidak ikut di-deploy.
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function createBackend(opts) {
  opts = opts || {};
  const props = Object.assign({ DEV_MODE: '1', ANTHROPIC_API_KEY: 'lokal-tiruan' }, opts.props || {});
  const books = {}, folders = {}, files = {}, mails = [];
  let seq = 0;
  const nid = (p) => p + (++seq).toString(36) + crypto.randomBytes(3).toString('hex');

  function Sheet(name) { this.name = name; this.rows = []; }
  Sheet.prototype.getMaxRows = function () { return 1e7; };
  Sheet.prototype.insertRowsAfter = function () {};
  Sheet.prototype.setFrozenRows = function () {};
  Sheet.prototype.getLastRow = function () {
    for (let r = this.rows.length - 1; r >= 0; r--) if ((this.rows[r] || []).some((v) => v !== '' && v != null)) return r + 1;
    return 0;
  };
  Sheet.prototype.getLastColumn = function () { return this.rows.reduce((m, r) => Math.max(m, (r || []).length), 0); };
  Sheet.prototype.getRange = function (r, c, nr, nc) {
    const sh = this; nr = nr || 1; nc = nc || 1;
    return {
      setNumberFormat() { return this; },
      getValues() {
        const out = [];
        for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (sh.rows[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : v); } out.push(row); }
        return out;
      },
      setValues(vals) {
        if (vals.length !== nr || vals.some((v) => v.length !== nc)) throw new Error('Ukuran data tidak cocok dengan range');
        for (let i = 0; i < nr; i++) { const row = sh.rows[r - 1 + i] || (sh.rows[r - 1 + i] = []); for (let j = 0; j < nc; j++) row[c - 1 + j] = vals[i][j]; }
        return this;
      },
      clearContent() { for (let i = 0; i < nr; i++) { const row = sh.rows[r - 1 + i]; if (row) for (let j = 0; j < nc; j++) row[c - 1 + j] = ''; } return this; }
    };
  };
  function Book(name) { this.id = nid('ss'); this.name = name; this.sheets = {}; books[this.id] = this; files[this.id] = new File(name, this.id); }
  Book.prototype.getId = function () { return this.id; };
  Book.prototype.getSheetByName = function (n) { return this.sheets[n] || null; };
  Book.prototype.insertSheet = function (n) { return (this.sheets[n] = new Sheet(n)); };

  function File(name, id) { this.id = id || nid('f'); this.name = name; this.trashed = false; files[this.id] = this; }
  File.prototype.getId = function () { return this.id; };
  File.prototype.getUrl = function () { return 'https://drive.example/file/' + this.id; };
  File.prototype.moveTo = function (f) { this.parent = f.id; return this; };
  File.prototype.setTrashed = function (t) { this.trashed = t; return this; };
  function Folder(name, parent) { this.id = nid('d'); this.name = name; this.parent = parent; this.children = []; this.files = []; this.viewers = []; folders[this.id] = this; }
  Folder.prototype.getId = function () { return this.id; };
  Folder.prototype.createFolder = function (n) { const f = new Folder(n, this.id); this.children.push(f); return f; };
  Folder.prototype.getFoldersByName = function (n) { const l = this.children.filter((c) => c.name === n); let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; };
  Folder.prototype.createFile = function (blob) { const f = new File(blob.name); f.size = blob.bytes.length; f.parent = this.id; this.files.push(f); return f; };
  Folder.prototype.addViewer = function (e) { this.viewers.push(e); return this; };
  Folder.prototype.removeViewer = function (e) { this.viewers = this.viewers.filter((x) => x !== e); return this; };
  const rootDrive = new Folder('My Drive', null);

  const cache = {};
  const sandbox = {
    console, JSON, Math, Date, String, Number, Array, Object, Error, isNaN, parseFloat, parseInt, encodeURIComponent, RegExp,
    Logger: { log: (m) => opts.quiet || console.log('[Logger]', m) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) },
    SpreadsheetApp: { create: (n) => new Book(n), openById: (id) => { if (!books[id]) throw new Error('Spreadsheet tidak ada: ' + id); return books[id]; } },
    DriveApp: {
      createFolder: (n) => rootDrive.createFolder(n),
      getFolderById: (id) => { if (!folders[id]) throw new Error('Folder tidak ada: ' + id); return folders[id]; },
      getFileById: (id) => { if (!files[id]) throw new Error('File tidak ada: ' + id); return files[id]; }
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      newBlob: (bytes, mime, name) => ({ bytes, mime, name }),
      base64Decode: (s) => Array.from(Buffer.from(s, 'base64')),
      base64EncodeWebSafe: (b) => Buffer.from(b).toString('base64url'),
      computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(s).digest())
    },
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    MailApp: { sendEmail: (m) => { mails.push(m); if (!opts.quiet) console.log('[Email] ke ' + m.to + ' | ' + m.subject); } },
    Session: { getEffectiveUser: () => ({ getEmail: () => opts.owner || 'admin@demo.test' }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ content: s, setMimeType() { return this; } }) },
    UrlFetchApp: {
      fetch: (url, o) => {
        // tiruan Claude API: narasi contoh agar halaman Analisa dapat diuji tanpa kunci API
        const body = JSON.parse((o && o.payload) || '{}');
        const ask = (body.messages && body.messages[0].content) || '';
        let text = 'Ini narasi contoh dari server lokal. Pada pemasangan nyata, bagian ini ditulis oleh Claude berdasarkan angka laporan periode berjalan.\n\nPendapatan, laba, dan posisi kas dibahas di sini beserta perbandingannya dengan bulan lalu dan YTD.\n- Temuan contoh pertama\n- Temuan contoh kedua\n- Temuan contoh ketiga';
        if (ask.indexOf('RISIKO KEUANGAN') >= 0) text = JSON.stringify([{ risiko: 'Piutang menumpuk pada satu pelanggan', tingkat: 'Tinggi', indikator: 'Contoh: sebagian piutang berumur lebih dari 90 hari', mitigasi: 'Penagihan terjadwal dan batas kredit' }, { risiko: 'Ketergantungan pada utang bank', tingkat: 'Sedang', indikator: 'Contoh: DER di atas 1x', mitigasi: 'Percepat pelunasan dari arus kas operasi' }]);
        if (ask.indexOf('REKOMENDASI DAN SARAN') >= 0) text = JSON.stringify([{ prioritas: 1, tindakan: 'Tagih piutang yang lewat jatuh tempo', alasan: 'Contoh angka aging', tenggat: '30 hari' }, { prioritas: 2, tindakan: 'Tinjau beban yang naik', alasan: 'Contoh varians biaya', tenggat: '60 hari' }]);
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ content: [{ type: 'text', text }] }) };
      }
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const dir = path.join(__dirname, '..', 'backend');
  fs.readdirSync(dir).filter((f) => f.endsWith('.gs')).sort().forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), sandbox, { filename: f });
  });

  function call(action, email, payload, clientId) {
    const res = sandbox.doPost({ postData: { contents: JSON.stringify({ action, token: 'dev:' + email, clientId, payload }) } });
    return JSON.parse(res.content);
  }
  function must(action, email, payload, clientId) {
    const r = call(action, email, payload, clientId);
    if (!r.ok) throw new Error(action + ' gagal: ' + r.error);
    return r.data;
  }
  return { sandbox, call, must, mails, books, folders, files, props, raw: (body) => JSON.parse(sandbox.doPost({ postData: { contents: body } }).content) };
}

module.exports = { createBackend };
