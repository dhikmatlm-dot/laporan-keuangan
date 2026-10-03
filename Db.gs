/**
 * Db.gs — akses tabel di Google Sheets. Semua sel disimpan sebagai teks ('@')
 * agar kode akun seperti "2004-1" dan tanggal "2026-01-31" tidak diubah oleh Sheets.
 */
var SS_CACHE_ = {};

function ss_(id) { return SS_CACHE_[id] || (SS_CACHE_[id] = SpreadsheetApp.openById(id)); }

function sheet_(ssId, name) {
  var ss = ss_(ssId), sh = ss.getSheetByName(name), cols = SCHEMA[name];
  if (!cols) throw new Error('Tabel tidak dikenal: ' + name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, cols.length).setValues([cols]);
    sh.setFrozenRows(1);
  } else {
    // tambahkan kolom baru bila skema bertambah
    var head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
    var missing = cols.filter(function (c) { return head.indexOf(c) < 0; });
    if (missing.length) {
      var start = head.filter(function (h) { return h; }).length + 1;
      sh.getRange(1, start, sh.getMaxRows(), missing.length).setNumberFormat('@');
      sh.getRange(1, start, 1, missing.length).setValues([missing]);
    }
  }
  return sh;
}

function cell_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().substring(0, 10);
  if (typeof v === 'boolean') return v ? 'Y' : '';
  var s = String(v);
  // cegah teks ditafsirkan sebagai rumus
  if (s.charAt(0) === '=' || s.charAt(0) === '+') s = "'" + s;
  return s;
}
function uncell_(v) {
  if (v instanceof Date) return v.toISOString().substring(0, 10);
  var s = String(v === null || v === undefined ? '' : v);
  return s.charAt(0) === "'" && (s.charAt(1) === '=' || s.charAt(1) === '+') ? s.substring(1) : s;
}

function readTable_(ssId, name) {
  var sh = sheet_(ssId, name), last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(1, 1, last, sh.getLastColumn()).getValues();
  var head = vals[0].map(String), out = [];
  for (var r = 1; r < vals.length; r++) {
    var o = {}, any = false;
    for (var c = 0; c < head.length; c++) { if (!head[c]) continue; o[head[c]] = uncell_(vals[r][c]); if (o[head[c]] !== '') any = true; }
    if (any) out.push(o);
  }
  return out;
}

function headOf_(sh) { return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String); }

function toRows_(head, objs) {
  return objs.map(function (o) { return head.map(function (h) { return cell_(o[h]); }); });
}

function ensureRows_(sh, needLast) {
  var max = sh.getMaxRows();
  if (needLast > max) sh.insertRowsAfter(max, needLast - max + 200);
}

function appendRows_(ssId, name, objs) {
  if (!objs.length) return;
  var sh = sheet_(ssId, name), head = headOf_(sh), last = sh.getLastRow();
  ensureRows_(sh, last + objs.length);
  sh.getRange(last + 1, 1, objs.length, head.length).setValues(toRows_(head, objs));
}

/** Ganti seluruh isi tabel. */
function writeTable_(ssId, name, objs) {
  var sh = sheet_(ssId, name), head = headOf_(sh), last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, head.length).clearContent();
  if (objs.length) {
    ensureRows_(sh, objs.length + 1);
    sh.getRange(2, 1, objs.length, head.length).setValues(toRows_(head, objs));
  }
}

/** Ubah satu baris berdasarkan kunci. Mengembalikan true bila ditemukan. */
function updateRow_(ssId, name, keyField, keyVal, patch) {
  var sh = sheet_(ssId, name), head = headOf_(sh), last = sh.getLastRow();
  if (last < 2) return false;
  var kc = head.indexOf(keyField) + 1;
  var keys = sh.getRange(2, kc, last - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) {
    if (uncell_(keys[i][0]) === String(keyVal)) {
      var row = sh.getRange(i + 2, 1, 1, head.length).getValues()[0];
      head.forEach(function (h, c) { if (patch.hasOwnProperty(h)) row[c] = cell_(patch[h]); else row[c] = cell_(uncell_(row[c])); });
      sh.getRange(i + 2, 1, 1, head.length).setValues([row]);
      return true;
    }
  }
  return false;
}

/** Simpan (ubah bila ada, tambah bila belum). */
function upsertRow_(ssId, name, keyField, obj) {
  if (!updateRow_(ssId, name, keyField, obj[keyField], obj)) appendRows_(ssId, name, [obj]);
}

/** Hapus baris yang memenuhi predikat. Mengembalikan jumlah yang dihapus. */
function deleteRows_(ssId, name, pred) {
  var all = readTable_(ssId, name), keep = all.filter(function (o) { return !pred(o); });
  if (keep.length !== all.length) writeTable_(ssId, name, keep);
  return all.length - keep.length;
}

function getSetting_(dbId, key, def) {
  var row = readTable_(dbId, 'Settings').filter(function (s) { return s.key === key; })[0];
  return row ? row.value : (def === undefined ? '' : def);
}
function setSetting_(dbId, key, value) { upsertRow_(dbId, 'Settings', 'key', { key: key, value: value }); }
