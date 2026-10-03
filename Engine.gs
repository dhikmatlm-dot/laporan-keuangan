/**
 * Engine.gs — mesin perhitungan laporan. Murni JavaScript, tanpa layanan Google,
 * sehingga dapat diuji di Node (lihat tools/test-engine.js).
 *
 * Konvensi tanda: s = Debit - Kredit. Aset positif, liabilitas/ekuitas/pendapatan negatif.
 * Tahun buku = tahun kalender. Jangan memposting jurnal penutup: laba tahun lalu
 * otomatis masuk ke Saldo Laba.
 */

// tipe: A aset, L liabilitas, E ekuitas, R pendapatan, X beban
// cf  : KAS | OP | INV | FIN  (aktivitas arus kas metode tidak langsung)
// dm  : kategori arus kas metode langsung
var KELOMPOK = {
  KAS:                 { label: 'Kas',                               tipe: 'A', bag: 'AL',  pos: 'Kas dan setara kas',            cf: 'KAS' },
  BANK:                { label: 'Bank',                              tipe: 'A', bag: 'AL',  pos: 'Kas dan setara kas',            cf: 'KAS' },
  SETARA_KAS:          { label: 'Deposito / setara kas',             tipe: 'A', bag: 'AL',  pos: 'Kas dan setara kas',            cf: 'KAS' },
  PIUTANG_USAHA:       { label: 'Piutang usaha',                     tipe: 'A', bag: 'AL',  pos: 'Piutang usaha',                 cf: 'OP',  dm: 'PELANGGAN' },
  PENYISIHAN_PIUTANG:  { label: 'Penyisihan piutang',                tipe: 'A', bag: 'AL',  pos: 'Penyisihan penurunan nilai piutang', cf: 'OP', dm: 'OP_LAIN' },
  PIUTANG_LAIN:        { label: 'Piutang lain-lain',                 tipe: 'A', bag: 'AL',  pos: 'Piutang lain-lain',             cf: 'OP',  dm: 'OP_LAIN' },
  PERSEDIAAN:          { label: 'Persediaan',                        tipe: 'A', bag: 'AL',  pos: 'Persediaan',                    cf: 'OP',  dm: 'PEMASOK' },
  UANG_MUKA:           { label: 'Uang muka',                         tipe: 'A', bag: 'AL',  pos: 'Uang muka',                     cf: 'OP',  dm: 'PEMASOK' },
  DIBAYAR_DIMUKA:      { label: 'Biaya dibayar dimuka',              tipe: 'A', bag: 'AL',  pos: 'Biaya dibayar dimuka',          cf: 'OP',  dm: 'BEBAN' },
  PPN_MASUKAN:         { label: 'PPN Masukan',                       tipe: 'A', bag: 'AL',  pos: 'Pajak dibayar dimuka',          cf: 'OP',  dm: 'PAJAK' },
  PAJAK_DIBAYAR_DIMUKA:{ label: 'PPh dibayar dimuka (kredit pajak)', tipe: 'A', bag: 'AL',  pos: 'Pajak dibayar dimuka',          cf: 'OP',  dm: 'PAJAK' },
  INVESTASI_PENDEK:    { label: 'Investasi jangka pendek',           tipe: 'A', bag: 'AL',  pos: 'Investasi jangka pendek',       cf: 'INV', dm: 'INVESTASI' },
  INVESTASI_PANJANG:   { label: 'Investasi jangka panjang',          tipe: 'A', bag: 'ATL', pos: 'Investasi jangka panjang',      cf: 'INV', dm: 'INVESTASI' },
  ASET_TETAP:          { label: 'Aset tetap',                        tipe: 'A', bag: 'ATL', pos: 'Aset tetap - harga perolehan',  cf: 'INV', dm: 'ASET_TETAP' },
  AKUM_PENYUSUTAN:     { label: 'Akumulasi penyusutan',              tipe: 'A', bag: 'ATL', pos: 'Akumulasi penyusutan',          cf: 'OP',  dm: 'OP_LAIN' },
  ASET_LAIN:           { label: 'Aset lain-lain',                    tipe: 'A', bag: 'ATL', pos: 'Aset lain-lain',                cf: 'INV', dm: 'INVESTASI' },
  AKUM_AMORTISASI:     { label: 'Akumulasi amortisasi',              tipe: 'A', bag: 'ATL', pos: 'Akumulasi amortisasi',          cf: 'OP',  dm: 'OP_LAIN' },
  UTANG_USAHA:         { label: 'Utang usaha',                       tipe: 'L', bag: 'LJP', pos: 'Utang usaha',                   cf: 'OP',  dm: 'PEMASOK' },
  UTANG_PAJAK:         { label: 'Utang pajak',                       tipe: 'L', bag: 'LJP', pos: 'Utang pajak',                   cf: 'OP',  dm: 'PAJAK' },
  UTANG_BANK_PENDEK:   { label: 'Utang bank jangka pendek',          tipe: 'L', bag: 'LJP', pos: 'Utang bank jangka pendek',      cf: 'FIN', dm: 'PINJAMAN_BANK' },
  BIAYA_YMH:           { label: 'Biaya yang masih harus dibayar',    tipe: 'L', bag: 'LJP', pos: 'Biaya yang masih harus dibayar', cf: 'OP', dm: 'BEBAN' },
  UANG_MUKA_PELANGGAN: { label: 'Uang muka pelanggan',               tipe: 'L', bag: 'LJP', pos: 'Uang muka pelanggan',           cf: 'OP',  dm: 'PELANGGAN' },
  UTANG_LEASING_PENDEK:{ label: 'Utang sewa pembiayaan jk pendek',   tipe: 'L', bag: 'LJP', pos: 'Utang sewa pembiayaan jangka pendek', cf: 'FIN', dm: 'PINJAMAN_LAIN' },
  UTANG_LAIN:          { label: 'Utang lain-lain',                   tipe: 'L', bag: 'LJP', pos: 'Utang lain-lain',               cf: 'OP',  dm: 'OP_LAIN' },
  UTANG_BANK_PANJANG:  { label: 'Utang bank jangka panjang',         tipe: 'L', bag: 'LJG', pos: 'Utang bank jangka panjang',     cf: 'FIN', dm: 'PINJAMAN_BANK' },
  UTANG_LEASING_PANJANG:{label: 'Utang sewa pembiayaan jk panjang',  tipe: 'L', bag: 'LJG', pos: 'Utang sewa pembiayaan jangka panjang', cf: 'FIN', dm: 'PINJAMAN_LAIN' },
  UTANG_PEMEGANG_SAHAM:{ label: 'Utang pemegang saham',              tipe: 'L', bag: 'LJG', pos: 'Utang pemegang saham',          cf: 'FIN', dm: 'PINJAMAN_LAIN' },
  UTANG_PANJANG_LAIN:  { label: 'Utang jangka panjang lainnya',      tipe: 'L', bag: 'LJG', pos: 'Utang jangka panjang lainnya',  cf: 'FIN', dm: 'PINJAMAN_LAIN' },
  MODAL:               { label: 'Modal disetor',                     tipe: 'E', bag: 'EK',  pos: 'Modal disetor',                 cf: 'FIN', dm: 'MODAL' },
  CADANGAN:            { label: 'Cadangan / ekuitas lain',           tipe: 'E', bag: 'EK',  pos: 'Cadangan dan ekuitas lain',     cf: 'FIN', dm: 'MODAL' },
  SALDO_LABA:          { label: 'Saldo laba',                        tipe: 'E', bag: 'EK',  pos: 'Saldo laba',                    cf: 'FIN', dm: 'DIVIDEN' },
  LABA_BERJALAN:       { label: 'Laba tahun berjalan (akun)',        tipe: 'E', bag: 'EK',  pos: 'Saldo laba',                    cf: 'FIN', dm: 'DIVIDEN' },
  DIVIDEN:             { label: 'Dividen',                           tipe: 'E', bag: 'EK',  pos: 'Saldo laba',                    cf: 'FIN', dm: 'DIVIDEN' },
  PENDAPATAN:          { label: 'Pendapatan usaha',                  tipe: 'R', bag: 'LR',  pos: 'Pendapatan usaha',              dm: 'PELANGGAN' },
  HPP:                 { label: 'Beban pokok pendapatan',            tipe: 'X', bag: 'LR',  pos: 'Beban pokok pendapatan',        dm: 'PEMASOK' },
  BEBAN_PENJUALAN:     { label: 'Beban penjualan',                   tipe: 'X', bag: 'LR',  pos: 'Beban penjualan',               dm: 'BEBAN' },
  BEBAN_UMUM:          { label: 'Beban umum dan administrasi',       tipe: 'X', bag: 'LR',  pos: 'Beban umum dan administrasi',   dm: 'BEBAN' },
  BEBAN_PENYUSUTAN:    { label: 'Beban penyusutan dan amortisasi',   tipe: 'X', bag: 'LR',  pos: 'Beban umum dan administrasi',   dm: 'BEBAN' },
  PENDAPATAN_LAIN:     { label: 'Pendapatan lain-lain',              tipe: 'R', bag: 'LR',  pos: 'Pendapatan lain-lain',          dm: 'OP_LAIN' },
  BEBAN_BUNGA:         { label: 'Beban bunga dan keuangan',          tipe: 'X', bag: 'LR',  pos: 'Beban bunga dan keuangan',      dm: 'BUNGA' },
  BEBAN_LAIN:          { label: 'Beban lain-lain',                   tipe: 'X', bag: 'LR',  pos: 'Beban lain-lain',               dm: 'OP_LAIN' },
  BEBAN_PAJAK:         { label: 'Beban pajak penghasilan',           tipe: 'X', bag: 'LR',  pos: 'Beban pajak penghasilan',       dm: 'PAJAK' },
  PAJAK_TANGGUHAN:     { label: 'Beban/manfaat pajak tangguhan',     tipe: 'X', bag: 'LR',  pos: 'Beban pajak penghasilan',       dm: 'OP_LAIN' }
};

var DM_KATEGORI = {
  PELANGGAN:     { act: 'OP',  label: 'Penerimaan kas dari pelanggan' },
  PEMASOK:       { act: 'OP',  label: 'Pembayaran kas kepada pemasok' },
  BEBAN:         { act: 'OP',  label: 'Pembayaran beban operasional dan karyawan' },
  PAJAK:         { act: 'OP',  label: 'Pembayaran pajak' },
  BUNGA:         { act: 'OP',  label: 'Pembayaran bunga dan beban keuangan' },
  OP_LAIN:       { act: 'OP',  label: 'Penerimaan (pembayaran) operasi lainnya' },
  ASET_TETAP:    { act: 'INV', label: 'Perolehan / penjualan aset tetap' },
  INVESTASI:     { act: 'INV', label: 'Investasi dan aset lain-lain' },
  PINJAMAN_BANK: { act: 'FIN', label: 'Penerimaan (pembayaran) utang bank' },
  PINJAMAN_LAIN: { act: 'FIN', label: 'Penerimaan (pembayaran) pinjaman lainnya' },
  MODAL:         { act: 'FIN', label: 'Setoran modal' },
  DIVIDEN:       { act: 'FIN', label: 'Pembayaran dividen' }
};

var BAGIAN_NERACA = [
  { key: 'AL',  label: 'ASET LANCAR',                  sisi: 'A' },
  { key: 'ATL', label: 'ASET TIDAK LANCAR',            sisi: 'A' },
  { key: 'LJP', label: 'LIABILITAS JANGKA PENDEK',     sisi: 'L' },
  { key: 'LJG', label: 'LIABILITAS JANGKA PANJANG',    sisi: 'L' },
  { key: 'EK',  label: 'EKUITAS',                      sisi: 'E' }
];

var AGING_BUCKETS = ['Belum jatuh tempo', '1-30 hari', '31-60 hari', '61-90 hari', '> 90 hari'];

/* ---------- util tanggal ---------- */
function ymOf_(d) { return String(d).substring(0, 7); }
function ymAdd_(ym, n) {
  var y = Number(ym.substring(0, 4)), m = Number(ym.substring(5, 7)) - 1 + n;
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  return y + '-' + (m < 9 ? '0' : '') + (m + 1);
}
function ymLastDay_(ym) {
  var y = Number(ym.substring(0, 4)), m = Number(ym.substring(5, 7));
  var d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return ym + '-' + (d < 10 ? '0' : '') + d;
}
function dateAddDays_(iso, n) {
  var t = Date.UTC(Number(iso.substring(0, 4)), Number(iso.substring(5, 7)) - 1, Number(iso.substring(8, 10))) + n * 864e5;
  return new Date(t).toISOString().substring(0, 10);
}
function daysBetween_(a, b) {
  var ta = Date.UTC(Number(a.substring(0, 4)), Number(a.substring(5, 7)) - 1, Number(a.substring(8, 10)));
  var tb = Date.UTC(Number(b.substring(0, 4)), Number(b.substring(5, 7)) - 1, Number(b.substring(8, 10)));
  return Math.round((tb - ta) / 864e5);
}
function r2_(n) { return Math.round((Number(n) || 0) * 100) / 100; }

/** Tebak kelompok akun dari kode dan nama (dipakai saat impor COA tanpa kolom Kelompok). */
function guessKelompok(kode, nama) {
  var k = String(kode), n = String(nama || '').toLowerCase();
  var num = parseFloat(k.replace('-', '.')) || 0;
  var has = function (w) { return n.indexOf(w) >= 0; };
  var c = k.charAt(0);
  if (c === '1') {
    if (has('akumulasi') || (has('penyusutan') && !has('biaya'))) return 'AKUM_PENYUSUTAN';
    if (has('amortisasi')) return 'AKUM_AMORTISASI';
    if (has('penyisihan')) return 'PENYISIHAN_PIUTANG';
    if (has('deposito')) return 'SETARA_KAS';
    if (has('bank') && !has('guarantee') && !has('silang')) return 'BANK';
    if (has('kas') || has('ayat silang')) return 'KAS';
    if (has('piutang usaha')) return 'PIUTANG_USAHA';
    if (has('piutang')) return 'PIUTANG_LAIN';
    if (has('persediaan')) return 'PERSEDIAAN';
    if (has('ppn')) return 'PPN_MASUKAN';
    if (has('pph')) return 'PAJAK_DIBAYAR_DIMUKA';
    if (has('uang muka')) return 'UANG_MUKA';
    if (has('dibayar dimuka') || has('dibayar di muka')) return 'DIBAYAR_DIMUKA';
    if (has('investasi jangka panjang')) return 'INVESTASI_PANJANG';
    if (has('investasi')) return 'INVESTASI_PENDEK';
    if (num >= 1600 && num < 1700) return 'ASET_TETAP';
    if (num >= 1700) return 'ASET_LAIN';
    return 'PIUTANG_LAIN';
  }
  if (c === '2') {
    if (has('jk panjang') || has('jgk panjang') || has('jangka panjang')) {
      if (has('bank')) return 'UTANG_BANK_PANJANG';
      if (has('leasing')) return 'UTANG_LEASING_PANJANG';
      return 'UTANG_PANJANG_LAIN';
    }
    if (has('pemegang saham')) return 'UTANG_PEMEGANG_SAHAM';
    if (has('overdraft') || has('hutang bank') || has('utang bank')) return 'UTANG_BANK_PENDEK';
    if (has('hutang usaha') || has('utang usaha')) return 'UTANG_USAHA';
    if (has('pajak') || has('pph') || has('ppn')) return 'UTANG_PAJAK';
    if (has('masih harus dibayar')) return 'BIAYA_YMH';
    if (has('uang muka pelanggan')) return 'UANG_MUKA_PELANGGAN';
    if (has('leasing')) return 'UTANG_LEASING_PENDEK';
    return 'UTANG_LAIN';
  }
  if (c === '3') {
    if (has('dividen') || has('prive')) return 'DIVIDEN';
    if (has('ditahan') || has('saldo laba')) return 'SALDO_LABA';
    if (has('laba bersih') || has('tahun berjalan')) return 'LABA_BERJALAN';
    if (has('cadangan')) return 'CADANGAN';
    return 'MODAL';
  }
  if (c === '4') return 'PENDAPATAN';
  if (c === '5') return 'HPP';
  if (c === '6') return 'BEBAN_PENJUALAN';
  if (c === '7') {
    if (has('25/29') || has('pajak penghasilan badan')) return 'BEBAN_PAJAK';
    if (has('penyusutan') || has('amortisasi')) return 'BEBAN_PENYUSUTAN';
    return 'BEBAN_UMUM';
  }
  if (c === '8') {
    if (has('tangguhan')) return 'PAJAK_TANGGUHAN';
    if (has('provisi pajak') || has('pajak penghasilan badan')) return 'BEBAN_PAJAK';
    if (has('bunga pinjaman') || has('bunga leasing') || has('biaya pinjaman')) return 'BEBAN_BUNGA';
    if (n.indexOf('biaya') === 0 || n.indexOf('beban') === 0) return 'BEBAN_LAIN';
    if (has('pendapatan') || has('laba') || has('manfaat')) return 'PENDAPATAN_LAIN';
    return 'BEBAN_LAIN';
  }
  return 'BEBAN_LAIN';
}

/**
 * Bangun konteks perhitungan.
 * coa   : [{kode,nama,normal,kelompok,coretax}]
 * lines : [{id,tanggal,ref,akun,lawan,partner,invoice,top,deskripsi,dc,nilai,nde}]
 */
function buildContext(coa, lines) {
  var acc = {};
  coa.forEach(function (a) {
    var kel = KELOMPOK[a.kelompok] ? a.kelompok : guessKelompok(a.kode, a.nama);
    acc[String(a.kode)] = { kode: String(a.kode), nama: a.nama, kel: kel, coretax: a.coretax || '', meta: KELOMPOK[kel] };
  });
  var mov = {}, months = {}, byRef = {}, unknown = {};
  var L = [];
  lines.forEach(function (x) {
    var kode = String(x.akun);
    if (!acc[kode]) { unknown[kode] = true; return; }
    var nilai = Number(x.nilai) || 0;
    var s = String(x.dc).toUpperCase().charAt(0) === 'D' ? nilai : -nilai;
    var ym = ymOf_(x.tanggal);
    var o = { id: x.id, tanggal: String(x.tanggal), ym: ym, ref: String(x.ref), akun: kode, lawan: x.lawan ? String(x.lawan) : '',
      partner: x.partner || '', invoice: x.invoice || '', top: Number(x.top) || 0, deskripsi: x.deskripsi || '',
      s: s, nde: x.nde === true || String(x.nde).toUpperCase() === 'Y' || String(x.nde).toUpperCase() === 'TRUE' };
    L.push(o);
    if (!mov[kode]) mov[kode] = {};
    mov[kode][ym] = (mov[kode][ym] || 0) + s;
    months[ym] = true;
    (byRef[o.ref] = byRef[o.ref] || []).push(o);
  });
  L.sort(function (a, b) { return a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0); });
  var ctx = { acc: acc, lines: L, mov: mov, months: Object.keys(months).sort(), byRef: byRef, unknown: Object.keys(unknown) };
  ctx.kodes = Object.keys(acc).sort();
  return ctx;
}

/* ---------- akses saldo ---------- */
function movAcc_(ctx, kode, from, to) {
  var m = ctx.mov[kode]; if (!m) return 0;
  var t = 0;
  for (var ym in m) if ((!from || ym >= from) && ym <= to) t += m[ym];
  return t;
}
function balAcc_(ctx, kode, to) { return movAcc_(ctx, kode, null, to); }
function kodesOf_(ctx, kels) {
  return ctx.kodes.filter(function (k) { return kels.indexOf(ctx.acc[k].kel) >= 0; });
}
function movKel_(ctx, kels, from, to) {
  return kodesOf_(ctx, kels).reduce(function (t, k) { return t + movAcc_(ctx, k, from, to); }, 0);
}
function kelsWhere_(fn) { return Object.keys(KELOMPOK).filter(function (k) { return fn(KELOMPOK[k], k); }); }
var PL_KELS_ = null;
function plKels_() { return PL_KELS_ || (PL_KELS_ = kelsWhere_(function (m) { return m.bag === 'LR'; })); }
var CASH_KELS_ = ['KAS', 'BANK', 'SETARA_KAS'];

/** Kolom pembanding untuk periode ym. */
function periodCols(ctx, ym) {
  var y = ym.substring(0, 4), pm = ymAdd_(ym, -1), ly = ymAdd_(ym, -12);
  var cols = [
    { key: 'cur',     label: 'Bulan ini',      from: ym, to: ym },
    { key: 'prev',    label: 'Bulan lalu',     from: pm, to: pm },
    { key: 'ytd',     label: 'YTD bulan ini',  from: y + '-01', to: ym },
    { key: 'ytdPrev', label: 'YTD bulan lalu', from: pm.substring(0, 4) + '-01', to: pm }
  ];
  var lyYear = ly.substring(0, 4);
  var pl = plKels_();
  var hasLy = ctx.lines.some(function (l) { return l.ym.substring(0, 4) === lyYear && pl.indexOf(ctx.acc[l.akun].kel) >= 0; });
  if (hasLy) {
    cols.push({ key: 'ly',    label: 'Bulan sama tahun lalu', from: ly, to: ly });
    cols.push({ key: 'lyYtd', label: 'YTD tahun lalu',        from: lyYear + '-01', to: ly });
  }
  return cols;
}

/* ---------- Laba Rugi ---------- */
function labaRugi(ctx, ym) {
  var cols = periodCols(ctx, ym);
  var rows = [];
  var tot = {};
  function line(label, kels, sign) {
    var vals = {}, detail = [];
    kodesOf_(ctx, kels).forEach(function (k) {
      var dv = {}, any = false;
      cols.forEach(function (c) { dv[c.key] = r2_(sign * movAcc_(ctx, k, c.from, c.to)); if (dv[c.key]) any = true; });
      if (any) detail.push({ kode: k, nama: ctx.acc[k].nama, vals: dv });
    });
    cols.forEach(function (c) { vals[c.key] = r2_(detail.reduce(function (t, d) { return t + d.vals[c.key]; }, 0)); });
    rows.push({ type: 'row', label: label, vals: vals, detail: detail });
    return vals;
  }
  function sub(label, key, fn) {
    var vals = {};
    cols.forEach(function (c) { vals[c.key] = r2_(fn(c.key)); });
    tot[key] = vals;
    rows.push({ type: 'total', label: label, key: key, vals: vals });
  }
  var rev = line('Pendapatan usaha', ['PENDAPATAN'], -1);
  var hpp = line('Beban pokok pendapatan', ['HPP'], 1);
  sub('LABA BRUTO', 'labaBruto', function (k) { return rev[k] - hpp[k]; });
  var bj = line('Beban penjualan', ['BEBAN_PENJUALAN'], 1);
  var bu = line('Beban umum dan administrasi', ['BEBAN_UMUM', 'BEBAN_PENYUSUTAN'], 1);
  sub('LABA USAHA', 'labaUsaha', function (k) { return tot.labaBruto[k] - bj[k] - bu[k]; });
  var pl = line('Pendapatan lain-lain', ['PENDAPATAN_LAIN'], -1);
  var bb = line('Beban bunga dan keuangan', ['BEBAN_BUNGA'], 1);
  var bl = line('Beban lain-lain', ['BEBAN_LAIN'], 1);
  sub('LABA SEBELUM PAJAK', 'labaSebelumPajak', function (k) { return tot.labaUsaha[k] + pl[k] - bb[k] - bl[k]; });
  var tx = line('Beban pajak penghasilan', ['BEBAN_PAJAK', 'PAJAK_TANGGUHAN'], 1);
  sub('LABA BERSIH', 'labaBersih', function (k) { return tot.labaSebelumPajak[k] - tx[k]; });
  tot.pendapatan = rev; tot.hpp = hpp; tot.bebanPenjualan = bj; tot.bebanUmum = bu;
  tot.pendapatanLain = pl; tot.bebanBunga = bb; tot.bebanLain = bl; tot.bebanPajak = tx;
  var dep = {};
  cols.forEach(function (c) { dep[c.key] = r2_(movKel_(ctx, ['BEBAN_PENYUSUTAN'], c.from, c.to)); });
  tot.penyusutan = dep;
  return { cols: cols, rows: rows, tot: tot };
}

/* ---------- Neraca ---------- */
function labaBersihRange_(ctx, from, to) { return -movKel_(ctx, plKels_(), from, to); }

function neraca(ctx, ym) {
  var pm = ymAdd_(ym, -1), ly = ymAdd_(ym, -12);
  var cols = [{ key: 'cur', label: 'Bulan ini', to: ym }, { key: 'prev', label: 'Bulan lalu', to: pm }];
  if (ctx.months.length && ctx.months[0] <= ly) cols.push({ key: 'ly', label: 'Bulan sama tahun lalu', to: ly });
  var rows = [], tot = {};
  var zero = function () { var o = {}; cols.forEach(function (c) { o[c.key] = 0; }); return o; };
  var add = function (a, b) { cols.forEach(function (c) { a[c.key] = r2_(a[c.key] + b[c.key]); }); };
  var sideTot = { A: zero(), L: zero(), E: zero() };

  BAGIAN_NERACA.forEach(function (bg) {
    rows.push({ type: 'head', label: bg.label });
    var sign = bg.sisi === 'A' ? 1 : -1;
    var posMap = {}, posOrder = [];
    Object.keys(KELOMPOK).forEach(function (kel) {
      var m = KELOMPOK[kel]; if (m.bag !== bg.key) return;
      if (!posMap[m.pos]) { posMap[m.pos] = []; posOrder.push(m.pos); }
      posMap[m.pos].push(kel);
    });
    var bagTot = zero();
    posOrder.forEach(function (pos) {
      var detail = [], vals = zero();
      kodesOf_(ctx, posMap[pos]).forEach(function (k) {
        var dv = {}, any = false;
        cols.forEach(function (c) { dv[c.key] = r2_(sign * balAcc_(ctx, k, c.to)); if (dv[c.key]) any = true; });
        if (any) { detail.push({ kode: k, nama: ctx.acc[k].nama, vals: dv }); add(vals, dv); }
      });
      if (pos === 'Saldo laba') {
        // laba tahun-tahun sebelumnya yang belum ditutup + laba tahun berjalan
        var prior = {}, curr = {};
        cols.forEach(function (c) {
          var fy = c.to.substring(0, 4) + '-01';
          prior[c.key] = r2_(labaBersihRange_(ctx, null, ymAdd_(fy, -1)));
          curr[c.key] = r2_(labaBersihRange_(ctx, fy, c.to));
        });
        detail.push({ kode: '', nama: 'Akumulasi laba (rugi) tahun-tahun sebelumnya', vals: prior });
        add(vals, prior);
        rows.push({ type: 'row', label: 'Saldo laba', vals: vals, detail: detail });
        add(bagTot, vals);
        rows.push({ type: 'row', label: 'Laba (rugi) tahun berjalan', vals: curr, detail: [] });
        add(bagTot, curr);
        tot.labaBerjalan = curr;
        return;
      }
      var any = cols.some(function (c) { return vals[c.key] !== 0; });
      if (any) { rows.push({ type: 'row', label: pos, vals: vals, detail: detail }); add(bagTot, vals); }
      tot['pos:' + pos] = vals;
    });
    rows.push({ type: 'sub', label: 'Jumlah ' + bg.label.toLowerCase(), vals: bagTot });
    tot[bg.key] = bagTot;
    add(sideTot[bg.sisi], bagTot);
    if (bg.key === 'ATL') rows.push({ type: 'total', label: 'JUMLAH ASET', vals: sideTot.A });
    if (bg.key === 'LJG') rows.push({ type: 'total', label: 'JUMLAH LIABILITAS', vals: sideTot.L });
    if (bg.key === 'EK') {
      var le = zero(); add(le, sideTot.L); add(le, sideTot.E);
      rows.push({ type: 'total', label: 'JUMLAH LIABILITAS DAN EKUITAS', vals: le });
      tot.liabEkuitas = le;
    }
  });
  tot.aset = sideTot.A; tot.liabilitas = sideTot.L; tot.ekuitas = sideTot.E;
  var selisih = {};
  cols.forEach(function (c) { selisih[c.key] = r2_(tot.aset[c.key] - tot.liabEkuitas[c.key]); });
  return { cols: cols, rows: rows, tot: tot, selisih: selisih };
}

/* ---------- Perubahan Ekuitas ---------- */
function perubahanEkuitas(ctx, ym) {
  var y = ym.substring(0, 4), fy = y + '-01', open = ymAdd_(fy, -1);
  var comps = [
    { key: 'modal',    label: 'Modal disetor',            kels: ['MODAL'] },
    { key: 'cadangan', label: 'Cadangan / ekuitas lain',  kels: ['CADANGAN'] },
    { key: 'laba',     label: 'Saldo laba',               kels: ['SALDO_LABA', 'LABA_BERJALAN', 'DIVIDEN'] }
  ];
  function tabel(from, to, judul) {
    var before = ymAdd_(from, -1);
    var rows = [];
    var awal = {}, setoran = {}, laba = {}, div = {}, lain = {}, akhir = {};
    comps.forEach(function (c) {
      awal[c.key] = r2_(-movKel_(ctx, c.kels, null, before));
      setoran[c.key] = 0; laba[c.key] = 0; div[c.key] = 0; lain[c.key] = 0;
    });
    // saldo laba awal termasuk laba yang belum ditutup: tahun-tahun lalu + YTD sampai sebelum 'from'
    awal.laba = r2_(awal.laba + labaBersihRange_(ctx, null, before));
    setoran.modal = r2_(-movKel_(ctx, ['MODAL'], from, to));
    lain.cadangan = r2_(-movKel_(ctx, ['CADANGAN'], from, to));
    laba.laba = r2_(labaBersihRange_(ctx, from, to));
    div.laba = r2_(-movKel_(ctx, ['DIVIDEN'], from, to));
    lain.laba = r2_(-movKel_(ctx, ['SALDO_LABA', 'LABA_BERJALAN'], from, to));
    comps.forEach(function (c) { akhir[c.key] = r2_(awal[c.key] + setoran[c.key] + laba[c.key] + div[c.key] + lain[c.key]); });
    var mk = function (label, o, type) {
      var t = comps.reduce(function (s, c) { return s + o[c.key]; }, 0);
      return { label: label, type: type || 'row', vals: { modal: o.modal, cadangan: o.cadangan, laba: o.laba, total: r2_(t) } };
    };
    rows.push(mk('Saldo awal', awal, 'sub'));
    rows.push(mk('Setoran modal', setoran));
    rows.push(mk('Laba (rugi) periode berjalan', laba));
    rows.push(mk('Dividen', div));
    rows.push(mk('Penyesuaian lain', lain));
    rows.push(mk('Saldo akhir', akhir, 'total'));
    return { judul: judul, rows: rows };
  }
  return {
    cols: [{ key: 'modal', label: 'Modal disetor' }, { key: 'cadangan', label: 'Cadangan' }, { key: 'laba', label: 'Saldo laba' }, { key: 'total', label: 'Jumlah ekuitas' }],
    tables: [tabel(ym, ym, 'Bulan ini'), tabel(ymAdd_(ym, -1), ymAdd_(ym, -1), 'Bulan lalu'), tabel(fy, ym, 'YTD bulan ini'),
      tabel(ymAdd_(ym, -1).substring(0, 4) + '-01', ymAdd_(ym, -1), 'YTD bulan lalu')]
  };
}

/* ---------- Arus Kas ---------- */
function arusKasTidakLangsung(ctx, ym) {
  var cols = periodCols(ctx, ym), rows = [];
  var zero = function () { var o = {}; cols.forEach(function (c) { o[c.key] = 0; }); return o; };
  function eff(kels) { var v = {}; cols.forEach(function (c) { v[c.key] = r2_(-movKel_(ctx, kels, c.from, c.to)); }); return v; }
  function push(label, v, type) { rows.push({ type: type || 'row', label: label, vals: v }); return v; }
  function sum(list) { var t = zero(); list.forEach(function (v) { cols.forEach(function (c) { t[c.key] = r2_(t[c.key] + v[c.key]); }); }); return t; }
  function pushIf(label, kels, acc) {
    var v = eff(kels);
    if (cols.some(function (c) { return v[c.key] !== 0; })) { push(label, v); acc.push(v); }
  }

  rows.push({ type: 'head', label: 'ARUS KAS DARI AKTIVITAS OPERASI' });
  var op = [];
  op.push(push('Laba (rugi) bersih', eff(plKels_())));
  rows.push({ type: 'head2', label: 'Penyesuaian:' });
  pushIf('Penyusutan dan amortisasi', ['AKUM_PENYUSUTAN', 'AKUM_AMORTISASI'], op);
  rows.push({ type: 'head2', label: 'Perubahan aset dan liabilitas operasi:' });
  Object.keys(KELOMPOK).forEach(function (kel) {
    var m = KELOMPOK[kel];
    if (m.cf !== 'OP' || kel === 'AKUM_PENYUSUTAN' || kel === 'AKUM_AMORTISASI') return;
    pushIf((m.tipe === 'A' ? 'Penurunan (kenaikan) ' : 'Kenaikan (penurunan) ') + m.label.toLowerCase(), [kel], op);
  });
  var tOp = push('Kas bersih dari aktivitas operasi', sum(op), 'sub');

  rows.push({ type: 'head', label: 'ARUS KAS DARI AKTIVITAS INVESTASI' });
  var inv = [];
  Object.keys(KELOMPOK).forEach(function (kel) {
    if (KELOMPOK[kel].cf === 'INV') pushIf('Pelepasan (perolehan) ' + KELOMPOK[kel].label.toLowerCase(), [kel], inv);
  });
  var tInv = push('Kas bersih dari aktivitas investasi', sum(inv), 'sub');

  rows.push({ type: 'head', label: 'ARUS KAS DARI AKTIVITAS PENDANAAN' });
  var fin = [];
  Object.keys(KELOMPOK).forEach(function (kel) {
    var m = KELOMPOK[kel];
    if (m.cf !== 'FIN' || m.tipe !== 'L') return;
    pushIf('Penerimaan (pembayaran) ' + m.label.toLowerCase(), [kel], fin);
  });
  pushIf('Setoran modal', ['MODAL'], fin);
  pushIf('Perubahan cadangan / ekuitas lain', ['CADANGAN'], fin);
  pushIf('Pembayaran dividen', ['DIVIDEN'], fin);
  pushIf('Penyesuaian saldo laba', ['SALDO_LABA', 'LABA_BERJALAN'], fin);
  var tFin = push('Kas bersih dari aktivitas pendanaan', sum(fin), 'sub');

  return arusKasPenutup_(ctx, cols, rows, sum([tOp, tInv, tFin]), { op: tOp, inv: tInv, fin: tFin });
}

function arusKasPenutup_(ctx, cols, rows, net, tot) {
  var awal = {}, akhir = {}, selisih = {};
  cols.forEach(function (c) {
    awal[c.key] = r2_(movKel_(ctx, CASH_KELS_, null, ymAdd_(c.from, -1)));
    akhir[c.key] = r2_(movKel_(ctx, CASH_KELS_, null, c.to));
    selisih[c.key] = r2_(awal[c.key] + net[c.key] - akhir[c.key]);
  });
  rows.push({ type: 'total', label: 'KENAIKAN (PENURUNAN) BERSIH KAS DAN SETARA KAS', vals: net });
  rows.push({ type: 'row', label: 'Kas dan setara kas awal periode', vals: awal });
  rows.push({ type: 'total', label: 'KAS DAN SETARA KAS AKHIR PERIODE', vals: akhir });
  tot.net = net; tot.awal = awal; tot.akhir = akhir;
  return { cols: cols, rows: rows, tot: tot, selisih: selisih };
}

/** Daftar butir arus kas metode langsung: [{ym, cat, amount}] (dihitung sekali per konteks). */
function directItems_(ctx) {
  if (ctx._direct) return ctx._direct;
  var items = [];
  var isCash = function (kode) { return ctx.acc[kode] && CASH_KELS_.indexOf(ctx.acc[kode].kel) >= 0; };
  Object.keys(ctx.byRef).forEach(function (ref) {
    var ls = ctx.byRef[ref];
    var cash = ls.filter(function (l) { return isCash(l.akun); });
    if (!cash.length) return;
    var allLawan = cash.every(function (l) { return l.lawan && ctx.acc[l.lawan]; });
    if (allLawan) {
      cash.forEach(function (l) {
        if (isCash(l.lawan)) return; // pemindahbukuan antar kas/bank
        items.push({ ym: l.ym, cat: ctx.acc[l.lawan].meta.dm || 'OP_LAIN', amount: l.s });
      });
    } else {
      // tanpa lawan akun: alokasikan ke baris non-kas dalam jurnal yang sama
      var non = ls.filter(function (l) { return !isCash(l.akun); });
      non.forEach(function (l) { items.push({ ym: l.ym, cat: ctx.acc[l.akun].meta.dm || 'OP_LAIN', amount: -l.s }); });
    }
  });
  ctx._direct = items;
  return items;
}

function arusKasLangsung(ctx, ym) {
  var cols = periodCols(ctx, ym), rows = [], items = directItems_(ctx);
  var zero = function () { var o = {}; cols.forEach(function (c) { o[c.key] = 0; }); return o; };
  var catVals = {};
  items.forEach(function (it) {
    cols.forEach(function (c) {
      if (it.ym >= c.from && it.ym <= c.to) {
        (catVals[it.cat] = catVals[it.cat] || zero())[c.key] += it.amount;
      }
    });
  });
  var acts = [['OP', 'OPERASI'], ['INV', 'INVESTASI'], ['FIN', 'PENDANAAN']];
  var net = zero(), tot = {};
  acts.forEach(function (a) {
    rows.push({ type: 'head', label: 'ARUS KAS DARI AKTIVITAS ' + a[1] });
    var t = zero();
    Object.keys(DM_KATEGORI).forEach(function (cat) {
      if (DM_KATEGORI[cat].act !== a[0] || !catVals[cat]) return;
      var v = {}; cols.forEach(function (c) { v[c.key] = r2_(catVals[cat][c.key]); t[c.key] = r2_(t[c.key] + v[c.key]); });
      rows.push({ type: 'row', label: DM_KATEGORI[cat].label, vals: v });
    });
    rows.push({ type: 'sub', label: 'Kas bersih dari aktivitas ' + a[1].toLowerCase(), vals: t });
    tot[a[0].toLowerCase()] = t;
    cols.forEach(function (c) { net[c.key] = r2_(net[c.key] + t[c.key]); });
  });
  return arusKasPenutup_(ctx, cols, rows, net, tot);
}

/* ---------- Laporan pendukung ---------- */
function bukuBesarKel_(ctx, kels, ym) {
  var pm = ymAdd_(ym, -1);
  return kodesOf_(ctx, kels).map(function (k) {
    var awal = r2_(balAcc_(ctx, k, pm)), run = awal, d = 0, c = 0;
    var ls = ctx.lines.filter(function (l) { return l.akun === k && l.ym === ym; }).map(function (l) {
      run = r2_(run + l.s);
      if (l.s >= 0) d += l.s; else c -= l.s;
      return { tanggal: l.tanggal, ref: l.ref, deskripsi: l.deskripsi, partner: l.partner, debit: l.s > 0 ? l.s : 0, kredit: l.s < 0 ? -l.s : 0, saldo: run };
    });
    return { kode: k, nama: ctx.acc[k].nama, saldoAwal: awal, debit: r2_(d), kredit: r2_(c), saldoAkhir: run, lines: ls };
  }).filter(function (a) { return a.saldoAwal || a.lines.length; });
}

/** Buku pembantu per partner + invoice dengan aging. sign: +1 piutang, -1 utang. */
function invoiceLedger_(ctx, kels, sign, ym) {
  var asOf = ymLastDay_(ym), map = {}, kodes = kodesOf_(ctx, kels);
  ctx.lines.forEach(function (l) {
    if (l.ym > ym || kodes.indexOf(l.akun) < 0) return;
    var key = (l.partner || '(tanpa partner)') + '||' + (l.invoice || '(tanpa invoice)');
    var o = map[key] || (map[key] = { partner: l.partner || '(tanpa partner)', invoice: l.invoice || '(tanpa invoice)', akun: l.akun, tanggal: '', top: 0, tagihan: 0, bayar: 0 });
    var v = sign * l.s;
    if (v > 0) {
      o.tagihan += v;
      if (!o.tanggal || l.tanggal < o.tanggal) { o.tanggal = l.tanggal; o.top = l.top; }
    } else o.bayar += -v;
  });
  var rows = [], byP = {}, buckets = [0, 0, 0, 0, 0], total = 0;
  Object.keys(map).sort().forEach(function (key) {
    var o = map[key];
    o.tagihan = r2_(o.tagihan); o.bayar = r2_(o.bayar); o.sisa = r2_(o.tagihan - o.bayar);
    if (Math.abs(o.sisa) < 0.5) return;
    if (!o.tanggal) o.tanggal = '';
    o.jatuhTempo = o.tanggal ? dateAddDays_(o.tanggal, o.top) : '';
    o.hari = o.jatuhTempo ? daysBetween_(o.jatuhTempo, asOf) : 0;
    o.bucket = o.hari <= 0 ? 0 : o.hari <= 30 ? 1 : o.hari <= 60 ? 2 : o.hari <= 90 ? 3 : 4;
    rows.push(o);
    var p = byP[o.partner] || (byP[o.partner] = { partner: o.partner, total: 0, b: [0, 0, 0, 0, 0] });
    p.total = r2_(p.total + o.sisa); p.b[o.bucket] = r2_(p.b[o.bucket] + o.sisa);
    buckets[o.bucket] = r2_(buckets[o.bucket] + o.sisa); total = r2_(total + o.sisa);
  });
  var gl = r2_(sign * movKel_(ctx, kels, null, ym));
  return { asOf: asOf, rows: rows, byPartner: Object.keys(byP).sort().map(function (k) { return byP[k]; }),
    buckets: buckets, bucketLabels: AGING_BUCKETS, total: total, saldoBukuBesar: gl, selisih: r2_(total - gl) };
}

/** Mutasi per akun + partner: saldo awal, penambahan, pengurangan, saldo akhir. */
function movementLedger_(ctx, kels, sign, ym) {
  var pm = ymAdd_(ym, -1), map = {}, kodes = kodesOf_(ctx, kels);
  ctx.lines.forEach(function (l) {
    if (l.ym > ym || kodes.indexOf(l.akun) < 0) return;
    var key = l.akun + '||' + (l.partner || '-') + '||' + (l.invoice || '-');
    var o = map[key] || (map[key] = { kode: l.akun, nama: ctx.acc[l.akun].nama, partner: l.partner || '-', invoice: l.invoice || '-', awal: 0, tambah: 0, kurang: 0 });
    var v = sign * l.s;
    if (l.ym <= pm) o.awal += v; else if (v > 0) o.tambah += v; else o.kurang += -v;
  });
  var rows = [], t = { awal: 0, tambah: 0, kurang: 0, akhir: 0 };
  Object.keys(map).sort().forEach(function (k) {
    var o = map[k];
    o.awal = r2_(o.awal); o.tambah = r2_(o.tambah); o.kurang = r2_(o.kurang); o.akhir = r2_(o.awal + o.tambah - o.kurang);
    if (!o.awal && !o.tambah && !o.kurang) return;
    rows.push(o);
    ['awal', 'tambah', 'kurang', 'akhir'].forEach(function (f) { t[f] = r2_(t[f] + o[f]); });
  });
  return { rows: rows, total: t };
}

function asetTetap_(ctx, assets, ym) {
  var gl = movementLedger_(ctx, ['ASET_TETAP'], 1, ym);
  var akum = movementLedger_(ctx, ['AKUM_PENYUSUTAN'], -1, ym);
  var reg = [], t = { harga: 0, bulanIni: 0, akumulasi: 0, nilaiBuku: 0 };
  (assets || []).forEach(function (a) {
    if (!a.tglPerolehan) return;
    var start = ymOf_(a.tglPerolehan);
    if (start > ym) return;
    var harga = Number(a.harga) || 0, sisa = Number(a.nilaiSisa) || 0, umur = Math.max(1, Number(a.umurBulan) || 1);
    var perBln = (harga - sisa) / umur;
    var elapsed = (Number(ym.substring(0, 4)) - Number(start.substring(0, 4))) * 12 + Number(ym.substring(5, 7)) - Number(start.substring(5, 7)) + 1;
    var n = Math.min(elapsed, umur);
    var o = { id: a.id, nama: a.nama, akun: a.akun, tglPerolehan: a.tglPerolehan, harga: harga, umurBulan: umur, nilaiSisa: sisa,
      penyusutanBulanIni: elapsed <= umur ? r2_(perBln) : 0, akumulasi: r2_(perBln * n), nilaiBuku: r2_(harga - perBln * n) };
    reg.push(o);
    t.harga = r2_(t.harga + harga); t.bulanIni = r2_(t.bulanIni + o.penyusutanBulanIni);
    t.akumulasi = r2_(t.akumulasi + o.akumulasi); t.nilaiBuku = r2_(t.nilaiBuku + o.nilaiBuku);
  });
  return { bukuBesar: gl, akumulasi: akum, register: reg, totalRegister: t,
    selisihHarga: r2_(t.harga - gl.total.akhir), selisihAkumulasi: r2_(t.akumulasi - akum.total.akhir) };
}

function penjualan_(ctx, ym) {
  var fy = ym.substring(0, 4) + '-01', kodes = kodesOf_(ctx, ['PENDAPATAN']);
  var inv = {}, byP = {};
  ctx.lines.forEach(function (l) {
    if (l.ym < fy || l.ym > ym || kodes.indexOf(l.akun) < 0) return;
    var p = l.partner || '(tanpa partner)', v = -l.s;
    var bp = byP[p] || (byP[p] = { partner: p, bulan: 0, ytd: 0 });
    bp.ytd = r2_(bp.ytd + v);
    if (l.ym === ym) {
      bp.bulan = r2_(bp.bulan + v);
      var key = p + '||' + (l.invoice || l.ref);
      var o = inv[key] || (inv[key] = { partner: p, invoice: l.invoice || l.ref, tanggal: l.tanggal, nilai: 0 });
      o.nilai = r2_(o.nilai + v);
    }
  });
  var list = Object.keys(byP).map(function (k) { return byP[k]; }).sort(function (a, b) { return b.ytd - a.ytd; });
  return { invoices: Object.keys(inv).sort().map(function (k) { return inv[k]; }), byPartner: list,
    totalBulan: r2_(list.reduce(function (t, x) { return t + x.bulan; }, 0)), totalYtd: r2_(list.reduce(function (t, x) { return t + x.ytd; }, 0)) };
}

function rincianAkun_(ctx, kels, sign, ym) {
  var cols = periodCols(ctx, ym), rows = [], tot = {};
  cols.forEach(function (c) { tot[c.key] = 0; });
  kodesOf_(ctx, kels).forEach(function (k) {
    var v = {}, any = false;
    cols.forEach(function (c) { v[c.key] = r2_(sign * movAcc_(ctx, k, c.from, c.to)); if (v[c.key]) any = true; });
    if (!any) return;
    rows.push({ kode: k, nama: ctx.acc[k].nama, kelompok: ctx.acc[k].meta.label, vals: v });
    cols.forEach(function (c) { tot[c.key] = r2_(tot[c.key] + v[c.key]); });
  });
  return { cols: cols, rows: rows, total: tot };
}

/** Rekonsiliasi bank: cocokkan otomatis nominal sama dan selisih tanggal <= 3 hari. */
function rekonsiliasiBank_(ctx, statements, ym) {
  return kodesOf_(ctx, ['BANK']).map(function (k) {
    var book = ctx.lines.filter(function (l) { return l.akun === k && l.ym === ym; })
      .map(function (l) { return { tanggal: l.tanggal, ref: l.ref, deskripsi: l.deskripsi, nilai: r2_(l.s), cocok: false }; });
    var st = (statements || []).filter(function (s) { return String(s.akun) === k && ymOf_(s.tanggal) === ym; })
      .map(function (s) { return { tanggal: String(s.tanggal), keterangan: s.keterangan, nilai: r2_((Number(s.masuk) || 0) - (Number(s.keluar) || 0)), saldo: s.saldo, cocok: false }; });
    var cocok = 0;
    book.forEach(function (b) {
      for (var i = 0; i < st.length; i++) {
        if (!st[i].cocok && Math.abs(st[i].nilai - b.nilai) < 0.5 && Math.abs(daysBetween_(b.tanggal, st[i].tanggal)) <= 3) {
          st[i].cocok = true; b.cocok = true; cocok++; break;
        }
      }
    });
    var saldoBuku = r2_(balAcc_(ctx, k, ym));
    var belumBank = book.filter(function (b) { return !b.cocok; });
    var belumBuku = st.filter(function (s) { return !s.cocok; });
    var sB = r2_(belumBank.reduce(function (t, b) { return t + b.nilai; }, 0));
    var sS = r2_(belumBuku.reduce(function (t, s) { return t + s.nilai; }, 0));
    var saldoRk = null;
    for (var i = st.length - 1; i >= 0; i--) if (st[i].saldo !== '' && st[i].saldo != null && !isNaN(Number(st[i].saldo))) { saldoRk = Number(st[i].saldo); break; }
    return { kode: k, nama: ctx.acc[k].nama, saldoBuku: saldoBuku, saldoRekeningKoran: saldoRk, jumlahCocok: cocok,
      adaRekeningKoran: st.length > 0, belumDiBank: belumBank, belumDiBuku: belumBuku, totalBelumDiBank: sB, totalBelumDiBuku: sS,
      saldoBukuDisesuaikan: r2_(saldoBuku - sB + sS),
      selisih: saldoRk == null ? null : r2_(saldoBuku - sB + sS - saldoRk) };
  }).filter(function (b) { return b.saldoBuku || b.adaRekeningKoran || b.belumDiBank.length; });
}

function laporanPendukung(ctx, ym, extra) {
  extra = extra || {};
  var utangPanjang = ['UTANG_BANK_PANJANG', 'UTANG_LEASING_PANJANG', 'UTANG_PEMEGANG_SAHAM', 'UTANG_PANJANG_LAIN'];
  return {
    bukuKas: bukuBesarKel_(ctx, ['KAS', 'SETARA_KAS'], ym),
    bukuBank: bukuBesarKel_(ctx, ['BANK'], ym),
    rekonBank: rekonsiliasiBank_(ctx, extra.bankStatements, ym),
    piutang: invoiceLedger_(ctx, ['PIUTANG_USAHA'], 1, ym),
    utang: invoiceLedger_(ctx, ['UTANG_USAHA'], -1, ym),
    dibayarDimuka: movementLedger_(ctx, ['DIBAYAR_DIMUKA'], 1, ym),
    uangMuka: movementLedger_(ctx, ['UANG_MUKA'], 1, ym),
    asetTetap: asetTetap_(ctx, extra.assets, ym),
    akrual: movementLedger_(ctx, ['BIAYA_YMH'], -1, ym),
    utangBank: movementLedger_(ctx, ['UTANG_BANK_PENDEK', 'UTANG_BANK_PANJANG'], -1, ym),
    utangPanjang: movementLedger_(ctx, utangPanjang, -1, ym),
    penjualan: penjualan_(ctx, ym),
    hpp: rincianAkun_(ctx, ['HPP'], 1, ym),
    biaya: rincianAkun_(ctx, ['BEBAN_PENJUALAN', 'BEBAN_UMUM', 'BEBAN_PENYUSUTAN', 'BEBAN_BUNGA', 'BEBAN_LAIN'], 1, ym)
  };
}

/* ---------- Rekonsiliasi fiskal dan PPh Badan ---------- */
var TARIF_DEFAULT = { tarifUmum: 0.22, batasFasilitas: 4800000000, batasOmzet31E: 50000000000, tarifFinalUmkm: 0.005 };

/**
 * opt: { mode:'UMUM'|'31E'|'FINAL_UMKM', kompensasiRugi, adj:[{uraian,jenis,nilai}], tarif:{...} }
 * Dihitung atas angka YTD (belum disetahunkan).
 */
function rekonsiliasiFiskal(ctx, ym, opt) {
  opt = opt || {};
  var T = {}; for (var k in TARIF_DEFAULT) T[k] = (opt.tarif && opt.tarif[k] != null && opt.tarif[k] !== '') ? Number(opt.tarif[k]) : TARIF_DEFAULT[k];
  var fy = ym.substring(0, 4) + '-01';
  var lr = labaRugi(ctx, ym).tot;
  var komersial = lr.labaSebelumPajak.ytd;
  var pos = {}, neg = {}, ndeLines = [];
  ctx.lines.forEach(function (l) {
    if (!l.nde || l.ym < fy || l.ym > ym) return;
    var m = ctx.acc[l.akun].meta;
    if (m.bag !== 'LR' || ctx.acc[l.akun].kel === 'BEBAN_PAJAK' || ctx.acc[l.akun].kel === 'PAJAK_TANGGUHAN') return;
    var tgt = m.tipe === 'X' ? pos : neg, v = m.tipe === 'X' ? l.s : -l.s;
    var o = tgt[l.akun] || (tgt[l.akun] = { kode: l.akun, nama: ctx.acc[l.akun].nama, nilai: 0 });
    o.nilai = r2_(o.nilai + v);
    ndeLines.push({ tanggal: l.tanggal, ref: l.ref, kode: l.akun, nama: ctx.acc[l.akun].nama, deskripsi: l.deskripsi, nilai: r2_(v), jenis: m.tipe === 'X' ? 'POSITIF' : 'NEGATIF' });
  });
  var listPos = Object.keys(pos).sort().map(function (k) { return { uraian: pos[k].kode + ' ' + pos[k].nama, nilai: pos[k].nilai, sumber: 'NDE' }; });
  var listNeg = Object.keys(neg).sort().map(function (k) { return { uraian: neg[k].kode + ' ' + neg[k].nama, nilai: neg[k].nilai, sumber: 'NDE' }; });
  (opt.adj || []).forEach(function (a) {
    var item = { uraian: a.uraian, nilai: r2_(Number(a.nilai) || 0), sumber: 'Manual' };
    if (String(a.jenis).toUpperCase() === 'NEGATIF') listNeg.push(item); else listPos.push(item);
  });
  var tPos = r2_(listPos.reduce(function (t, x) { return t + x.nilai; }, 0));
  var tNeg = r2_(listNeg.reduce(function (t, x) { return t + x.nilai; }, 0));
  var neto = r2_(komersial + tPos - tNeg);
  var komp = Math.max(0, Number(opt.kompensasiRugi) || 0);
  var pkp = Math.max(0, Math.floor((neto - komp) / 1000) * 1000);
  var omzet = lr.pendapatan.ytd;
  var mode = opt.mode || '31E';
  var pph = 0, rincian = [];
  if (mode === 'FINAL_UMKM') {
    pph = Math.floor(omzet * T.tarifFinalUmkm);
    rincian.push({ uraian: 'PPh final ' + (T.tarifFinalUmkm * 100) + '% x peredaran bruto', dasar: omzet, tarif: T.tarifFinalUmkm, pajak: pph });
  } else if (mode === '31E' && omzet <= T.batasOmzet31E && omzet > 0) {
    var pkpFas = omzet <= T.batasFasilitas ? pkp : Math.floor(T.batasFasilitas / omzet * pkp);
    var pkpNon = pkp - pkpFas;
    var p1 = Math.floor(pkpFas * T.tarifUmum * 0.5), p2 = Math.floor(pkpNon * T.tarifUmum);
    rincian.push({ uraian: 'PKP yang memperoleh fasilitas Pasal 31E (50% x tarif)', dasar: pkpFas, tarif: T.tarifUmum * 0.5, pajak: p1 });
    rincian.push({ uraian: 'PKP yang tidak memperoleh fasilitas', dasar: pkpNon, tarif: T.tarifUmum, pajak: p2 });
    pph = p1 + p2;
  } else {
    pph = Math.floor(pkp * T.tarifUmum);
    rincian.push({ uraian: 'Tarif umum Pasal 17', dasar: pkp, tarif: T.tarifUmum, pajak: pph });
  }
  var kredit = kodesOf_(ctx, ['PAJAK_DIBAYAR_DIMUKA']).map(function (k) { return { kode: k, nama: ctx.acc[k].nama, nilai: r2_(balAcc_(ctx, k, ym)) }; })
    .filter(function (x) { return x.nilai; });
  var tKredit = r2_(kredit.reduce(function (t, x) { return t + x.nilai; }, 0));
  return {
    periode: ym, mode: mode, tarif: T, labaKomersial: komersial, peredaranBruto: omzet,
    koreksiPositif: listPos, totalKoreksiPositif: tPos, koreksiNegatif: listNeg, totalKoreksiNegatif: tNeg,
    penghasilanNetoFiskal: neto, kompensasiRugi: komp, pkp: pkp, rincianPph: rincian, pphTerutang: pph,
    kreditPajak: kredit, totalKreditPajak: tKredit, kurangLebihBayar: r2_(pph - tKredit),
    bebanPajakDibukukan: lr.bebanPajak.ytd, ndeLines: ndeLines
  };
}

/* ---------- Mapping Coretax ---------- */
/**
 * items   : [{kode,nama,jenis:'NERACA'|'LABARUGI',normal:'D'|'K',urutan,bagian}]
 * kelMap  : {KELOMPOK: kodeItem} — mapping default bila akun belum dipetakan.
 */
function laporanCoretax(ctx, ym, items, kelMap) {
  var fy = ym.substring(0, 4) + '-01', byItem = {}, unmapped = [];
  items.forEach(function (it) { byItem[String(it.kode)] = { item: it, nilai: 0, akun: [] }; });
  var labaBerjalan = 0, labaLalu = 0;
  ctx.kodes.forEach(function (k) {
    var a = ctx.acc[k], isPL = a.meta.bag === 'LR';
    var s = isPL ? movAcc_(ctx, k, fy, ym) : balAcc_(ctx, k, ym);
    if (isPL) { labaBerjalan -= s; labaLalu -= movAcc_(ctx, k, null, ymAdd_(fy, -1)); }
    if (Math.abs(s) < 0.005) return;
    var code = a.coretax || (kelMap && kelMap[a.kel]) || '';
    var tgt = byItem[String(code)];
    if (!tgt || (tgt.item.jenis === 'NERACA') === isPL) { unmapped.push({ kode: k, nama: a.nama, nilai: r2_(s) }); return; }
    var v = tgt.item.normal === 'D' ? s : -s;
    tgt.nilai = r2_(tgt.nilai + v);
    tgt.akun.push({ kode: k, nama: a.nama, nilai: r2_(v) });
  });
  // laba berjalan dan laba tahun lalu yang belum ditutup masuk ke pos saldo laba Coretax
  var re = byItem[String((kelMap && kelMap.__LABA_BERJALAN) || '')];
  if (re) { re.nilai = r2_(re.nilai + labaBerjalan); re.akun.push({ kode: '', nama: 'Laba (rugi) tahun berjalan', nilai: r2_(labaBerjalan) }); }
  var re2 = byItem[String((kelMap && kelMap.SALDO_LABA) || '')];
  if (re2 && Math.abs(labaLalu) > 0.005) { re2.nilai = r2_(re2.nilai + labaLalu); re2.akun.push({ kode: '', nama: 'Akumulasi laba tahun-tahun sebelumnya', nilai: r2_(labaLalu) }); }
  var sorted = items.slice().sort(function (a, b) { return (Number(a.urutan) || 0) - (Number(b.urutan) || 0); });
  var mk = function (jenis) { return sorted.filter(function (i) { return i.jenis === jenis; }).map(function (i) {
    var x = byItem[String(i.kode)]; return { kode: i.kode, nama: i.nama, bagian: i.bagian || '', normal: i.normal, nilai: x.nilai, akun: x.akun }; }); };
  return { periode: ym, neraca: mk('NERACA'), labaRugi: mk('LABARUGI'), belumDipetakan: unmapped };
}

/* ---------- KPI, rasio, tren ---------- */
function rasioKeuangan(ctx, ym) {
  var lr = labaRugi(ctx, ym).tot, nr = neraca(ctx, ym).tot;
  var m = Number(ym.substring(5, 7)), ann = 12 / m, hari = Math.round(365 * m / 12);
  function calc(col, ytdKey, bulan) {
    var g = function (k) { return (nr[k] || {})[col] || 0; };
    var p = function (pos) { return (nr['pos:' + pos] || {})[col] || 0; };
    var kas = p('Kas dan setara kas'), piu = p('Piutang usaha') + p('Penyisihan penurunan nilai piutang'), pers = p('Persediaan');
    var AL = g('AL'), LJP = g('LJP'), aset = g('aset'), liab = g('liabilitas'), ek = g('ekuitas');
    var rev = lr.pendapatan[ytdKey], hpp = lr.hpp[ytdKey];
    var a = 12 / bulan, h = Math.round(365 * bulan / 12);
    var div = function (x, y) { return y ? x / y : null; };
    return {
      rasioLancar: div(AL, LJP), rasioCepat: div(AL - pers, LJP), rasioKas: div(kas, LJP), modalKerja: r2_(AL - LJP),
      der: div(liab, ek), dar: div(liab, aset), cakupanBunga: div(lr.labaUsaha[ytdKey], lr.bebanBunga[ytdKey]),
      marginBruto: div(lr.labaBruto[ytdKey], rev), marginOperasi: div(lr.labaUsaha[ytdKey], rev), marginBersih: div(lr.labaBersih[ytdKey], rev),
      roa: div(lr.labaBersih[ytdKey] * a, aset), roe: div(lr.labaBersih[ytdKey] * a, ek),
      hariPiutang: div(piu * h, rev), hariUtang: div(p('Utang usaha') * h, hpp), hariPersediaan: div(pers * h, hpp),
      perputaranAset: div(rev * a, aset)
    };
  }
  var pm = ymAdd_(ym, -1), pmM = Number(pm.substring(5, 7));
  var cur = calc('cur', 'ytd', m), prev = calc('prev', 'ytdPrev', pmM);
  var def = [
    ['Likuiditas', 'rasioLancar', 'Rasio lancar', 'Aset lancar / Liabilitas jangka pendek', 'x'],
    ['Likuiditas', 'rasioCepat', 'Rasio cepat', '(Aset lancar - Persediaan) / Liabilitas jangka pendek', 'x'],
    ['Likuiditas', 'rasioKas', 'Rasio kas', 'Kas dan setara kas / Liabilitas jangka pendek', 'x'],
    ['Likuiditas', 'modalKerja', 'Modal kerja bersih', 'Aset lancar - Liabilitas jangka pendek', 'Rp'],
    ['Solvabilitas', 'der', 'Utang terhadap ekuitas (DER)', 'Jumlah liabilitas / Jumlah ekuitas', 'x'],
    ['Solvabilitas', 'dar', 'Utang terhadap aset (DAR)', 'Jumlah liabilitas / Jumlah aset', '%'],
    ['Solvabilitas', 'cakupanBunga', 'Cakupan bunga', 'Laba usaha YTD / Beban bunga YTD', 'x'],
    ['Profitabilitas', 'marginBruto', 'Margin laba bruto', 'Laba bruto YTD / Pendapatan YTD', '%'],
    ['Profitabilitas', 'marginOperasi', 'Margin laba usaha', 'Laba usaha YTD / Pendapatan YTD', '%'],
    ['Profitabilitas', 'marginBersih', 'Margin laba bersih', 'Laba bersih YTD / Pendapatan YTD', '%'],
    ['Profitabilitas', 'roa', 'ROA (disetahunkan)', 'Laba bersih YTD x 12/bulan / Jumlah aset', '%'],
    ['Profitabilitas', 'roe', 'ROE (disetahunkan)', 'Laba bersih YTD x 12/bulan / Jumlah ekuitas', '%'],
    ['Aktivitas', 'hariPiutang', 'Hari penagihan piutang', 'Piutang usaha x hari YTD / Pendapatan YTD', 'hari'],
    ['Aktivitas', 'hariUtang', 'Hari pembayaran utang', 'Utang usaha x hari YTD / Beban pokok YTD', 'hari'],
    ['Aktivitas', 'hariPersediaan', 'Hari persediaan', 'Persediaan x hari YTD / Beban pokok YTD', 'hari'],
    ['Aktivitas', 'perputaranAset', 'Perputaran aset (disetahunkan)', 'Pendapatan YTD x 12/bulan / Jumlah aset', 'x']
  ];
  return def.map(function (d) { return { kelompok: d[0], key: d[1], nama: d[2], rumus: d[3], satuan: d[4], cur: cur[d[1]], prev: prev[d[1]] }; });
}

function trenBulanan(ctx, ym, n) {
  var out = [];
  for (var i = (n || 12) - 1; i >= 0; i--) {
    var m = ymAdd_(ym, -i);
    var rev = -movKel_(ctx, ['PENDAPATAN'], m, m), hpp = movKel_(ctx, ['HPP'], m, m);
    out.push({ ym: m, pendapatan: r2_(rev), labaBruto: r2_(rev - hpp), labaBersih: r2_(labaBersihRange_(ctx, m, m)),
      beban: r2_(movKel_(ctx, ['BEBAN_PENJUALAN', 'BEBAN_UMUM', 'BEBAN_PENYUSUTAN'], m, m)), kas: r2_(movKel_(ctx, CASH_KELS_, null, m)) });
  }
  return out;
}

/** Neraca saldo per akun untuk periode ym. */
function neracaSaldo(ctx, ym) {
  var pm = ymAdd_(ym, -1), fy = ym.substring(0, 4) + '-01', t = { awal: 0, debit: 0, kredit: 0, akhir: 0 };
  var rows = ctx.kodes.map(function (k) {
    var isPL = ctx.acc[k].meta.bag === 'LR';
    var awal = isPL ? (pm >= fy ? movAcc_(ctx, k, fy, pm) : 0) : balAcc_(ctx, k, pm), d = 0, c = 0;
    ctx.lines.forEach(function (l) { if (l.akun === k && l.ym === ym) { if (l.s >= 0) d += l.s; else c -= l.s; } });
    return { kode: k, nama: ctx.acc[k].nama, kelompok: ctx.acc[k].meta.label, awal: r2_(awal), debit: r2_(d), kredit: r2_(c), akhir: r2_(awal + d - c) };
  }).filter(function (r) { return r.awal || r.debit || r.kredit; });
  rows.forEach(function (r) { t.debit = r2_(t.debit + r.debit); t.kredit = r2_(t.kredit + r.kredit); });
  return { rows: rows, total: t };
}

/** Paket laporan utama + ringkasan. */
function laporanUtama(ctx, ym) {
  var lr = labaRugi(ctx, ym), nr = neraca(ctx, ym);
  var akl = arusKasLangsung(ctx, ym), aktl = arusKasTidakLangsung(ctx, ym);
  return {
    periode: ym, neraca: nr, labaRugi: lr, ekuitas: perubahanEkuitas(ctx, ym), arusKasLangsung: akl, arusKasTidakLangsung: aktl,
    neracaSaldo: neracaSaldo(ctx, ym), rasio: rasioKeuangan(ctx, ym), tren: trenBulanan(ctx, ym, 12),
    cek: { neracaSeimbang: Math.abs(nr.selisih.cur) < 1, selisihNeraca: nr.selisih.cur,
      selisihArusKasLangsung: akl.selisih.cur, selisihArusKasTidakLangsung: aktl.selisih.cur, akunTidakDikenal: ctx.unknown }
  };
}

if (typeof module !== 'undefined') {
  module.exports = { KELOMPOK: KELOMPOK, guessKelompok: guessKelompok, buildContext: buildContext, laporanUtama: laporanUtama,
    laporanPendukung: laporanPendukung, rekonsiliasiFiskal: rekonsiliasiFiskal, laporanCoretax: laporanCoretax,
    labaRugi: labaRugi, neraca: neraca, rasioKeuangan: rasioKeuangan, ymAdd_: ymAdd_ };
}
