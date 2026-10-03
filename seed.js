/**
 * seed.js — data contoh (PT Contoh Sejahtera): saldo awal + jurnal Jan 2025 s.d. Sep 2026,
 * dalam format sheet "Jurnal Input" (satu sisi per baris, dengan Lawan Akun).
 */
function buildSampleRows() {
  const rows = [];
  let no = 0;
  const pad = (n) => (n < 10 ? '0' : '') + n;
  // satu jurnal dua baris: debit akun dr, kredit akun cr
  function j(tanggal, ref, dr, cr, nilai, deskripsi, o) {
    o = o || {};
    const base = { tanggal, ref, deskripsi, partner: o.partner || '', invoice: o.invoice || '', top: o.top || '', valueOri: nilai, mataUang: 'IDR', kurs: 1, nilai };
    rows.push(Object.assign({ no: ++no, akun: dr, lawan: cr, dc: 'DR', nde: o.nde || '' }, base));
    rows.push(Object.assign({ no: ++no, akun: cr, lawan: dr, dc: 'CR', nde: o.ndeCr || '' }, base));
  }
  // saldo awal
  const sa = '2024-12-31';
  j(sa, 'SA-001', '1005', '3001', 400000000, 'Saldo awal bank');
  j(sa, 'SA-002', '1001', '3001', 10000000, 'Saldo awal kas kecil');
  j(sa, 'SA-003', '1605', '3001', 90000000, 'Saldo awal peralatan');
  j(sa, 'SA-004', '1605', '2203', 150000000, 'Saldo awal peralatan (dibiayai bank)');

  const customers = ['PT Maju Bersama', 'CV Sinar Abadi', 'PT Nusantara Teknik'];
  const vendors = ['PT Sumber Material', 'CV Mitra Logistik'];
  let k = 0;
  for (let y = 2025; y <= 2026; y++) {
    for (let m = 1; m <= 12; m++) {
      if (y === 2026 && m > 9) break;
      k++;
      const ym = y + '-' + pad(m), d = (n) => ym + '-' + pad(n), tag = String(y).slice(2) + pad(m);
      const g = 1 + k * 0.015 + (m % 3 === 0 ? 0.08 : 0);
      const prevTag = m === 1 ? String(y - 1).slice(2) + '12' : String(y).slice(2) + pad(m - 1);
      // penjualan kredit, TOP 30 hari
      customers.forEach((c, i) => {
        const v = Math.round((70 + i * 25) * g) * 1000000;
        j(d(5 + i * 6), 'INV-' + tag + '-' + (i + 1), '1101', '4001', v, 'Penjualan jasa ' + ym, { partner: c, invoice: 'INV-' + tag + '-' + (i + 1), top: 30 });
      });
      // pelunasan piutang bulan lalu: pelanggan ke-3 selalu terlambat (baru lunas dua bulan kemudian)
      if (k > 1) {
        [0, 1].forEach((i) => {
          const gp = 1 + (k - 1) * 0.015 + ((m === 1 ? 12 : m - 1) % 3 === 0 ? 0.08 : 0);
          const v = Math.round((70 + i * 25) * gp) * 1000000;
          j(d(10 + i * 5), 'BM-' + tag + '-' + (i + 1), '1005', '1101', v, 'Pelunasan ' + customers[i], { partner: customers[i], invoice: 'INV-' + prevTag + '-' + (i + 1) });
        });
      }
      if (k > 4) {
        const k4 = k - 4, m4 = ((m - 5 + 12) % 12) + 1, y4 = m <= 4 ? y - 1 : y;
        const g4 = 1 + k4 * 0.015 + (m4 % 3 === 0 ? 0.08 : 0);
        j(d(20), 'BM-' + tag + '-3', '1005', '1101', Math.round(120 * g4) * 1000000, 'Pelunasan ' + customers[2], { partner: customers[2], invoice: 'INV-' + String(y4).slice(2) + pad(m4) + '-3' });
      }
      // pembelian kredit dan pembayaran bulan berikutnya
      vendors.forEach((vn, i) => {
        const v = Math.round((55 + i * 30) * g) * 1000000;
        j(d(8 + i * 4), 'PB-' + tag + '-' + (i + 1), '5001', '2001', v, 'Pembelian material ' + ym, { partner: vn, invoice: 'TAG-' + tag + '-' + (i + 1), top: 30 });
        if (k > 1) {
          const gp = 1 + (k - 1) * 0.015 + ((m === 1 ? 12 : m - 1) % 3 === 0 ? 0.08 : 0);
          j(d(12 + i * 4), 'BK-' + tag + '-' + (i + 1), '2001', '1005', Math.round((55 + i * 30) * gp) * 1000000, 'Pembayaran ' + vn, { partner: vn, invoice: 'TAG-' + prevTag + '-' + (i + 1) });
        }
      });
      j(d(25), 'GJ-' + tag, '7001', '1005', Math.round(38 * g) * 1000000, 'Gaji karyawan ' + ym);
      j(d(25), 'BPJS-' + tag, '7005', '1005', 3200000, 'BPJS ' + ym);
      if (m === 1) j(d(2), 'SW-' + tag, '1401', '1005', 120000000, 'Sewa kantor 12 bulan', { partner: 'PT Graha Properti', invoice: 'SEWA-' + y });
      j(d(28), 'AMS-' + tag, '7010', '1401', 10000000, 'Amortisasi sewa kantor ' + ym, { partner: 'PT Graha Properti', invoice: 'SEWA-' + y });
      j(d(28), 'DEP-' + tag, '7038', '1610', 5000000, 'Penyusutan peralatan ' + ym);
      j(d(3), 'TK-' + tag, '1001', '1005', 5000000, 'Pengisian kas kecil');
      j(d(15), 'KK-' + tag + '-1', '7025', '1001', 2600000, 'Listrik, air, internet');
      j(d(18), 'KK-' + tag + '-2', '7027', '1001', 900000, 'ATK');
      j(d(20), 'ENT-' + tag, '7032', '1005', 3500000 + (m % 4) * 500000, 'Jamuan relasi tanpa daftar nominatif', { nde: 'Y' });
      if (m % 3 === 0) j(d(22), 'DON-' + tag, '7034', '1005', 2000000, 'Sumbangan kegiatan warga');
      j(d(28), 'BG-' + tag, '1005', '8001', 450000 + k * 10000, 'Bunga jasa giro');
      j(d(28), 'ADM-' + tag, '8101', '1005', 150000, 'Biaya administrasi bank');
      j(d(27), 'BNG-' + tag, '8103', '1005', 1500000, 'Bunga pinjaman bank', { partner: 'Bank Mandiri' });
      j(d(27), 'ANG-' + tag, '2203', '1005', 3000000, 'Angsuran pokok pinjaman', { partner: 'Bank Mandiri' });
      j(d(26), 'KSL-' + tag, '7030', '2060', 4000000, 'Jasa konsultan ' + ym + ' (akrual)', { partner: 'KAP Rekan' });
      if (k > 1) j(d(9), 'BKS-' + tag, '2060', '1005', 4000000, 'Pembayaran jasa konsultan', { partner: 'KAP Rekan' });
      j(d(14), 'P25-' + tag, '1503', '1005', 2000000, 'Angsuran PPh Pasal 25 ' + ym);
      if (y === 2026 && m === 3) j(d(16), 'AT-2603', '1603', '1005', 180000000, 'Pembelian kendaraan operasional', { partner: 'PT Auto Prima' });
      if (y === 2026 && m === 4) j(d(21), 'DIV-2604', '3100', '1005', 50000000, 'Pembayaran dividen 2025');
      if (y === 2026 && m === 6) j(d(11), 'UM-2606', '1301', '1005', 25000000, 'Uang muka pembelian mesin', { partner: 'PT Mesin Jaya' });
    }
  }
  return rows;
}

const sampleAssets = [
  { nama: 'Peralatan workshop (saldo awal)', akun: '1605', tglPerolehan: '2025-01-01', harga: 240000000, umurBulan: 48, nilaiSisa: 0 },
  { nama: 'Kendaraan operasional', akun: '1603', tglPerolehan: '2026-03-16', harga: 180000000, umurBulan: 96, nilaiSisa: 0 }
];

/** Isi backend tiruan dengan dua klien, pengguna, jurnal, dan aset. */
function seed(be) {
  const admin = 'admin@demo.test';
  be.sandbox.setup();
  const a = be.must('clients.save', admin, { nama: 'PT Contoh Sejahtera', npwp: '01.234.567.8-901.000', alamat: 'Jl. Contoh No. 1', kota: 'Bekasi', bidangUsaha: 'Jasa konstruksi dan pengadaan', pimpinan: 'Budi Santoso', jabatan: 'Direktur Utama' });
  const b = be.must('clients.save', admin, { nama: 'CV Dua Saudara', kota: 'Sukabumi', bidangUsaha: 'Perdagangan', pimpinan: 'Siti Aminah', jabatan: 'Direktur' });
  be.must('users.save', admin, { email: 'klien.a@demo.test', nama: 'Keuangan PT Contoh', role: 'CLIENT', clientId: a.id });
  be.must('users.save', admin, { email: 'klien.b@demo.test', nama: 'Keuangan CV Dua Saudara', role: 'CLIENT', clientId: b.id });
  const rows = buildSampleRows();
  const post = be.must('journal.post', admin, { rows, fileName: 'jurnal-contoh.xlsx', sumber: 'UPLOAD' }, a.id);
  sampleAssets.forEach((x) => be.must('assets.save', admin, x, a.id));
  be.must('journal.post', admin, { sumber: 'UPLOAD', rows: [
    { tanggal: '2026-09-01', ref: 'SA-B1', akun: '1005', lawan: '3001', dc: 'DR', nilai: 75000000, deskripsi: 'Setoran modal' },
    { tanggal: '2026-09-01', ref: 'SA-B1', akun: '3001', lawan: '1005', dc: 'CR', nilai: 75000000, deskripsi: 'Setoran modal' }] }, b.id);
  return { admin, a, b, rows, post };
}

module.exports = { buildSampleRows, seed, sampleAssets };
