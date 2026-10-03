/* views-analisa.js — Laporan Analisa Keuangan (narasi oleh Claude, angka oleh sistem). */
(function () {
  'use strict';
  var A = window.App, S = A.S, $ = A.$, $$ = A.$$, esc = A.esc, fmt = A.fmt, V = A.views;
  var SEC = [['ringkasan', 'Ringkasan Eksekutif'], ['kinerja', 'Analisa Kinerja Utama'], ['pendapatanBiaya', 'Analisa Pendapatan dan Biaya'], ['posisi', 'Analisa Aset, Utang, dan Ekuitas'],
    ['rasio', 'Analisa Rasio Keuangan'], ['risiko', 'Risiko Keuangan dan Mitigasi'], ['rekomendasi', 'Rekomendasi dan Saran']];

  function narr(key, nar) {
    var n = nar[key], admin = A.isAdmin();
    var tools = admin ? '<div class="actions no-print" style="margin:6px 0 12px"><button class="link" data-gen="' + key + '">' + (n ? 'Buat ulang dengan AI' : 'Buat dengan AI') + '</button>' + (n ? '<button class="link" data-edit="' + key + '">Ubah teks</button>' : '') + '</div>' : '';
    if (!n || !n.text) return tools + '<p class="narr-empty">Narasi belum tersedia.' + (admin ? ' Tekan "Buat narasi AI".' : ' Hubungi konsultan Anda.') + '</p>';
    var t = n.text.trim(), arr = null;
    if (key === 'risiko' || key === 'rekomendasi') { try { arr = JSON.parse(t.substring(t.indexOf('['), t.lastIndexOf(']') + 1)); } catch (e) { arr = null; } }
    if (arr && key === 'risiko') return tools + A.table([{ k: 'risiko', label: 'Risiko' },
      { label: 'Tingkat', html: true, fn: function (x) { var c = /tinggi/i.test(x.tingkat) ? 'bad' : /sedang/i.test(x.tingkat) ? 'warn' : 'good'; return '<span class="badge ' + c + '">' + esc(x.tingkat) + '</span>'; } },
      { k: 'indikator', label: 'Indikator' }, { k: 'mitigasi', label: 'Mitigasi yang harus dilakukan' }], arr);
    if (arr && key === 'rekomendasi') return tools + A.table([{ k: 'prioritas', label: 'Prioritas' }, { k: 'tindakan', label: 'Tindakan' }, { k: 'alasan', label: 'Dasar' }, { k: 'tenggat', label: 'Tenggat' }], arr);
    var html = '', list = [];
    var flush = function () { if (list.length) { html += '<ul>' + list.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>'; list = []; } };
    t.split(/\n+/).forEach(function (line) {
      line = line.trim(); if (!line) return;
      if (/^[-•*]\s+/.test(line)) list.push(line.replace(/^[-•*]\s+/, '')); else { flush(); html += '<p>' + esc(line) + '</p>'; }
    });
    flush();
    return tools + html;
  }

  V.analisa = function (root) {
    return Promise.all([A.report(['utama', 'pendukung']), A.api('ai.list', { periode: S.periode })]).then(function (r) {
      var d = r[0], u = d.utama, s = d.pendukung, nar = r[1].narasi, c = d.klien, p = S.periode;
      var lr = u.labaRugi.tot, nr = u.neraca.tot, ak = u.arusKasTidakLangsung.tot;
      var kas = nr['pos:Kas dan setara kas'] || { cur: 0, prev: 0 };
      var n = 0, toc = [];
      var sec = function (title, body, cls) { n++; toc.push(n + '. ' + title); return '<section class="' + (cls || '') + '"><h2 class="sec">' + n + '. ' + esc(title) + '</h2>' + body + '</section>'; };
      var tren = u.tren.map(function (t) { return { label: A.ymShort(t.ym), full: A.ymLabel(t.ym), vals: [t.pendapatan, t.labaBersih] }; });

      var kpiRows = [['Pendapatan usaha', lr.pendapatan], ['Laba bruto', lr.labaBruto], ['Laba usaha', lr.labaUsaha], ['Laba bersih', lr.labaBersih], ['Arus kas operasi', ak.op]];
      var kpiTable = '<div class="tbl-wrap"><table class="stmt"><thead><tr><th>Indikator</th><th class="num">' + A.ymShort(p) + '</th><th class="num">' + A.ymShort(A.prevYm(p)) + '</th><th class="num">%</th><th class="num gap">YTD ' + A.ymShort(p) + '</th><th class="num">YTD ' + A.ymShort(A.prevYm(p)) + '</th><th class="num">%</th></tr></thead><tbody>' +
        kpiRows.map(function (k) { var v = k[1]; return '<tr><td>' + k[0] + '</td>' + A.numCell(v.cur) + A.numCell(v.prev) + '<td class="num">' + A.fmtPct(A.pct(v.cur, v.prev)) + '</td>' + A.numCell(v.ytd, 'gap') + A.numCell(v.ytdPrev) + '<td class="num">' + A.fmtPct(A.pct(v.ytd, v.ytdPrev)) + '</td></tr>'; }).join('') + '</tbody></table></div>';

      var biaya = s.biaya.rows.slice().sort(function (a, b) { return b.vals.ytd - a.vals.ytd; });
      var varians = s.biaya.rows.concat(s.hpp.rows).map(function (x) { return { nama: x.nama, cur: x.vals.cur, prev: x.vals.prev, d: x.vals.cur - x.vals.prev }; }).sort(function (a, b) { return Math.abs(b.d) - Math.abs(a.d); }).slice(0, 8);
      var posRows = u.neraca.rows.filter(function (x) { return x.vals && (x.type === 'row' || x.type === 'sub' || x.type === 'total'); });
      var aging = function (l, col) { return l.bucketLabels.map(function (b, i) { return { label: b, value: l.buckets[i], color: i === 0 ? 'var(--s' + col + ')' : i >= 3 ? 'var(--bad)' : 'var(--s4)' }; }); };
      var fr = function (r, v) { if (v === null || v === undefined) return '-'; return r.satuan === '%' ? A.fmtPct(v) : r.satuan === 'Rp' ? fmt(v) : v.toLocaleString('id-ID', { maximumFractionDigits: r.satuan === 'hari' ? 0 : 2 }) + ' ' + r.satuan; };
      var rasioTable = '<div class="tbl-wrap"><table><thead><tr><th>Kelompok</th><th>Rasio</th><th>Rumus</th><th class="num">' + A.ymShort(p) + '</th><th class="num">' + A.ymShort(A.prevYm(p)) + '</th><th>Arah</th></tr></thead><tbody>' +
        u.rasio.map(function (x, i) {
          var first = i === 0 || u.rasio[i - 1].kelompok !== x.kelompok, dlt = x.cur !== null && x.prev !== null ? x.cur - x.prev : null;
          return '<tr><td>' + (first ? '<b>' + esc(x.kelompok) + '</b>' : '') + '</td><td>' + esc(x.nama) + '</td><td class="small muted">' + esc(x.rumus) + '</td><td class="num"><b>' + fr(x, x.cur) + '</b></td><td class="num">' + fr(x, x.prev) + '</td><td>' + (dlt === null || Math.abs(dlt) < 1e-9 ? '–' : dlt > 0 ? '▲ naik' : '▼ turun') + '</td></tr>';
        }).join('') + '</tbody></table></div>';

      var body = '';
      body += '<section class="cover"><div><div class="sub">' + esc(A.CFG.KONSULTAN || '') + '</div></div><div><p class="big">Laporan Analisa<br>Keuangan</p><div class="sub">Periode ' + esc(A.ymLabel(p)) + ' · komparatif bulan lalu dan YTD</div></div>' +
        '<div><div class="cl">' + esc(c.nama) + '</div><div class="sub">' + esc([c.alamat, c.kota].filter(Boolean).join(', ')) + '</div></div></section>';
      body += '<section><h2 class="sec">Daftar Isi</h2><div class="toc" id="toc"></div></section>';
      body += sec('Surat Pernyataan Manajemen',
        '<p>Yang bertanda tangan di bawah ini:</p><table style="max-width:520px;margin-bottom:10px"><tr><td style="width:120px">Nama</td><td>: ' + esc(c.pimpinan || '………………') + '</td></tr><tr><td>Jabatan</td><td>: ' + esc(c.jabatan || 'Direktur') + '</td></tr><tr><td>Perusahaan</td><td>: ' + esc(c.nama) + '</td></tr><tr><td>Alamat</td><td>: ' + esc([c.alamat, c.kota].filter(Boolean).join(', ') || '………………') + '</td></tr></table>' +
        '<p>menyatakan bahwa:</p><ol><li>Manajemen bertanggung jawab atas penyusunan dan penyajian laporan keuangan Perusahaan untuk periode yang berakhir ' + esc(A.tglLabel(p)) + ' sesuai dengan ' + esc(c.kerangkaSak || 'SAK Entitas Privat') + '.</li>' +
        '<li>Seluruh transaksi telah dicatat dan seluruh informasi dalam laporan keuangan telah dimuat secara lengkap dan benar.</li><li>Laporan keuangan tidak mengandung informasi atau fakta material yang tidak benar, dan tidak menghilangkan informasi atau fakta material.</li>' +
        '<li>Manajemen bertanggung jawab atas sistem pengendalian internal Perusahaan.</li></ol><p>Demikian pernyataan ini dibuat dengan sebenarnya.</p>' +
        '<div class="sign"><div></div><div class="center">' + esc(c.kota || '') + ', ' + esc(A.tglLabel(p)) + '<div class="line">' + esc(c.pimpinan || '………………') + '</div><div>' + esc(c.jabatan || 'Direktur') + '</div></div></div>');
      body += sec('Ringkasan Eksekutif',
        '<div class="grid g4" style="margin-bottom:14px">' + A.kpi('Pendapatan bulan ini', lr.pendapatan.cur, lr.pendapatan.prev) + A.kpi('Laba bersih bulan ini', lr.labaBersih.cur, lr.labaBersih.prev) + A.kpi('Kas dan setara kas', kas.cur, kas.prev) + A.kpi('Jumlah ekuitas', nr.ekuitas.cur, nr.ekuitas.prev) + '</div>' +
        '<div class="grid g4" style="margin-bottom:14px">' + A.kpi('Pendapatan YTD', lr.pendapatan.ytd, lr.pendapatan.ytdPrev, { vs: 'YTD bulan lalu' }) + A.kpi('Laba bersih YTD', lr.labaBersih.ytd, lr.labaBersih.ytdPrev, { vs: 'YTD bulan lalu' }) + A.kpi('Jumlah aset', nr.aset.cur, nr.aset.prev) + A.kpi('Jumlah liabilitas', nr.liabilitas.cur, nr.liabilitas.prev, { invert: true }) + '</div>' +
        '<div class="card"><div class="chart-title">Pendapatan dan laba bersih</div><div class="chart-sub">12 bulan terakhir, Rupiah</div>' + A.barChart(tren, ['Pendapatan', 'Laba bersih'], { h: 220, title: 'Pendapatan dan laba bersih' }) + '</div>' + narr('ringkasan', nar));
      body += sec('Analisa Kinerja Utama', kpiTable + '<div style="height:12px"></div>' + narr('kinerja', nar));
      body += sec('Analisa Pendapatan dan Biaya',
        '<div class="grid g2"><div><div class="chart-title">Pelanggan terbesar (YTD)</div><div class="chart-sub">Rupiah</div>' + (s.penjualan.byPartner.length ? A.hbarChart(s.penjualan.byPartner.slice(0, 6).map(function (x) { return { label: x.partner, value: x.ytd }; }), { labelW: 170 }) : '<p class="muted">Belum ada data.</p>') + '</div>' +
        '<div><div class="chart-title">Biaya terbesar (YTD)</div><div class="chart-sub">Rupiah</div>' + (biaya.length ? A.hbarChart(biaya.slice(0, 6).map(function (x) { return { label: x.nama, value: x.vals.ytd }; }), { color: 1, labelW: 170 }) : '<p class="muted">Belum ada data.</p>') + '</div></div>' +
        '<h3>Perubahan biaya terbesar: bulan ini dibanding bulan lalu</h3>' + A.table([{ k: 'nama', label: 'Akun' }, { k: 'cur', label: A.ymShort(p), num: true }, { k: 'prev', label: A.ymShort(A.prevYm(p)), num: true }, { k: 'd', label: 'Selisih', num: true }, { label: '%', fn: function (x) { return A.fmtPct(A.pct(x.cur, x.prev)); } }], varians) + '<div style="height:12px"></div>' + narr('pendapatanBiaya', nar));
      body += sec('Analisa Aset, Utang, dan Ekuitas',
        '<div class="tbl-wrap"><table class="stmt"><thead><tr><th>Pos</th><th class="num">' + esc(A.tglLabel(p)) + '</th><th class="num">' + esc(A.tglLabel(A.prevYm(p))) + '</th><th class="num">Selisih</th><th class="num">% aset</th></tr></thead><tbody>' +
        posRows.map(function (x) { return '<tr class="' + x.type + '"><td>' + esc(x.label) + '</td>' + A.numCell(x.vals.cur) + A.numCell(x.vals.prev) + A.numCell(x.vals.cur - x.vals.prev) + '<td class="num muted">' + A.fmtPct(nr.aset.cur ? x.vals.cur / nr.aset.cur : null) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
        '<div class="grid g2" style="margin-top:14px"><div><div class="chart-title">Umur piutang usaha</div><div class="chart-sub">Rupiah, per ' + esc(A.tglLabel(p)) + '</div>' + A.hbarChart(aging(s.piutang, 1), { labelW: 130 }) + '</div><div><div class="chart-title">Umur utang usaha</div><div class="chart-sub">Rupiah, per ' + esc(A.tglLabel(p)) + '</div>' + A.hbarChart(aging(s.utang, 3), { labelW: 130 }) + '</div></div>' + narr('posisi', nar));
      body += sec('Analisa Rasio Keuangan', rasioTable + '<div style="height:12px"></div>' + narr('rasio', nar));
      body += sec('Risiko Keuangan dan Mitigasi', narr('risiko', nar));
      body += sec('Rekomendasi dan Saran', narr('rekomendasi', nar) + '<p class="small muted" style="margin-top:18px">Narasi disusun dengan bantuan AI (Claude) atas angka yang dihitung sistem, dan telah ditinjau oleh konsultan sebelum diterbitkan.</p>');

      var ada = SEC.filter(function (x) { return nar[x[0]]; }).length;
      root.innerHTML = '<div class="page-head no-print"><div><h1>Analisa AI</h1><p>Laporan analisa siap cetak. Angka dan grafik dihitung sistem; narasi ditulis Claude dan dapat diubah sebelum dicetak. Narasi tersedia: ' + ada + ' dari ' + SEC.length + ' bagian.</p></div>' +
        '<div class="actions">' + (A.isAdmin() ? '<button class="primary" id="gen-all">Buat narasi AI (' + SEC.length + ' bagian)</button>' : '') + '<button id="pr">Cetak / simpan PDF</button><button id="pdf">Simpan PDF ke Drive</button></div></div>' +
        '<div id="gen-msg" class="no-print"></div><div class="report-doc" id="print-area">' + body + '</div>';
      $('#toc').innerHTML = toc.map(function (t) { return '<div><span>' + esc(t) + '</span></div>'; }).join('');
      $('#pr').onclick = function () { window.print(); };
      $('#pdf').onclick = function () { A.savePdfToDrive($('#print-area'), 'Analisa_Keuangan_' + (c.id || '') + '_' + p, 'Analisa', false); };

      function gen(keys) {
        var i = 0, msg = $('#gen-msg');
        (function next() {
          if (i >= keys.length) { msg.innerHTML = ''; A.toast('Narasi AI selesai dibuat.', 'good'); return V.analisa(root); }
          var k = keys[i], label = SEC.filter(function (x) { return x[0] === k; })[0][1];
          msg.innerHTML = '<div class="note">Claude sedang menulis bagian ' + (i + 1) + ' dari ' + keys.length + ': <b>' + esc(label) + '</b>…</div>';
          A.api('ai.generate', { periode: p, section: k }).then(function () { i++; next(); }).catch(function () { msg.innerHTML = '<div class="note bad">Gagal pada bagian "' + esc(label) + '". Bagian sebelumnya sudah tersimpan; coba lagi.</div>'; });
        })();
      }
      if ($('#gen-all')) $('#gen-all').onclick = function () { gen(SEC.map(function (x) { return x[0]; })); };
      $('#print-area').onclick = function (e) {
        var g = e.target.getAttribute('data-gen'), ed = e.target.getAttribute('data-edit');
        if (g) gen([g]);
        if (ed) {
          var b = A.modal('<h2>Ubah narasi</h2><p class="small muted">Untuk bagian Risiko dan Rekomendasi, pertahankan format JSON agar tetap tampil sebagai tabel.</p><textarea id="tx" style="min-height:320px"></textarea><div class="foot"><button id="x">Batal</button><button class="primary" id="ok">Simpan</button></div>', { wide: true, sticky: true });
          $('#tx', b).value = nar[ed].text;
          $('#x', b).onclick = A.closeModal;
          $('#ok', b).onclick = function () { A.api('ai.save', { periode: p, section: ed, text: $('#tx', b).value }).then(function () { A.closeModal(); V.analisa(root); }); };
        }
      };
    });
  };
})();
