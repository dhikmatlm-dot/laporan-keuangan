/**
 * Auth.gs — verifikasi identitas dan hak akses.
 * Frontend mengirim ID token Google; backend memverifikasinya ke Google, lalu
 * menentukan peran dan klien dari tabel Users. clientId TIDAK pernah dipercaya dari browser
 * untuk pengguna klien.
 */

function verifyToken_(token) {
  if (!token) fail_('Belum masuk. Silakan masuk dengan akun Google.');
  if (prop_('DEV_MODE') === '1' && token.indexOf('dev:') === 0) return token.substring(4).toLowerCase();
  var cache = CacheService.getScriptCache();
  var key = 'tk_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)).substring(0, 40);
  var hit = cache.get(key);
  if (hit) return hit;
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) fail_('Sesi berakhir. Silakan masuk kembali.');
  var info = JSON.parse(res.getContentText());
  var clientId = prop_('GOOGLE_CLIENT_ID');
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID belum diisi di Script Properties.');
  if (info.aud !== clientId) fail_('Token tidak ditujukan untuk aplikasi ini.');
  if (String(info.email_verified) !== 'true') fail_('Email Google belum terverifikasi.');
  var left = Number(info.exp) - Math.floor(Date.now() / 1000);
  if (left <= 0) fail_('Sesi berakhir. Silakan masuk kembali.');
  var email = String(info.email).toLowerCase();
  cache.put(key, email, Math.max(1, Math.min(300, left)));
  return email;
}

function authenticate_(token) {
  var email = verifyToken_(token);
  var u = readTable_(prop_('MASTER_ID'), 'Users').filter(function (x) { return x.email.toLowerCase() === email && x.aktif !== 'N'; })[0];
  if (!u) fail_('Email ' + email + ' belum terdaftar. Hubungi konsultan Anda.');
  return { email: email, nama: u.nama, role: u.role, clientId: u.clientId };
}

function isAdmin_(user) { return user.role === 'SUPER_ADMIN'; }

/** Klien yang boleh diakses pada permintaan ini. */
function resolveClient_(user, requestedId) {
  var id = isAdmin_(user) ? requestedId : user.clientId;
  if (!isAdmin_(user) && requestedId && requestedId !== user.clientId) {
    audit_(user, user.clientId, 'AKSES_DITOLAK', 'Mencoba membuka klien ' + requestedId);
    fail_('Anda tidak berhak membuka data klien lain.');
  }
  if (!id) fail_('Pilih klien terlebih dahulu.');
  var c = readTable_(prop_('MASTER_ID'), 'Clients').filter(function (x) { return x.id === id; })[0];
  if (!c) fail_('Klien tidak ditemukan.');
  if (c.aktif === 'N' && !isAdmin_(user)) fail_('Akun klien tidak aktif.');
  return c;
}

function audit_(user, clientId, action, detail) {
  try {
    appendRows_(prop_('MASTER_ID'), 'Audit', [{ ts: nowIso_(), email: user ? user.email : '', role: user ? user.role : '',
      clientId: clientId || '', action: action, detail: typeof detail === 'string' ? detail : JSON.stringify(detail || '') }]);
  } catch (e) { /* log tidak boleh menggagalkan transaksi */ }
}

function superAdminEmails_() {
  return readTable_(prop_('MASTER_ID'), 'Users').filter(function (u) { return u.role === 'SUPER_ADMIN' && u.aktif !== 'N'; })
    .map(function (u) { return u.email; });
}

/** Beritahu semua Super Admin lewat email bila klien mengubah data. */
function notifyAdmins_(user, client, judul, isi) {
  if (isAdmin_(user)) return;
  try {
    var to = superAdminEmails_().join(',');
    if (!to) return;
    MailApp.sendEmail({
      to: to,
      subject: '[' + APP_NAME + '] ' + client.nama + ': ' + judul,
      body: 'Klien   : ' + client.id + ' - ' + client.nama + '\nOleh    : ' + user.email + '\nWaktu   : ' + nowIso_() + '\n\n' + isi +
        (prop_('APP_URL') ? '\n\nBuka aplikasi: ' + prop_('APP_URL') : '')
    });
  } catch (e) { audit_(user, client.id, 'EMAIL_GAGAL', String(e)); }
}
