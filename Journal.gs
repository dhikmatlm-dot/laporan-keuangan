/**
 * Journal.gs — unggah jurnal, jurnal manual, deteksi duplikat, NDE, periode, dokumen bukti.
 *
 * Format baris (sesuai sheet "Jurnal Input"):
 *   no, tanggal, partner, invoice, top, ref (No Ref Dok), akun, lawan, deskripsi, valueOri, mataUang, kurs, dc, nilai, nde
 * Aturan utama: jumlah debit dan kredit setiap No Ref Dok harus sama; jika tidak, tidak dapat diposting.
 */

function normDate_(v) {
  if (v instanceof Date) return v.toISOString().substring(0, 10);
  var s = String(v === undefined || v === null ? '' : v).trim();
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) { var d = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/); if (d) m = [0, d[3], d[2], d[1]]; }
  if (!m) return '';
  var y = Number(m[1]), mo = Number(m[2]), da = Number(m[3]);
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || y < 1990 || y > 2100) return '';
  var dt = new Date(Date.UTC(y, mo - 1, da));
  if (dt.getUTCMonth() !== mo - 1) return '';
  return dt.toISOString().substring(0, 10);
}

function num_(v) {
  if (typeof v === 'number') return v;
  var s = String(v === undefined || v === null ? '' : v).replace(/rp/i, '').replace(/\s/g, '');
  if (!s) return NaN;
  var neg = /^\(.*\)$/.test(s) || s.charAt(0) === '-';
  s = s.replace(/[()\-]/g, '');
  var hasDot = s.indexOf('.') >= 0, hasComma = s.indexOf(',') >= 0;
  if (hasDot && hasComma) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, '');
  } else if (hasComma) {
    s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (hasDot && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  var n = Number(s);
  return neg ? -n : n;
}

function lockedPeriods_(dbId) {
  var o = {};
  readTable_(dbId, 'Periods').forEach(function (p) { if (p.status === 'LOCKED') o[p.periode] = true; });
  return o;
}

function journalLines_(dbId) {
  return readTable_(dbId, 'Journal').map(function (j) { j.nilai = Number(j.nilai) || 0; j.top = Number(j.top) || 0; return j; });
}

/** Tanda tangan transaksi: dipakai untuk mendeteksi jurnal yang isinya sama walau No Ref berbeda. */
function signature_(lines) {
  return lines.map(function (l) { return [l.tanggal, l.akun, String(l.dc).charAt(0), Math.round(l.nilai * 100)].join('|'); }).sort().join(';');
}

function validateRows_(client, rows, sumber) {
  var coa = {}, errors = [], warnings = [], clean = [];
  readTable_(client.dbId, 'COA').forEach(function (a) { coa[a.kode] = a; });
  var locked = lockedPeriods_(client.dbId);
  var err = function (i, msg) { errors.push({ baris: i, pesan: msg }); };
  var warn = function (i, msg) { warnings.push({ baris: i, pesan: msg }); };

  (rows || []).forEach(function (r, idx) {
    var i = r.no || (idx + 1);
    var isEmpty = !r.tanggal && !r.ref && !r.akun && !r.nilai;
    if (isEmpty) return;
    var tanggal = normDate_(r.tanggal), ref = String(r.ref || '').trim(), akun = String(r.akun || '').trim(), lawan = String(r.lawan || '').trim();
    if (!tanggal) err(i, 'Tanggal kosong atau tidak valid: "' + (r.tanggal || '') + '"');
    else if (locked[tanggal.substring(0, 7)]) err(i, 'Periode ' + tanggal.substring(0, 7) + ' sudah dikunci.');
    if (!ref) err(i, 'No Ref Dok wajib diisi.');
    if (!akun) err(i, 'No Akun wajib diisi.');
    else if (!coa[akun]) err(i, 'No Akun ' + akun + ' tidak ada di COA.');
    if (lawan && !coa[lawan]) err(i, 'No Lawan Akun ' + lawan + ' tidak ada di COA.');
    var d = String(r.dc || '').trim().toUpperCase(), dc = '';
    if (d === 'DR' || d === 'D' || d === 'DEBIT' || d === 'DEBET') dc = 'DR';
    else if (d === 'CR' || d === 'C' || d === 'K' || d === 'KREDIT' || d === 'CREDIT') dc = 'CR';
    else err(i, 'Kolom DR/CR harus berisi DR atau CR.');
    var vo = num_(r.valueOri), kurs = num_(r.kurs), nilai = num_(r.nilai);
    var mu = String(r.mataUang || 'IDR').trim().toUpperCase() || 'IDR';
    if (isNaN(kurs) || kurs <= 0) kurs = 1;
    if (isNaN(nilai) && !isNaN(vo)) nilai = Math.round(vo * kurs * 100) / 100;
    if (isNaN(nilai)) err(i, 'Nilai kosong atau bukan angka.');
    else if (nilai < 0) { // nilai negatif dibalik sisinya
      nilai = -nilai; dc = dc === 'DR' ? 'CR' : dc === 'CR' ? 'DR' : dc;
      warn(i, 'Nilai negatif dibalik menjadi ' + dc + '.');
    }
    if (nilai === 0) warn(i, 'Nilai nol.');
    if (!isNaN(vo) && !isNaN(nilai) && Math.abs(Math.abs(vo) * kurs - nilai) > 1) warn(i, 'Nilai tidak sama dengan Value Original x Kurs.');
    var a = coa[akun];
    if (a && (a.kelompok === 'PIUTANG_USAHA' || a.kelompok === 'UTANG_USAHA') && !String(r.partner || '').trim()) warn(i, 'Akun ' + akun + ' sebaiknya diisi Partner dan No Invoice agar masuk daftar piutang/utang.');
    var ndeRaw = r.nde;
    var nde = (ndeRaw === undefined || ndeRaw === null || String(ndeRaw).trim() === '') ? (a && a.ndeDefault === 'Y' && dc === (KELOMPOK[a.kelompok].tipe === 'X' ? 'DR' : 'CR')) : isYes_(ndeRaw);
    clean.push({ no: i, tanggal: tanggal, partner: String(r.partner || '').trim(), invoice: String(r.invoice || '').trim(), top: Math.max(0, Math.round(num_(r.top)) || 0),
      ref: ref, akun: akun, lawan: lawan, deskripsi: String(r.deskripsi || '').trim(), valueOri: isNaN(vo) ? '' : vo, mataUang: mu, kurs: kurs, dc: dc, nilai: isNaN(nilai) ? 0 : nilai, nde: nde ? 'Y' : '' });
  });

  // keseimbangan per No Ref Dok
  var byRef = {}, order = [];
  clean.forEach(function (l) { if (!l.ref) return; if (!byRef[l.ref]) { byRef[l.ref] = []; order.push(l.ref); } byRef[l.ref].push(l); });
  var totalDebit = 0;
  order.forEach(function (ref) {
    var d = 0, c = 0;
    byRef[ref].forEach(function (l) { if (l.dc === 'DR') d += l.nilai; else if (l.dc === 'CR') c += l.nilai; });
    totalDebit += d;
    if (Math.abs(d - c) > 0.5) err(byRef[ref][0].no, 'No Ref ' + ref + ' tidak seimbang: debit ' + fmt_(d) + ', kredit ' + fmt_(c) + ', selisih ' + fmt_(d - c) + '.');
    var tgl = {}; byRef[ref].forEach(function (l) { tgl[l.tanggal.substring(0, 7)] = true; });
    if (Object.keys(tgl).length > 1) warn(byRef[ref][0].no, 'No Ref ' + ref + ' memuat lebih dari satu bulan.');
  });

  // duplikat: No Ref yang sudah ada, atau transaksi yang isinya sama
  var duplicates = [];
  if (!errors.length) {
    var existing = {}, sigOld = {};
    journalLines_(client.dbId).forEach(function (j) { (existing[j.ref] = existing[j.ref] || []).push(j); });
    Object.keys(existing).forEach(function (ref) { sigOld[signature_(existing[ref])] = ref; });
    var sigNew = {};
    order.forEach(function (ref) {
      var ls = byRef[ref], sig = signature_(ls), total = ls.reduce(function (t, l) { return t + (l.dc === 'DR' ? l.nilai : 0); }, 0);
      var info = { ref: ref, tanggal: ls[0].tanggal, total: total, deskripsi: ls[0].deskripsi };
      if (existing[ref]) duplicates.push(merge_(info, { jenis: 'REF', refLama: ref, pesan: 'No Ref ' + ref + ' sudah pernah diposting.', samaPersis: signature_(existing[ref]) === sig }));
      else if (sigOld[sig]) duplicates.push(merge_(info, { jenis: 'TRANSAKSI', refLama: sigOld[sig], pesan: 'Isi transaksi sama dengan No Ref ' + sigOld[sig] + ' yang sudah diposting.', samaPersis: true }));
      else if (sigNew[sig]) duplicates.push(merge_(info, { jenis: 'DALAM_FILE', refLama: sigNew[sig], pesan: 'Isi transaksi sama dengan No Ref ' + sigNew[sig] + ' di file yang sama.', samaPersis: true }));
      if (!sigNew[sig]) sigNew[sig] = ref;
    });
  }
  return { clean: clean, byRef: byRef, order: order, errors: errors, warnings: warnings, duplicates: duplicates,
    ringkasan: { baris: clean.length, jurnal: order.length, totalDebit: Math.round(totalDebit * 100) / 100, sumber: sumber } };
}

function merge_(a, b) { var o = {}; [a, b].forEach(function (x) { Object.keys(x).forEach(function (k) { o[k] = x[k]; }); }); return o; }
function fmt_(n) { return String(Math.round(n * 100) / 100).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

function apiJournalValidate(p, user, client) {
  var v = validateRows_(client, p.rows, p.sumber || 'UPLOAD');
  return { errors: v.errors, warnings: v.warnings, duplicates: v.duplicates, ringkasan: v.ringkasan };
}

/**
 * Posting. p.keputusan = { '<ref>': 'LANJUT' | 'LEWATI' | 'GANTI' } untuk setiap duplikat:
 *   LANJUT : posting keduanya (No Ref baru diberi akhiran bila bentrok)
 *   LEWATI : jurnal baru tidak diposting
 *   GANTI  : jurnal lama dihapus, jurnal baru diposting
 */
function apiJournalPost(p, user, client) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var sumber = p.sumber === 'MANUAL' ? 'MANUAL' : 'UPLOAD';
    var v = validateRows_(client, p.rows, sumber);
    if (v.errors.length) fail_('Masih ada ' + v.errors.length + ' kesalahan. Perbaiki dahulu: ' + v.errors[0].pesan);
    if (!v.order.length) fail_('Tidak ada jurnal untuk diposting.');
    var kep = p.keputusan || {}, skip = {}, hapusLama = {}, rename = {};
    var existingRefs = {};
    journalLines_(client.dbId).forEach(function (j) { existingRefs[j.ref] = true; });
    v.duplicates.forEach(function (d) {
      var k = kep[d.ref];
      if (k === 'LEWATI') skip[d.ref] = true;
      else if (k === 'GANTI') { if (d.jenis !== 'DALAM_FILE') hapusLama[d.refLama] = true; else skip[d.refLama] = true; }
      else if (k === 'LANJUT') {
        if (d.jenis === 'REF') { var n = 2; while (existingRefs[d.ref + '-R' + n]) n++; rename[d.ref] = d.ref + '-R' + n; existingRefs[rename[d.ref]] = true; }
      } else fail_('Ada jurnal yang terindikasi ganda (No Ref ' + d.ref + '). Tentukan: lanjutkan, lewati, atau ganti.');
    });
    var locked = lockedPeriods_(client.dbId);
    var uploadId = uid_('U'), at = nowIso_(), out = [], n = 0, total = 0, jurnal = 0;
    v.order.forEach(function (ref) {
      if (skip[ref]) return;
      jurnal++;
      v.byRef[ref].forEach(function (l) {
        n++;
        if (l.dc === 'DR') total += l.nilai;
        out.push({ id: uploadId + '-' + n, uploadId: uploadId, sumber: sumber, tanggal: l.tanggal, partner: l.partner, invoice: l.invoice, top: l.top,
          ref: rename[ref] || ref, akun: l.akun, lawan: l.lawan, deskripsi: l.deskripsi, valueOri: l.valueOri, mataUang: l.mataUang, kurs: l.kurs,
          dc: l.dc, nilai: l.nilai, nde: l.nde, by: user.email, at: at });
      });
    });
    var lamaList = Object.keys(hapusLama);
    if (lamaList.length) {
      var kena = journalLines_(client.dbId).filter(function (j) { return hapusLama[j.ref]; });
      kena.forEach(function (j) { if (locked[j.tanggal.substring(0, 7)]) fail_('Jurnal lama ' + j.ref + ' berada di periode terkunci.'); });
      deleteRows_(client.dbId, 'Journal', function (j) { return hapusLama[j.ref]; });
    }
    var fileUrl = '';
    if (p.b64 && p.fileName) {
      try {
        var ym = out.length ? out[0].tanggal.substring(0, 7) : at.substring(0, 7);
        var folder = ensureFolder_(ensureFolder_(DriveApp.getFolderById(client.folderId), '01_Upload'), ym);
        var f = folder.createFile(Utilities.newBlob(Utilities.base64Decode(p.b64), p.mime || 'application/octet-stream', at.substring(0, 19).replace(/[:T]/g, '') + '_' + p.fileName));
        fileUrl = f.getUrl();
      } catch (e) { fileUrl = ''; }
    }
    appendRows_(client.dbId, 'Journal', out);
    appendRows_(client.dbId, 'Uploads', [{ id: uploadId, at: at, by: user.email, role: user.role, sumber: sumber, fileName: p.fileName || '', fileUrl: fileUrl,
      baris: out.length, jurnal: jurnal, total: Math.round(total * 100) / 100, status: 'POSTED' }]);
    notifyAdmins_(user, client, sumber === 'MANUAL' ? 'Jurnal manual diinput' : 'Jurnal diunggah',
      'Jumlah jurnal : ' + jurnal + '\nJumlah baris  : ' + out.length + '\nTotal debit   : Rp ' + fmt_(total) +
      (p.fileName ? '\nFile          : ' + p.fileName : '') + (lamaList.length ? '\nJurnal lama yang diganti: ' + lamaList.join(', ') : '') +
      (Object.keys(skip).length ? '\nJurnal dilewati: ' + Object.keys(skip).join(', ') : ''));
    return { uploadId: uploadId, baris: out.length, jurnal: jurnal, total: total, diganti: lamaList, dilewati: Object.keys(skip), fileUrl: fileUrl };
  } finally { lock.releaseLock(); }
}

function apiJournalList(p, user, client) {
  var rows = journalLines_(client.dbId);
  if (p.periode) rows = rows.filter(function (j) { return j.tanggal.substring(0, 7) === p.periode; });
  if (p.cari) {
    var q = String(p.cari).toLowerCase();
    rows = rows.filter(function (j) { return (j.ref + ' ' + j.deskripsi + ' ' + j.partner + ' ' + j.invoice + ' ' + j.akun).toLowerCase().indexOf(q) >= 0; });
  }
  if (p.hanyaNde) rows = rows.filter(function (j) { return j.nde === 'Y'; });
  rows.sort(function (a, b) { return a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0; });
  var docs = {};
  readTable_(client.dbId, 'Docs').forEach(function (d) { docs[d.ref] = (docs[d.ref] || 0) + 1; });
  var total = rows.length, limit = Math.min(Number(p.limit) || 3000, 5000);
  return { total: total, rows: rows.slice(0, limit), docs: docs, terkunci: !!lockedPeriods_(client.dbId)[p.periode] };
}

function apiJournalSetNde(p, user, client) {
  var j = readTable_(client.dbId, 'Journal').filter(function (x) { return x.id === p.id; })[0];
  if (!j) fail_('Baris jurnal tidak ditemukan.');
  if (lockedPeriods_(client.dbId)[j.tanggal.substring(0, 7)]) fail_('Periode sudah dikunci.');
  updateRow_(client.dbId, 'Journal', 'id', p.id, { nde: p.nde ? 'Y' : '' });
  return { id: p.id, nde: p.nde ? 'Y' : '' };
}

function apiJournalDeleteRef(p, user, client) {
  var ref = String(p.ref || '');
  var kena = readTable_(client.dbId, 'Journal').filter(function (j) { return j.ref === ref; });
  if (!kena.length) fail_('No Ref tidak ditemukan.');
  var locked = lockedPeriods_(client.dbId);
  kena.forEach(function (j) { if (locked[j.tanggal.substring(0, 7)]) fail_('Periode sudah dikunci.'); });
  deleteRows_(client.dbId, 'Journal', function (j) { return j.ref === ref; });
  notifyAdmins_(user, client, 'Jurnal dihapus', 'No Ref ' + ref + ' (' + kena.length + ' baris) dihapus.');
  return { deleted: kena.length };
}

function apiUploadsList(p, user, client) { return readTable_(client.dbId, 'Uploads').reverse(); }

function apiUploadsRollback(p, user, client) {
  var kena = readTable_(client.dbId, 'Journal').filter(function (j) { return j.uploadId === p.uploadId; });
  var locked = lockedPeriods_(client.dbId);
  kena.forEach(function (j) { if (locked[j.tanggal.substring(0, 7)]) fail_('Unggahan memuat periode yang sudah dikunci.'); });
  deleteRows_(client.dbId, 'Journal', function (j) { return j.uploadId === p.uploadId; });
  updateRow_(client.dbId, 'Uploads', 'id', p.uploadId, { status: 'DIBATALKAN' });
  return { deleted: kena.length };
}

/* ---------- periode ---------- */
function apiPeriodList(p, user, client) {
  var st = {}, months = {};
  readTable_(client.dbId, 'Periods').forEach(function (x) { st[x.periode] = x; });
  readTable_(client.dbId, 'Journal').forEach(function (j) { var ym = j.tanggal.substring(0, 7); months[ym] = (months[ym] || 0) + 1; });
  Object.keys(st).forEach(function (k) { if (!months[k]) months[k] = 0; });
  return Object.keys(months).sort().reverse().map(function (ym) {
    return { periode: ym, baris: months[ym], status: st[ym] ? st[ym].status : 'OPEN', by: st[ym] ? st[ym].by : '', at: st[ym] ? st[ym].at : '' };
  });
}

function apiPeriodSet(p, user, client) {
  if (!/^\d{4}-\d{2}$/.test(String(p.periode))) fail_('Periode tidak valid.');
  var row = { periode: p.periode, status: p.status === 'LOCKED' ? 'LOCKED' : 'OPEN', by: user.email, at: nowIso_() };
  upsertRow_(client.dbId, 'Periods', 'periode', row);
  return row;
}

/* ---------- dokumen bukti transaksi ---------- */
function apiDocsList(p, user, client) {
  var rows = readTable_(client.dbId, 'Docs');
  return p.ref ? rows.filter(function (d) { return d.ref === String(p.ref); }) : rows;
}

function apiDocsUpload(p, user, client) {
  if (!p.ref) fail_('Pilih jurnal (No Ref) terlebih dahulu.');
  if (!p.b64 || !p.nama) fail_('File kosong.');
  var bytes = Utilities.base64Decode(p.b64);
  if (bytes.length > MAX_DOC_BYTES) fail_('Ukuran file melebihi 10 MB.');
  var j = readTable_(client.dbId, 'Journal').filter(function (x) { return x.ref === String(p.ref); })[0];
  var ym = j ? j.tanggal.substring(0, 7) : nowIso_().substring(0, 7);
  var folder = ensureFolder_(ensureFolder_(DriveApp.getFolderById(client.folderId), '04_Bukti'), ym);
  var safeRef = String(p.ref).replace(/[\\\/:*?"<>|]/g, '_');
  var f = folder.createFile(Utilities.newBlob(bytes, p.mime || 'application/octet-stream', safeRef + '__' + p.nama));
  var row = { id: uid_('D'), ref: String(p.ref), fileId: f.getId(), nama: p.nama, url: f.getUrl(), by: user.email, at: nowIso_() };
  appendRows_(client.dbId, 'Docs', [row]);
  return row;
}

function apiDocsRemove(p, user, client) {
  var d = readTable_(client.dbId, 'Docs').filter(function (x) { return x.id === p.id; })[0];
  if (!d) fail_('Dokumen tidak ditemukan.');
  try { DriveApp.getFileById(d.fileId).setTrashed(true); } catch (e) { /* file sudah tidak ada */ }
  deleteRows_(client.dbId, 'Docs', function (x) { return x.id === p.id; });
  return { removed: p.id };
}

/* ---------- arsip file laporan (PDF/Excel) ke folder klien ---------- */
function apiFilesSave(p, user, client) {
  if (!p.b64 || !p.nama) fail_('File kosong.');
  var jenis = p.jenis === 'Analisa' ? '03_Analisa' : '02_Laporan';
  var folder = ensureFolder_(ensureFolder_(DriveApp.getFolderById(client.folderId), jenis), p.periode || 'umum');
  var f = folder.createFile(Utilities.newBlob(Utilities.base64Decode(p.b64), p.mime || 'application/pdf', p.nama));
  var row = { id: uid_('F'), periode: p.periode || '', jenis: p.jenis || 'Laporan', nama: p.nama, url: f.getUrl(), by: user.email, at: nowIso_() };
  appendRows_(client.dbId, 'Files', [row]);
  return row;
}

function apiFilesList(p, user, client) {
  var rows = readTable_(client.dbId, 'Files');
  if (p.periode) rows = rows.filter(function (f) { return f.periode === p.periode; });
  return rows.reverse();
}
