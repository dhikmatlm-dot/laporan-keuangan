/**
 * Config.gs — konfigurasi, skema tabel, dan penyiapan awal.
 *
 * Script Properties yang dipakai (Project Settings > Script Properties):
 *   GOOGLE_CLIENT_ID   : OAuth Client ID (Web) untuk tombol "Masuk dengan Google" di frontend
 *   ANTHROPIC_API_KEY  : kunci API Claude (untuk analisa AI)
 *   CLAUDE_MODEL       : ID model Claude (opsional; lihat docs.claude.com untuk ID terbaru)
 *   APP_URL            : alamat frontend (dipakai di email pemberitahuan)
 *   MASTER_ID, ROOT_FOLDER_ID, DB_FOLDER_ID : diisi otomatis oleh setup()
 *   DEV_MODE           : "1" hanya untuk uji lokal (tools/local-server.js). JANGAN diisi di produksi.
 */

var APP_NAME = 'Sistem Laporan Keuangan';
var DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-5';
var MAX_DOC_BYTES = 10 * 1024 * 1024;

var SCHEMA = {
  // --- spreadsheet MASTER ---
  Clients: ['id', 'nama', 'npwp', 'alamat', 'kota', 'bidangUsaha', 'pimpinan', 'jabatan', 'kerangkaSak', 'folderId', 'dbId', 'kuotaUser', 'aktif', 'createdAt'],
  Users: ['email', 'nama', 'role', 'clientId', 'aktif', 'createdAt'],
  Audit: ['ts', 'email', 'role', 'clientId', 'action', 'detail'],
  CoretaxItems: ['kode', 'nama', 'jenis', 'bagian', 'normal', 'urutan'],
  CoretaxKelMap: ['kelompok', 'kode'],
  // --- spreadsheet DB_<clientId> ---
  COA: ['kode', 'nama', 'normal', 'pos', 'kelompok', 'ndeDefault', 'coretax'],
  Journal: ['id', 'uploadId', 'sumber', 'tanggal', 'partner', 'invoice', 'top', 'ref', 'akun', 'lawan', 'deskripsi', 'valueOri', 'mataUang', 'kurs', 'dc', 'nilai', 'nde', 'by', 'at'],
  Uploads: ['id', 'at', 'by', 'role', 'sumber', 'fileName', 'fileUrl', 'baris', 'jurnal', 'total', 'status'],
  Docs: ['id', 'ref', 'fileId', 'nama', 'url', 'by', 'at'],
  Periods: ['periode', 'status', 'by', 'at'],
  FixedAssets: ['id', 'nama', 'akun', 'tglPerolehan', 'harga', 'umurBulan', 'nilaiSisa'],
  BankStatements: ['id', 'akun', 'tanggal', 'keterangan', 'masuk', 'keluar', 'saldo'],
  FiscalAdj: ['id', 'tahun', 'uraian', 'jenis', 'nilai'],
  Narratives: ['periode', 'section', 'text', 'by', 'at'],
  Settings: ['key', 'value'],
  Files: ['id', 'periode', 'jenis', 'nama', 'url', 'by', 'at']
};

var DEFAULT_CORETAX_ITEMS = [
  ['N101', 'Kas dan setara kas', 'NERACA', 'Aset lancar', 'D'],
  ['N102', 'Investasi sementara', 'NERACA', 'Aset lancar', 'D'],
  ['N103', 'Piutang usaha', 'NERACA', 'Aset lancar', 'D'],
  ['N104', 'Piutang lain-lain', 'NERACA', 'Aset lancar', 'D'],
  ['N105', 'Penyisihan piutang ragu-ragu', 'NERACA', 'Aset lancar', 'D'],
  ['N106', 'Persediaan', 'NERACA', 'Aset lancar', 'D'],
  ['N107', 'Beban dibayar di muka', 'NERACA', 'Aset lancar', 'D'],
  ['N108', 'Uang muka pembelian', 'NERACA', 'Aset lancar', 'D'],
  ['N109', 'Aset lancar lainnya (termasuk pajak dibayar di muka)', 'NERACA', 'Aset lancar', 'D'],
  ['N201', 'Investasi jangka panjang', 'NERACA', 'Aset tidak lancar', 'D'],
  ['N202', 'Aset tetap - harga perolehan', 'NERACA', 'Aset tidak lancar', 'D'],
  ['N203', 'Akumulasi penyusutan', 'NERACA', 'Aset tidak lancar', 'D'],
  ['N204', 'Aset tidak berwujud dan aset tidak lancar lainnya', 'NERACA', 'Aset tidak lancar', 'D'],
  ['N205', 'Akumulasi amortisasi', 'NERACA', 'Aset tidak lancar', 'D'],
  ['N301', 'Utang usaha', 'NERACA', 'Liabilitas jangka pendek', 'K'],
  ['N302', 'Utang pajak', 'NERACA', 'Liabilitas jangka pendek', 'K'],
  ['N303', 'Biaya yang masih harus dibayar', 'NERACA', 'Liabilitas jangka pendek', 'K'],
  ['N304', 'Utang bank jangka pendek', 'NERACA', 'Liabilitas jangka pendek', 'K'],
  ['N305', 'Bagian utang jangka panjang yang jatuh tempo', 'NERACA', 'Liabilitas jangka pendek', 'K'],
  ['N306', 'Uang muka pelanggan', 'NERACA', 'Liabilitas jangka pendek', 'K'],
  ['N307', 'Liabilitas jangka pendek lainnya', 'NERACA', 'Liabilitas jangka pendek', 'K'],
  ['N401', 'Utang bank jangka panjang', 'NERACA', 'Liabilitas jangka panjang', 'K'],
  ['N402', 'Utang kepada pemegang saham / pihak berelasi', 'NERACA', 'Liabilitas jangka panjang', 'K'],
  ['N403', 'Liabilitas jangka panjang lainnya', 'NERACA', 'Liabilitas jangka panjang', 'K'],
  ['N501', 'Modal saham', 'NERACA', 'Ekuitas', 'K'],
  ['N502', 'Tambahan modal disetor / ekuitas lain', 'NERACA', 'Ekuitas', 'K'],
  ['N503', 'Laba ditahan tahun-tahun sebelumnya', 'NERACA', 'Ekuitas', 'K'],
  ['N504', 'Laba (rugi) tahun berjalan', 'NERACA', 'Ekuitas', 'K'],
  ['L101', 'Penjualan / pendapatan usaha', 'LABARUGI', 'Pendapatan', 'K'],
  ['L102', 'Harga pokok penjualan', 'LABARUGI', 'Harga pokok', 'D'],
  ['L201', 'Beban penjualan', 'LABARUGI', 'Beban usaha', 'D'],
  ['L202', 'Beban umum dan administrasi', 'LABARUGI', 'Beban usaha', 'D'],
  ['L301', 'Penghasilan dari luar usaha', 'LABARUGI', 'Luar usaha', 'K'],
  ['L302', 'Beban dari luar usaha', 'LABARUGI', 'Luar usaha', 'D'],
  ['L401', 'Beban pajak penghasilan', 'LABARUGI', 'Pajak', 'D']
];

var DEFAULT_CORETAX_KELMAP = {
  KAS: 'N101', BANK: 'N101', SETARA_KAS: 'N101', INVESTASI_PENDEK: 'N102', PIUTANG_USAHA: 'N103', PIUTANG_LAIN: 'N104',
  PENYISIHAN_PIUTANG: 'N105', PERSEDIAAN: 'N106', DIBAYAR_DIMUKA: 'N107', UANG_MUKA: 'N108', PPN_MASUKAN: 'N109', PAJAK_DIBAYAR_DIMUKA: 'N109',
  INVESTASI_PANJANG: 'N201', ASET_TETAP: 'N202', AKUM_PENYUSUTAN: 'N203', ASET_LAIN: 'N204', AKUM_AMORTISASI: 'N205',
  UTANG_USAHA: 'N301', UTANG_PAJAK: 'N302', BIAYA_YMH: 'N303', UTANG_BANK_PENDEK: 'N304', UTANG_LEASING_PENDEK: 'N305',
  UANG_MUKA_PELANGGAN: 'N306', UTANG_LAIN: 'N307', UTANG_BANK_PANJANG: 'N401', UTANG_PEMEGANG_SAHAM: 'N402',
  UTANG_LEASING_PANJANG: 'N403', UTANG_PANJANG_LAIN: 'N403', MODAL: 'N501', CADANGAN: 'N502', SALDO_LABA: 'N503',
  LABA_BERJALAN: 'N503', DIVIDEN: 'N503', __LABA_BERJALAN: 'N504',
  PENDAPATAN: 'L101', HPP: 'L102', BEBAN_PENJUALAN: 'L201', BEBAN_UMUM: 'L202', BEBAN_PENYUSUTAN: 'L202',
  PENDAPATAN_LAIN: 'L301', BEBAN_BUNGA: 'L302', BEBAN_LAIN: 'L302', BEBAN_PAJAK: 'L401', PAJAK_TANGGUHAN: 'L401'
};

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }
function setProp_(k, v) { PropertiesService.getScriptProperties().setProperty(k, String(v)); }
function nowIso_() { return new Date().toISOString(); }
function uid_(prefix) { return (prefix || '') + new Date().getTime().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }
function fail_(msg) { var e = new Error(msg); e.userError = true; throw e; }

function ensureFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/**
 * Jalankan SEKALI dari editor Apps Script (pilih fungsi "setup" lalu Run).
 * Membuat folder, spreadsheet MASTER, dan mendaftarkan akun Anda sebagai Super Admin pertama.
 */
function setup() {
  var root;
  if (prop_('ROOT_FOLDER_ID')) root = DriveApp.getFolderById(prop_('ROOT_FOLDER_ID'));
  else { root = DriveApp.createFolder('LaporanKeuangan'); setProp_('ROOT_FOLDER_ID', root.getId()); }
  var sys = ensureFolder_(root, '_SYSTEM'), dbf = ensureFolder_(root, '_DB');
  setProp_('DB_FOLDER_ID', dbf.getId());
  if (!prop_('MASTER_ID')) {
    var ss = SpreadsheetApp.create('MASTER - Laporan Keuangan');
    DriveApp.getFileById(ss.getId()).moveTo(sys);
    setProp_('MASTER_ID', ss.getId());
  }
  var master = prop_('MASTER_ID');
  ['Clients', 'Users', 'Audit', 'CoretaxItems', 'CoretaxKelMap'].forEach(function (n) { sheet_(master, n); });
  if (!readTable_(master, 'CoretaxItems').length) {
    appendRows_(master, 'CoretaxItems', DEFAULT_CORETAX_ITEMS.map(function (r, i) {
      return { kode: r[0], nama: r[1], jenis: r[2], bagian: r[3], normal: r[4], urutan: i + 1 };
    }));
    appendRows_(master, 'CoretaxKelMap', Object.keys(DEFAULT_CORETAX_KELMAP).map(function (k) { return { kelompok: k, kode: DEFAULT_CORETAX_KELMAP[k] }; }));
  }
  var me = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  var users = readTable_(master, 'Users');
  if (me && !users.some(function (u) { return u.email === me; })) {
    appendRows_(master, 'Users', [{ email: me, nama: 'Super Admin', role: 'SUPER_ADMIN', clientId: '', aktif: 'Y', createdAt: nowIso_() }]);
  }
  Logger.log('Setup selesai. MASTER_ID=' + master + ' | Super Admin: ' + me);
  return { masterId: master, rootFolderId: root.getId(), superAdmin: me };
}
