/** Reports.gs — menyusun laporan dari mesin (Engine.gs), fiskal, Coretax, aset tetap, rekening koran. */

function context_(client) {
  return buildContext(readTable_(client.dbId, 'COA'), journalLines_(client.dbId));
}

function fiscalOpt_(client, ym) {
  var tahun = ym.substring(0, 4), db = client.dbId, s = {};
  readTable_(db, 'Settings').forEach(function (x) { s[x.key] = x.value; });
  var tarif = {};
  ['tarifUmum', 'batasFasilitas', 'batasOmzet31E', 'tarifFinalUmkm'].forEach(function (k) { if (s['fiskal.' + k]) tarif[k] = Number(s['fiskal.' + k]); });
  return {
    mode: s['fiskal.mode'] || '31E',
    kompensasiRugi: Number(s['fiskal.kompensasi.' + tahun]) || 0,
    tarif: tarif,
    adj: readTable_(db, 'FiscalAdj').filter(function (a) { return a.tahun === tahun; })
  };
}

function coretaxConfig_() {
  var master = prop_('MASTER_ID'), kel = {};
  readTable_(master, 'CoretaxKelMap').forEach(function (r) { kel[r.kelompok] = r.kode; });
  return { items: readTable_(master, 'CoretaxItems'), kelMap: kel };
}

/** p.periode = 'YYYY-MM'; p.bagian = ['utama','pendukung','fiskal','coretax'] */
function apiReportGet(p, user, client) {
  var ym = String(p.periode || '');
  if (!/^\d{4}-\d{2}$/.test(ym)) fail_('Periode tidak valid.');
  var bagian = p.bagian && p.bagian.length ? p.bagian : ['utama'];
  var ctx = context_(client), out = { periode: ym, klien: publicClient_(client), terkunci: !!lockedPeriods_(client.dbId)[ym] };
  if (bagian.indexOf('utama') >= 0) out.utama = laporanUtama(ctx, ym);
  if (bagian.indexOf('pendukung') >= 0) {
    out.pendukung = laporanPendukung(ctx, ym, { assets: readTable_(client.dbId, 'FixedAssets'), bankStatements: readTable_(client.dbId, 'BankStatements') });
  }
  if (bagian.indexOf('fiskal') >= 0) out.fiskal = rekonsiliasiFiskal(ctx, ym, fiscalOpt_(client, ym));
  if (bagian.indexOf('coretax') >= 0) {
    var cfg = coretaxConfig_();
    out.coretax = laporanCoretax(ctx, ym, cfg.items, cfg.kelMap);
  }
  return out;
}

/* ---------- aset tetap ---------- */
function apiAssetsList(p, user, client) { return readTable_(client.dbId, 'FixedAssets'); }
function apiAssetsSave(p, user, client) {
  if (!p.nama) fail_('Nama aset wajib diisi.');
  var tgl = normDate_(p.tglPerolehan);
  if (!tgl) fail_('Tanggal perolehan tidak valid.');
  var row = { id: p.id || uid_('A'), nama: p.nama, akun: String(p.akun || ''), tglPerolehan: tgl, harga: num_(p.harga) || 0,
    umurBulan: Math.max(1, Math.round(num_(p.umurBulan)) || 48), nilaiSisa: num_(p.nilaiSisa) || 0 };
  upsertRow_(client.dbId, 'FixedAssets', 'id', row);
  return row;
}
function apiAssetsDelete(p, user, client) { return { deleted: deleteRows_(client.dbId, 'FixedAssets', function (a) { return a.id === p.id; }) }; }

/* ---------- rekening koran ---------- */
function apiBankImport(p, user, client) {
  var akun = String(p.akun || '');
  if (!akun) fail_('Pilih akun bank.');
  var rows = (p.rows || []).map(function (r) {
    var tgl = normDate_(r.tanggal);
    if (!tgl) return null;
    return { id: uid_('B'), akun: akun, tanggal: tgl, keterangan: String(r.keterangan || ''), masuk: num_(r.masuk) || 0, keluar: num_(r.keluar) || 0,
      saldo: isNaN(num_(r.saldo)) ? '' : num_(r.saldo) };
  }).filter(function (r) { return r; });
  if (!rows.length) fail_('Tidak ada baris rekening koran yang terbaca.');
  var months = {};
  rows.forEach(function (r) { months[r.tanggal.substring(0, 7)] = true; });
  deleteRows_(client.dbId, 'BankStatements', function (b) { return b.akun === akun && months[b.tanggal.substring(0, 7)]; });
  appendRows_(client.dbId, 'BankStatements', rows);
  return { baris: rows.length, bulan: Object.keys(months) };
}
function apiBankClear(p, user, client) {
  return { deleted: deleteRows_(client.dbId, 'BankStatements', function (b) { return b.akun === String(p.akun) && b.tanggal.substring(0, 7) === p.periode; }) };
}

/* ---------- fiskal ---------- */
function apiFiscalSettings(p, user, client) {
  var tahun = String(p.tahun || '');
  var o = fiscalOpt_(client, tahun + '-12');
  return { mode: o.mode, kompensasiRugi: o.kompensasiRugi, tarif: o.tarif, tarifDefault: TARIF_DEFAULT, adj: o.adj };
}
function apiFiscalSaveSettings(p, user, client) {
  if (p.mode) setSetting_(client.dbId, 'fiskal.mode', ['UMUM', '31E', 'FINAL_UMKM'].indexOf(p.mode) >= 0 ? p.mode : '31E');
  if (p.tahun) setSetting_(client.dbId, 'fiskal.kompensasi.' + p.tahun, num_(p.kompensasiRugi) || 0);
  ['tarifUmum', 'batasFasilitas', 'batasOmzet31E', 'tarifFinalUmkm'].forEach(function (k) {
    if (p.tarif && p.tarif[k] !== undefined) setSetting_(client.dbId, 'fiskal.' + k, p.tarif[k] === '' ? '' : num_(p.tarif[k]));
  });
  return { ok: true };
}
function apiFiscalSaveAdj(p, user, client) {
  if (!p.uraian) fail_('Uraian koreksi wajib diisi.');
  var row = { id: p.id || uid_('X'), tahun: String(p.tahun), uraian: p.uraian, jenis: p.jenis === 'NEGATIF' ? 'NEGATIF' : 'POSITIF', nilai: num_(p.nilai) || 0 };
  upsertRow_(client.dbId, 'FiscalAdj', 'id', row);
  return row;
}
function apiFiscalDeleteAdj(p, user, client) { return { deleted: deleteRows_(client.dbId, 'FiscalAdj', function (a) { return a.id === p.id; }) }; }

/* ---------- konfigurasi Coretax (berlaku untuk semua klien) ---------- */
function apiCoretaxGet() { return coretaxConfig_(); }
function apiCoretaxSave(p) {
  var master = prop_('MASTER_ID');
  if (p.items) {
    var seen = {};
    var items = p.items.filter(function (i) { return i.kode && i.nama; }).map(function (i, n) {
      var kode = String(i.kode).trim();
      if (seen[kode]) fail_('Kode pos Coretax ganda: ' + kode);
      seen[kode] = true;
      var jenis = String(i.jenis || '').toUpperCase().indexOf('L') === 0 ? 'LABARUGI' : 'NERACA';
      var normal = String(i.normal || '').toUpperCase().charAt(0) === 'K' || String(i.normal || '').toUpperCase().charAt(0) === 'C' ? 'K' : 'D';
      return { kode: kode, nama: String(i.nama).trim(), jenis: jenis, bagian: i.bagian || '', normal: normal, urutan: Number(i.urutan) || n + 1 };
    });
    if (!items.length) fail_('Daftar pos Coretax kosong.');
    writeTable_(master, 'CoretaxItems', items);
  }
  if (p.kelMap) {
    writeTable_(master, 'CoretaxKelMap', Object.keys(p.kelMap).map(function (k) { return { kelompok: k, kode: p.kelMap[k] }; }));
  }
  return coretaxConfig_();
}
