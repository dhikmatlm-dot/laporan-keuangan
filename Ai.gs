/**
 * Ai.gs — narasi analisa dengan Claude (Anthropic API).
 * Semua angka dihitung oleh Engine.gs; Claude hanya menulis penjelasan atas angka itu.
 * Nama klien dan NPWP tidak dikirim.
 */

var AI_SECTIONS = {
  ringkasan: 'Tulis RINGKASAN EKSEKUTIF: 2 paragraf padat tentang kondisi keuangan periode ini, lalu 5 temuan utama sebagai butir yang diawali "- ". Sebut angka kunci.',
  kinerja: 'Tulis ANALISA KINERJA UTAMA: bahas pendapatan, laba bruto, laba usaha, laba bersih, dan arus kas operasi; bandingkan bulan ini dengan bulan lalu dan YTD bulan ini dengan YTD bulan lalu. 3-4 paragraf.',
  pendapatanBiaya: 'Tulis ANALISA PENDAPATAN DAN BIAYA: konsentrasi pelanggan, tren pendapatan, struktur beban pokok dan beban usaha, pos biaya yang naik atau turun paling besar beserta kemungkinan penyebab yang perlu dikonfirmasi manajemen. 3-4 paragraf.',
  posisi: 'Tulis ANALISA ASET, UTANG, DAN EKUITAS: struktur aset, kualitas dan umur piutang, likuiditas, struktur dan jatuh tempo utang, perubahan ekuitas. 3-4 paragraf.',
  rasio: 'Tulis ANALISA RASIO KEUANGAN: untuk setiap kelompok rasio (likuiditas, solvabilitas, profitabilitas, aktivitas) jelaskan arti angka, arah perubahan dibanding bulan lalu, dan implikasinya, dengan bahasa yang mudah dipahami pemilik usaha. 4 paragraf, satu per kelompok.',
  risiko: 'Susun RISIKO KEUANGAN DAN MITIGASI. Jawab HANYA dengan JSON array tanpa teks lain, 4-6 butir, format: [{"risiko":"...","tingkat":"Tinggi|Sedang|Rendah","indikator":"angka pendukung","mitigasi":"tindakan konkret"}]',
  rekomendasi: 'Susun REKOMENDASI DAN SARAN. Jawab HANYA dengan JSON array tanpa teks lain, 5-7 butir berurutan dari prioritas tertinggi, format: [{"prioritas":1,"tindakan":"...","alasan":"angka pendukung","tenggat":"mis. 30 hari"}]'
};

function aiDataPack_(client, ym) {
  var ctx = context_(client), u = laporanUtama(ctx, ym);
  var s = laporanPendukung(ctx, ym, { assets: [], bankStatements: [] });
  var slim = function (st) {
    return st.rows.filter(function (r) { return r.vals; }).map(function (r) {
      var o = { pos: r.label }; Object.keys(r.vals).forEach(function (k) { o[k] = Math.round(r.vals[k]); }); return o;
    });
  };
  var top = function (arr, n, f) { return arr.slice().sort(function (a, b) { return Math.abs(f(b)) - Math.abs(f(a)); }).slice(0, n); };
  var f = rekonsiliasiFiskal(ctx, ym, fiscalOpt_(client, ym));
  return {
    periode: ym, mataUang: 'IDR', bidangUsaha: client.bidangUsaha || '-', kerangka: client.kerangkaSak,
    keteranganKolom: { cur: 'bulan ini', prev: 'bulan lalu', ytd: 'YTD bulan ini', ytdPrev: 'YTD bulan lalu', ly: 'bulan sama tahun lalu', lyYtd: 'YTD tahun lalu' },
    labaRugi: slim(u.labaRugi), neraca: slim(u.neraca), arusKas: slim(u.arusKasTidakLangsung),
    rasio: u.rasio.map(function (r) { return { nama: r.nama, kelompok: r.kelompok, rumus: r.rumus, satuan: r.satuan, bulanIni: r.cur == null ? null : Math.round(r.cur * 1000) / 1000, bulanLalu: r.prev == null ? null : Math.round(r.prev * 1000) / 1000 }; }),
    tren12Bulan: u.tren,
    agingPiutang: { label: s.piutang.bucketLabels, nilai: s.piutang.buckets, total: s.piutang.total },
    agingUtang: { label: s.utang.bucketLabels, nilai: s.utang.buckets, total: s.utang.total },
    pelangganTerbesarYtd: s.penjualan.byPartner.slice(0, 10).map(function (x, i) { return { pelanggan: 'Pelanggan ' + (i + 1), ytd: Math.round(x.ytd), bulanIni: Math.round(x.bulan) }; }),
    biayaTerbesar: top(s.biaya.rows, 12, function (r) { return r.vals.ytd; }).map(function (r) { return { akun: r.nama, cur: Math.round(r.vals.cur), prev: Math.round(r.vals.prev), ytd: Math.round(r.vals.ytd), ytdPrev: Math.round(r.vals.ytdPrev) }; }),
    pajak: { labaKomersialYtd: f.labaKomersial, koreksiPositif: f.totalKoreksiPositif, koreksiNegatif: f.totalKoreksiNegatif, pkp: f.pkp, pphTerutang: f.pphTerutang, kreditPajak: f.totalKreditPajak, kurangLebihBayar: f.kurangLebihBayar }
  };
}

function callClaude_(system, userText, maxTokens) {
  var key = prop_('ANTHROPIC_API_KEY');
  if (!key) fail_('ANTHROPIC_API_KEY belum diisi di Script Properties.');
  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({ model: prop_('CLAUDE_MODEL') || DEFAULT_CLAUDE_MODEL, max_tokens: maxTokens || 1800, system: system,
      messages: [{ role: 'user', content: userText }] })
  });
  var body = JSON.parse(res.getContentText() || '{}');
  if (res.getResponseCode() !== 200) fail_('Claude API gagal (' + res.getResponseCode() + '): ' + ((body.error && body.error.message) || 'tidak diketahui'));
  return (body.content || []).filter(function (c) { return c.type === 'text'; }).map(function (c) { return c.text; }).join('\n').trim();
}

function apiAiGenerate(p, user, client) {
  var sec = String(p.section || '');
  if (!AI_SECTIONS[sec]) fail_('Bagian analisa tidak dikenal.');
  var pack = aiDataPack_(client, p.periode);
  var system = 'Anda adalah analis keuangan senior di kantor konsultan akuntansi dan pajak di Indonesia. ' +
    'Tulis dalam bahasa Indonesia formal, jelas, dan enak dibaca oleh pemilik usaha. ' +
    'Gunakan HANYA angka yang ada di data JSON; jangan mengarang angka, nama, atau fakta. Jika data tidak cukup, katakan demikian. ' +
    'Tulis angka rupiah dengan pemisah ribuan titik (contoh: Rp 1.250.000.000) atau dalam juta/miliar. ' +
    'Jangan gunakan markdown heading, tabel, atau huruf tebal; cukup paragraf dan butir "- " bila diminta. ' +
    'Sebut perusahaan sebagai "Perusahaan".';
  var text = callClaude_(system, AI_SECTIONS[sec] + '\n\nDATA (JSON):\n' + JSON.stringify(pack), 2000);
  var row = { periode: p.periode, section: sec, text: text, by: user.email, at: nowIso_() };
  saveNarrative_(client.dbId, row);
  return row;
}

function saveNarrative_(dbId, row) {
  deleteRows_(dbId, 'Narratives', function (n) { return n.periode === row.periode && n.section === row.section; });
  appendRows_(dbId, 'Narratives', [row]);
}

function apiAiSave(p, user, client) {
  var row = { periode: p.periode, section: p.section, text: String(p.text || ''), by: user.email, at: nowIso_() };
  saveNarrative_(client.dbId, row);
  return row;
}

function apiAiList(p, user, client) {
  var o = {};
  readTable_(client.dbId, 'Narratives').filter(function (n) { return n.periode === p.periode; }).forEach(function (n) { o[n.section] = n; });
  return { sections: Object.keys(AI_SECTIONS), narasi: o };
}
