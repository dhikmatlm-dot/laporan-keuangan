/**
 * test-backend.js — uji end-to-end backend dengan layanan Google tiruan.
 * Jalankan: node tools/test-backend.js
 */
const { createBackend } = require('./mock-gas');
const { seed } = require('./seed');

let pass = 0, failN = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); } else { failN++; console.log('  GAGAL ' + name + (extra ? ' -> ' + extra : '')); }
}
const near = (a, b) => Math.abs(a - b) < 1;

const be = createBackend({ quiet: true });
const { admin, a, b, post } = seed(be);
console.log('Data contoh: ' + post.jurnal + ' jurnal, ' + post.baris + ' baris\n');

console.log('Laporan utama');
['2025-01', '2025-06', '2025-12', '2026-01', '2026-03', '2026-09'].forEach((ym) => {
  const u = be.must('report.get', admin, { periode: ym, bagian: ['utama'] }, a.id).utama;
  ok(u.cek.neracaSeimbang, ym + ' neraca seimbang', 'selisih ' + u.cek.selisihNeraca);
  ok(Object.values(u.arusKasLangsung.selisih).every((v) => near(v, 0)), ym + ' arus kas langsung = perubahan kas', JSON.stringify(u.arusKasLangsung.selisih));
  ok(Object.values(u.arusKasTidakLangsung.selisih).every((v) => near(v, 0)), ym + ' arus kas tidak langsung = perubahan kas', JSON.stringify(u.arusKasTidakLangsung.selisih));
  const ek = u.ekuitas.tables[0].rows.slice(-1)[0].vals.total;
  ok(near(ek, u.neraca.tot.ekuitas.cur), ym + ' perubahan ekuitas = ekuitas neraca', ek + ' vs ' + u.neraca.tot.ekuitas.cur);
  ok(near(u.neracaSaldo.total.debit, u.neracaSaldo.total.kredit), ym + ' neraca saldo debit = kredit');
});
const sep = be.must('report.get', admin, { periode: '2026-09', bagian: ['utama', 'pendukung', 'fiskal', 'coretax'] }, a.id);
const lr = sep.utama.labaRugi;
ok(lr.cols.some((c) => c.key === 'ly'), 'pembanding tahun lalu tampil bila datanya ada');
const jan25 = be.must('report.get', admin, { periode: '2025-03', bagian: ['utama'] }, a.id).utama;
ok(!jan25.labaRugi.cols.some((c) => c.key === 'ly'), 'pembanding tahun lalu disembunyikan bila tidak ada data');
ok(lr.tot.pendapatan.cur > 0 && lr.tot.labaBersih.ytd !== 0, 'laba rugi terisi', JSON.stringify(lr.tot.labaBersih));

console.log('\nLaporan pendukung');
const s = sep.pendukung;
ok(near(s.piutang.selisih, 0), 'daftar piutang = buku besar', String(s.piutang.selisih));
ok(near(s.utang.selisih, 0), 'daftar utang = buku besar', String(s.utang.selisih));
ok(s.piutang.buckets.slice(1).some((v) => v > 0), 'aging piutang punya saldo lewat jatuh tempo', JSON.stringify(s.piutang.buckets));
ok(s.bukuBank.length > 0 && near(s.bukuBank[0].saldoAkhir, sep.utama.neraca.rows.find((r) => r.label === 'Kas dan setara kas').detail.find((d) => d.kode === '1005').vals.cur), 'buku bank = saldo neraca');
ok(near(s.dibayarDimuka.total.akhir, 30000000), 'sewa dibayar dimuka sisa 3 bulan', String(s.dibayarDimuka.total.akhir));
ok(near(s.asetTetap.selisihHarga, 0), 'register aset = buku besar', String(s.asetTetap.selisihHarga));
ok(near(s.penjualan.totalYtd, lr.tot.pendapatan.ytd), 'daftar penjualan YTD = laba rugi');
ok(near(s.biaya.total.ytd + s.hpp.total.ytd, lr.tot.hpp.ytd + lr.tot.bebanPenjualan.ytd + lr.tot.bebanUmum.ytd + lr.tot.bebanBunga.ytd + lr.tot.bebanLain.ytd), 'daftar HPP + biaya = laba rugi');

console.log('\nFiskal dan Coretax');
const f = sep.fiskal;
ok(f.totalKoreksiPositif > 0, 'koreksi positif dari NDE', String(f.totalKoreksiPositif));
ok(f.totalKoreksiNegatif > 0, 'koreksi negatif (bunga bank, NDE bawaan akun)', String(f.totalKoreksiNegatif));
ok(near(f.penghasilanNetoFiskal, f.labaKomersial + f.totalKoreksiPositif - f.totalKoreksiNegatif), 'neto fiskal = komersial + positif - negatif');
ok(f.pkp % 1000 === 0 && f.pphTerutang > 0, 'PKP dibulatkan ribuan dan PPh terutang dihitung', f.pkp + ' / ' + f.pphTerutang);
ok(near(f.totalKreditPajak, 2000000 * 21), 'kredit pajak = saldo PPh 25 dibayar', String(f.totalKreditPajak));
const ct = sep.coretax;
const nA = ct.neraca.filter((i) => i.normal === 'D').reduce((t, i) => t + i.nilai, 0), nL = ct.neraca.filter((i) => i.normal === 'K').reduce((t, i) => t + i.nilai, 0);
ok(near(nA, nL) && ct.belumDipetakan.length === 0, 'neraca Coretax seimbang dan semua akun terpetakan', nA + ' vs ' + nL + ' / ' + ct.belumDipetakan.length);
const lC = ct.labaRugi.reduce((t, i) => t + (i.normal === 'K' ? i.nilai : -i.nilai), 0);
ok(near(lC, lr.tot.labaBersih.ytd), 'laba Coretax = laba bersih komersial');

console.log('\nValidasi dan duplikat');
let v = be.must('journal.validate', admin, { rows: [
  { tanggal: '2026-09-10', ref: 'X-1', akun: '7001', dc: 'DR', nilai: 1000 }, { tanggal: '2026-09-10', ref: 'X-1', akun: '1005', dc: 'CR', nilai: 900 }] }, a.id);
ok(v.errors.some((e) => /tidak seimbang/.test(e.pesan)), 'jurnal tidak seimbang ditolak');
v = be.must('journal.validate', admin, { rows: [{ tanggal: '31/09/2026', ref: 'X-2', akun: '9999', dc: 'XX', nilai: 'abc' }] }, a.id);
ok(v.errors.length >= 4, 'tanggal, akun, DR/CR, dan nilai salah terdeteksi', String(v.errors.length));
const dupRows = [
  { tanggal: '2026-09-25', ref: 'GJ-2609', akun: '7001', lawan: '1005', dc: 'DR', nilai: 5000000, deskripsi: 'ref sama' },
  { tanggal: '2026-09-25', ref: 'GJ-2609', akun: '1005', lawan: '7001', dc: 'CR', nilai: 5000000, deskripsi: 'ref sama' },
  { tanggal: '2026-09-25', ref: 'BARU-1', akun: '7005', lawan: '1005', dc: 'DR', nilai: 3200000, deskripsi: 'isi sama' },
  { tanggal: '2026-09-25', ref: 'BARU-1', akun: '1005', lawan: '7005', dc: 'CR', nilai: 3200000, deskripsi: 'isi sama' }];
v = be.must('journal.validate', admin, { rows: dupRows }, a.id);
ok(v.duplicates.length === 2 && v.duplicates[0].jenis === 'REF' && v.duplicates[1].jenis === 'TRANSAKSI', 'No Ref sama dan transaksi sama terdeteksi', JSON.stringify(v.duplicates.map((d) => d.jenis)));
ok(!be.call('journal.post', admin, { rows: dupRows }, a.id).ok, 'posting ditolak sebelum ada keputusan');
const before = be.must('journal.list', admin, { periode: '2026-09' }, a.id).total;
const pd = be.must('journal.post', admin, { rows: dupRows, keputusan: { 'GJ-2609': 'LANJUT', 'BARU-1': 'LEWATI' } }, a.id);
const after = be.must('journal.list', admin, { periode: '2026-09' }, a.id);
ok(after.total === before + 2 && after.rows.some((r) => r.ref === 'GJ-2609-R2') && pd.dilewati[0] === 'BARU-1', 'LANJUT menambah dengan No Ref baru, LEWATI tidak diposting');
be.must('uploads.rollback', admin, { uploadId: pd.uploadId }, a.id);
ok(be.must('journal.list', admin, { periode: '2026-09' }, a.id).total === before, 'rollback unggahan');

console.log('\nNDE, periode, dokumen');
const line = after.rows.find((r) => r.akun === '7027');
be.must('journal.setNde', admin, { id: line.id, nde: true }, a.id);
const f2 = be.must('report.get', admin, { periode: '2026-09', bagian: ['fiskal'] }, a.id).fiskal;
ok(near(f2.totalKoreksiPositif - f.totalKoreksiPositif, 900000), 'klik NDE menambah koreksi positif', String(f2.totalKoreksiPositif - f.totalKoreksiPositif));
be.must('period.set', admin, { periode: '2026-08', status: 'LOCKED' }, a.id);
v = be.must('journal.validate', admin, { rows: [{ tanggal: '2026-08-10', ref: 'L-1', akun: '7001', dc: 'DR', nilai: 1 }, { tanggal: '2026-08-10', ref: 'L-1', akun: '1005', dc: 'CR', nilai: 1 }] }, a.id);
ok(v.errors.some((e) => /dikunci/.test(e.pesan)), 'periode terkunci menolak jurnal');
const doc = be.must('docs.upload', admin, { ref: 'GJ-2609', nama: 'slip.pdf', mime: 'application/pdf', b64: Buffer.from('bukti').toString('base64') }, a.id);
ok(doc.url && be.must('docs.list', admin, { ref: 'GJ-2609' }, a.id).length === 1, 'unggah dokumen bukti tersimpan di folder klien');

console.log('\nHak akses');
const ka = 'klien.a@demo.test';
ok(be.must('session', ka, {}).clients.length === 1, 'klien hanya melihat kliennya sendiri');
ok(!be.call('report.get', ka, { periode: '2026-09' }, b.id).ok, 'klien A ditolak membuka klien B');
ok(!be.call('clients.list', ka, {}).ok, 'klien ditolak pada aksi Super Admin');
ok(!be.call('session', 'asing@demo.test', {}).ok, 'email tidak terdaftar ditolak');
ok(be.must('report.get', admin, { periode: '2026-09' }, b.id).utama.cek.neracaSeimbang, 'Super Admin dapat membuka semua klien');
be.must('users.save', admin, { email: 'klien.a2@demo.test', role: 'CLIENT', clientId: a.id });
ok(!be.call('users.save', admin, { email: 'klien.a3@demo.test', role: 'CLIENT', clientId: a.id }).ok, 'pengguna ke-3 ditolak tanpa add-on');
be.must('clients.save', admin, Object.assign({}, a, { kuotaUser: 3 }));
ok(be.call('users.save', admin, { email: 'klien.a3@demo.test', role: 'CLIENT', clientId: a.id }).ok, 'pengguna ke-3 diterima setelah kuota dinaikkan');
const nMail = be.mails.length;
be.must('journal.post', ka, { sumber: 'MANUAL', rows: [{ tanggal: '2026-09-29', ref: 'JM-K1', akun: '7027', lawan: '1001', dc: 'DR', nilai: 250000, deskripsi: 'ATK' }, { tanggal: '2026-09-29', ref: 'JM-K1', akun: '1001', lawan: '7027', dc: 'CR', nilai: 250000, deskripsi: 'ATK' }] });
ok(be.mails.length === nMail + 1 && /admin@demo.test/.test(be.mails[nMail].to), 'jurnal dari klien memicu email ke Super Admin');
ok(be.must('audit.list', admin, { clientId: a.id }).some((r) => r.action === 'journal.post' && r.email === ka), 'jurnal klien tercatat di log audit');
ok(be.must('audit.list', admin, {}).some((r) => r.action === 'AKSES_DITOLAK'), 'penolakan akses tercatat di log audit');

console.log('\nCOA dan AI');
ok(be.must('coa.list', admin, {}, a.id).length === 156, 'COA bawaan 156 akun');
be.must('coa.save', admin, { kode: '7043', nama: 'Biaya Pelatihan', normal: 'DR' }, a.id);
ok(be.must('coa.list', admin, {}, a.id).find((x) => x.kode === '7043').kelompok === 'BEBAN_UMUM', 'tambah akun dan kelompok terisi otomatis');
ok(!be.call('coa.delete', admin, { kode: '7001' }, a.id).ok, 'akun yang dipakai jurnal tidak dapat dihapus');
ok(be.must('coa.delete', admin, { kode: '7043' }, a.id).deleted === 1, 'hapus akun yang belum dipakai');
const ai = be.must('ai.generate', admin, { periode: '2026-09', section: 'ringkasan' }, a.id);
ok(ai.text.length > 20 && be.must('ai.list', admin, { periode: '2026-09' }, a.id).narasi.ringkasan, 'narasi AI tersimpan');

console.log('\n' + pass + ' lulus, ' + failN + ' gagal');
process.exit(failN ? 1 : 0);
