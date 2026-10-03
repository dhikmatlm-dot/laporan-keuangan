/** Clients.gs — klien, pengguna, kuota, folder Drive, COA. */

function publicClient_(c) {
  return { id: c.id, nama: c.nama, npwp: c.npwp, alamat: c.alamat, kota: c.kota, bidangUsaha: c.bidangUsaha, pimpinan: c.pimpinan,
    jabatan: c.jabatan, kerangkaSak: c.kerangkaSak, kuotaUser: Number(c.kuotaUser) || 2, aktif: c.aktif, folderId: c.folderId };
}

function apiClientsList() {
  var users = readTable_(prop_('MASTER_ID'), 'Users');
  return readTable_(prop_('MASTER_ID'), 'Clients').map(function (c) {
    var o = publicClient_(c);
    o.jumlahUser = users.filter(function (u) { return u.clientId === c.id && u.aktif !== 'N'; }).length;
    return o;
  });
}

function apiClientGet(p, user, client) { return publicClient_(client); }

function apiClientsSave(p, user) {
  var master = prop_('MASTER_ID');
  if (!p.nama) fail_('Nama klien wajib diisi.');
  var fields = { nama: p.nama, npwp: p.npwp || '', alamat: p.alamat || '', kota: p.kota || '', bidangUsaha: p.bidangUsaha || '',
    pimpinan: p.pimpinan || '', jabatan: p.jabatan || 'Direktur', kerangkaSak: p.kerangkaSak || 'SAK Entitas Privat',
    kuotaUser: Math.max(2, Number(p.kuotaUser) || 2), aktif: p.aktif === 'N' ? 'N' : 'Y' };
  if (p.id) {
    fields.id = p.id;
    if (!updateRow_(master, 'Clients', 'id', p.id, fields)) fail_('Klien tidak ditemukan.');
    return fields;
  }
  var all = readTable_(master, 'Clients');
  var max = all.reduce(function (m, c) { return Math.max(m, Number(String(c.id).replace(/\D/g, '')) || 0); }, 0);
  var id = 'K' + ('000' + (max + 1)).slice(-3);
  var root = DriveApp.getFolderById(prop_('ROOT_FOLDER_ID'));
  var folder = root.createFolder(id + ' - ' + p.nama);
  ['01_Upload', '02_Laporan', '03_Analisa', '04_Bukti'].forEach(function (n) { folder.createFolder(n); });
  var ss = SpreadsheetApp.create('DB_' + id);
  DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(prop_('DB_FOLDER_ID')));
  fields.id = id; fields.folderId = folder.getId(); fields.dbId = ss.getId(); fields.createdAt = nowIso_();
  appendRows_(master, 'Clients', [fields]);
  writeTable_(fields.dbId, 'COA', defaultCoaRows_());
  ['Journal', 'Uploads', 'Docs', 'Periods', 'FixedAssets', 'BankStatements', 'FiscalAdj', 'Narratives', 'Settings', 'Files']
    .forEach(function (n) { sheet_(fields.dbId, n); });
  return publicClient_(fields);
}

/** Profil yang boleh diubah klien sendiri: nama pimpinan, jabatan, alamat. */
function apiClientSaveProfile(p, user, client) {
  var patch = {};
  ['pimpinan', 'jabatan', 'alamat', 'kota', 'npwp', 'bidangUsaha'].forEach(function (f) { if (p[f] !== undefined) patch[f] = String(p[f]); });
  updateRow_(prop_('MASTER_ID'), 'Clients', 'id', client.id, patch);
  return patch;
}

/* ---------- pengguna ---------- */
function apiUsersList(p) {
  var rows = readTable_(prop_('MASTER_ID'), 'Users');
  if (p.clientId) rows = rows.filter(function (u) { return u.clientId === p.clientId; });
  return rows;
}

function apiUsersSave(p, user) {
  var master = prop_('MASTER_ID');
  var email = String(p.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail_('Alamat email tidak valid.');
  var role = p.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'CLIENT';
  var users = readTable_(master, 'Users');
  var existing = users.filter(function (u) { return u.email === email; })[0];
  var clientId = role === 'CLIENT' ? p.clientId : '';
  if (role === 'CLIENT') {
    var c = readTable_(master, 'Clients').filter(function (x) { return x.id === clientId; })[0];
    if (!c) fail_('Klien tidak ditemukan.');
    if (existing && existing.role === 'SUPER_ADMIN') fail_('Email Super Admin tidak boleh dijadikan pengguna klien.');
    if (existing && existing.clientId && existing.clientId !== clientId) fail_('Email ini sudah terdaftar pada klien ' + existing.clientId + '.');
    var kuota = Math.max(2, Number(c.kuotaUser) || 2);
    var aktif = users.filter(function (u) { return u.clientId === clientId && u.role === 'CLIENT' && u.aktif !== 'N' && u.email !== email; }).length;
    if (p.aktif !== 'N' && aktif >= kuota) fail_('Kuota pengguna klien ini ' + kuota + ' email. Tambah add-on (naikkan kuota di profil klien) untuk menambah pengguna.');
    try { DriveApp.getFolderById(c.folderId).addViewer(email); } catch (e) { /* email non-Google: akses folder dilewati */ }
  }
  var row = { email: email, nama: p.nama || email, role: role, clientId: clientId, aktif: p.aktif === 'N' ? 'N' : 'Y', createdAt: existing ? existing.createdAt : nowIso_() };
  upsertRow_(master, 'Users', 'email', row);
  return row;
}

function apiUsersRemove(p, user) {
  var email = String(p.email || '').toLowerCase();
  if (email === user.email) fail_('Anda tidak dapat menghapus akun sendiri.');
  var master = prop_('MASTER_ID');
  var u = readTable_(master, 'Users').filter(function (x) { return x.email === email; })[0];
  if (!u) fail_('Pengguna tidak ditemukan.');
  deleteRows_(master, 'Users', function (x) { return x.email === email; });
  if (u.clientId) {
    try {
      var c = readTable_(master, 'Clients').filter(function (x) { return x.id === u.clientId; })[0];
      DriveApp.getFolderById(c.folderId).removeViewer(email);
    } catch (e) { /* abaikan */ }
  }
  return { removed: email };
}

/* ---------- COA ---------- */
function defaultCoaRows_() {
  return DEFAULT_COA.map(function (r) { return { kode: r[0], nama: r[1], normal: r[2], pos: r[3], kelompok: r[4], ndeDefault: r[5], coretax: '' }; });
}

function coaRow_(p) {
  var kode = String(p.kode || '').trim();
  if (!kode) fail_('Kode akun wajib diisi.');
  if (!p.nama) fail_('Nama akun wajib diisi (kode ' + kode + ').');
  var kel = KELOMPOK[p.kelompok] ? p.kelompok : guessKelompok(kode, p.nama);
  var normal = String(p.normal || '').toUpperCase().charAt(0);
  var tipe = KELOMPOK[kel].tipe;
  if (normal !== 'D' && normal !== 'C' && normal !== 'K') normal = (tipe === 'A' || tipe === 'X') ? 'D' : 'C';
  return { kode: kode, nama: String(p.nama).trim(), normal: normal === 'D' ? 'DR' : 'CR', pos: String(p.pos || 'Y').toUpperCase().charAt(0) === 'N' ? 'N' : 'Y',
    kelompok: kel, ndeDefault: isYes_(p.ndeDefault) ? 'Y' : '', coretax: String(p.coretax || '').trim() };
}

function isYes_(v) {
  var s = String(v === undefined || v === null ? '' : v).trim().toUpperCase();
  return v === true || s === 'Y' || s === 'YA' || s === 'TRUE' || s === '1' || s === 'X' || s === 'V' || s === 'NDE' || s === '✓';
}

function apiCoaList(p, user, client) { return readTable_(client.dbId, 'COA'); }

function apiCoaSave(p, user, client) {
  var row = coaRow_(p);
  if (p.kodeLama && p.kodeLama !== row.kode) {
    if (akunTerpakai_(client.dbId, p.kodeLama)) fail_('Kode akun ' + p.kodeLama + ' sudah dipakai di jurnal; kodenya tidak dapat diubah.');
    deleteRows_(client.dbId, 'COA', function (a) { return a.kode === p.kodeLama; });
  }
  upsertRow_(client.dbId, 'COA', 'kode', row);
  notifyAdmins_(user, client, 'COA diubah', 'Akun ' + row.kode + ' - ' + row.nama + ' disimpan.');
  return row;
}

function akunTerpakai_(dbId, kode) {
  return readTable_(dbId, 'Journal').some(function (j) { return j.akun === kode || j.lawan === kode; });
}

function apiCoaDelete(p, user, client) {
  if (akunTerpakai_(client.dbId, String(p.kode))) fail_('Akun ' + p.kode + ' sudah dipakai di jurnal sehingga tidak dapat dihapus.');
  var n = deleteRows_(client.dbId, 'COA', function (a) { return a.kode === String(p.kode); });
  notifyAdmins_(user, client, 'COA diubah', 'Akun ' + p.kode + ' dihapus.');
  return { deleted: n };
}

/** Impor COA dari Excel. mode: 'GABUNG' (default) atau 'GANTI'. */
function apiCoaImport(p, user, client) {
  var rows = (p.rows || []).filter(function (r) { return r.kode; }).map(coaRow_);
  if (!rows.length) fail_('Tidak ada baris akun yang terbaca.');
  var seen = {};
  rows.forEach(function (r) { if (seen[r.kode]) fail_('Kode akun ganda di file: ' + r.kode); seen[r.kode] = true; });
  var existing = readTable_(client.dbId, 'COA'), out;
  if (p.mode === 'GANTI') {
    var used = {};
    readTable_(client.dbId, 'Journal').forEach(function (j) { used[j.akun] = true; });
    var hilang = Object.keys(used).filter(function (k) { return !seen[k]; });
    if (hilang.length) fail_('Akun berikut sudah dipakai di jurnal tetapi tidak ada di file: ' + hilang.slice(0, 10).join(', '));
    out = rows;
  } else {
    var map = {};
    existing.forEach(function (a) { map[a.kode] = a; });
    rows.forEach(function (r) { if (map[r.kode] && !r.coretax) r.coretax = map[r.kode].coretax; map[r.kode] = r; });
    out = Object.keys(map).map(function (k) { return map[k]; });
  }
  out.sort(function (a, b) { return a.kode < b.kode ? -1 : a.kode > b.kode ? 1 : 0; });
  writeTable_(client.dbId, 'COA', out);
  notifyAdmins_(user, client, 'COA diimpor', rows.length + ' akun diimpor (mode ' + (p.mode || 'GABUNG') + ').');
  return { jumlah: out.length };
}
