/* views-report.js — dashboard, laporan keuangan, CaLK, laporan pendukung, fiskal, Coretax. */
(function () {
  'use strict';
  var A = window.App, S = A.S, $ = A.$, $$ = A.$$, esc = A.esc, fmt = A.fmt, V = A.views;

  function toolbar(name, jenis, landscape) {
    return '<div class="actions no-print"><button data-act="print">Cetak</button><button data-act="xlsx">Unduh Excel</button><button data-act="pdf">Simpan PDF ke Drive</button></div>' +
      '<span class="hidden" id="exp-meta" data-name="' + esc(name) + '" data-jenis="' + esc(jenis || 'Laporan') + '" data-ls="' + (landscape ? 1 : 0) + '"></span>';
  }
  function bindToolbar(root) {
    $$('[data-act]', root).forEach(function (b) {
      b.onclick = function () {
        var meta = $('#exp-meta', root), area = $('#print-area', root);
        var name = (meta.getAttribute('data-name') + '_' + (A.client().id || '') + '_' + S.periode).replace(/\s+/g, '_');
        var act = b.getAttribute('data-act');
        if (act === 'print') window.print();
        else if (act === 'xlsx') A.exportExcel(area, name);
        else A.savePdfToDrive(area, name, meta.getAttribute('data-jenis'), meta.getAttribute('data-ls') === '1');
      };
    });
  }
  function checkNote(u) {
    var c = u.cek, bad = [];
    if (!c.neracaSeimbang) bad.push('Neraca tidak seimbang, selisih Rp ' + fmt(c.selisihNeraca) + '.');
    if (Math.abs(c.selisihArusKasLangsung) > 1 || Math.abs(c.selisihArusKasTidakLangsung) > 1) bad.push('Arus kas tidak cocok dengan perubahan saldo kas.');
    if (c.akunTidakDikenal.length) bad.push('Ada jurnal dengan akun yang tidak ada di COA: ' + c.akunTidakDikenal.join(', ') + '.');
    return bad.length ? '<div class="note bad no-print">' + bad.map(esc).join('<br>') + '</div>' : '';
  }
  function kpi(label, val, prev, opt) {
    opt = opt || {};
    var p = A.pct(val, prev), up = p !== null && p >= 0, good = opt.invert ? !up : up;
    return '<div class="kpi"><div class="lb">' + esc(label) + '</div><div class="vl">' + (opt.raw ? esc(val) : 'Rp ' + A.short(val)) + '</div>' +
      '<div class="dl">' + (opt.raw ? esc(opt.sub || '') : (p === null ? 'tanpa pembanding' : '<b class="' + (good ? 'up' : 'down') + '">' + (up ? '▲ ' : '▼ ') + A.fmtPct(Math.abs(p)) + '</b> vs ' + esc(opt.vs || 'bulan lalu'))) + '</div></div>';
  }
  A.kpi = kpi;

  /* ================= DASHBOARD ================= */
  V.dashboard = function (root) {
    return A.report(['utama', 'pendukung']).then(function (d) {
      var u = d.utama, s = d.pendukung, lr = u.labaRugi.tot, nr = u.neraca.tot, p = S.periode;
      var kas = nr['pos:Kas dan setara kas'] || { cur: 0, prev: 0 };
      var tren = u.tren.map(function (t) { return { label: A.ymShort(t.ym), full: A.ymLabel(t.ym), vals: [t.pendapatan, t.labaBersih] }; });
      var kasTren = u.tren.map(function (t) { return { label: A.ymShort(t.ym), full: A.ymLabel(t.ym), vals: [t.kas] }; });
      var biaya = s.biaya.rows.slice().sort(function (a, b) { return b.vals.ytd - a.vals.ytd; }).slice(0, 8).map(function (r) { return { label: r.nama, value: r.vals.ytd }; });
      var pel = s.penjualan.byPartner.slice(0, 6).map(function (x) { return { label: x.partner, value: x.ytd }; });
      var aging = function (l, color) { return l.bucketLabels.map(function (b, i) { return { label: b, value: l.buckets[i], color: i === 0 ? 'var(--s' + color + ')' : i >= 3 ? 'var(--bad)' : 'var(--s4)' }; }); };
      var rasio = function (k) { var r = u.rasio.filter(function (x) { return x.key === k; })[0]; return r && r.cur !== null ? r : { cur: 0, prev: 0 }; };
      root.innerHTML = '<div class="page-head"><div><h1>Dashboard</h1><p>' + esc(d.klien.nama) + ' · ' + esc(A.ymLabel(p)) + (d.terkunci ? ' · <span class="badge bad">Terkunci</span>' : '') + '</p></div>' +
        '<div class="actions"><a class="btn" href="#/laporan">Laporan keuangan</a><a class="btn" href="#/analisa">Analisa AI</a></div></div>' + checkNote(u) +
        (lr.pendapatan.ytd === 0 && nr.aset.cur === 0 ? '<div class="note">Belum ada jurnal sampai periode ini. Mulai dari menu <a href="#/unggah">Unggah Jurnal</a>.</div>' : '') +
        '<div class="grid g5" style="margin-bottom:16px">' +
        kpi('Pendapatan bulan ini', lr.pendapatan.cur, lr.pendapatan.prev) + kpi('Laba bersih bulan ini', lr.labaBersih.cur, lr.labaBersih.prev) +
        kpi('Laba bersih YTD', lr.labaBersih.ytd, lr.labaBersih.lyYtd, { vs: 'YTD tahun lalu' }) +
        kpi('Kas dan setara kas', kas.cur, kas.prev) + kpi('Jumlah aset', nr.aset.cur, nr.aset.prev) + '</div>' +
        '<div class="grid g4" style="margin-bottom:16px">' +
        kpi('Margin laba bruto (YTD)', A.fmtPct(rasio('marginBruto').cur), null, { raw: true, sub: 'bulan lalu ' + A.fmtPct(rasio('marginBruto').prev) }) +
        kpi('Rasio lancar', (rasio('rasioLancar').cur || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' x', null, { raw: true, sub: 'aset lancar / liabilitas jk pendek' }) +
        kpi('Piutang usaha', s.piutang.total, null, { raw: false }) .replace('tanpa pembanding', fmt(s.piutang.total - s.piutang.buckets[0]) === '-' ? 'semua belum jatuh tempo' : 'Rp ' + A.short(s.piutang.total - s.piutang.buckets[0]) + ' lewat jatuh tempo') +
        kpi('Utang usaha', s.utang.total, null).replace('tanpa pembanding', fmt(s.utang.total - s.utang.buckets[0]) === '-' ? 'semua belum jatuh tempo' : 'Rp ' + A.short(s.utang.total - s.utang.buckets[0]) + ' lewat jatuh tempo') + '</div>' +
        '<div class="grid g2">' +
        '<div class="card"><div class="chart-title">Pendapatan dan laba bersih</div><div class="chart-sub">12 bulan terakhir, Rupiah</div>' + A.barChart(tren, ['Pendapatan', 'Laba bersih'], { title: 'Pendapatan dan laba bersih 12 bulan' }) + '</div>' +
        '<div class="card"><div class="chart-title">Saldo kas dan setara kas</div><div class="chart-sub">Akhir bulan, Rupiah</div>' + A.lineChart(kasTren, ['Kas dan setara kas'], { title: 'Saldo kas 12 bulan' }) + '</div>' +
        '<div class="card"><div class="chart-title">Biaya terbesar (YTD)</div><div class="chart-sub">Delapan akun beban terbesar, Rupiah</div>' + (biaya.length ? A.hbarChart(biaya, { color: 1 }) : '<div class="empty">Belum ada data.</div>') + '</div>' +
        '<div class="card"><div class="chart-title">Pelanggan terbesar (YTD)</div><div class="chart-sub">Penjualan per pelanggan, Rupiah</div>' + (pel.length ? A.hbarChart(pel, { color: 0 }) : '<div class="empty">Belum ada data.</div>') + '</div>' +
        '<div class="card"><div class="chart-title">Umur piutang usaha</div><div class="chart-sub">Per ' + esc(A.tglLabel(p)) + ' · <a href="#/pendukung?r=agingPiutang">rincian</a></div>' + A.hbarChart(aging(s.piutang, 1), { labelW: 130 }) + '</div>' +
        '<div class="card"><div class="chart-title">Umur utang usaha</div><div class="chart-sub">Per ' + esc(A.tglLabel(p)) + ' · <a href="#/pendukung?r=agingUtang">rincian</a></div>' + A.hbarChart(aging(s.utang, 3), { labelW: 130 }) + '</div>' +
        '</div>';
    });
  };

  /* ================= LAPORAN KEUANGAN ================= */
  var TABS = [['neraca', 'Posisi Keuangan'], ['labarugi', 'Laba Rugi'], ['ekuitas', 'Perubahan Ekuitas'], ['aruskas', 'Arus Kas'], ['saldo', 'Neraca Saldo'], ['calk', 'Catatan (CaLK)']];
  var lapState = { tab: 'neraca', metode: 'tidakLangsung' };
  V.laporan = function (root) {
    return A.report(['utama']).then(function (d) {
      var u = d.utama, p = S.periode;
      root.innerHTML = '<div class="page-head"><div><h1>Laporan Keuangan</h1><p>' + esc(d.klien.kerangkaSak || 'SAK Entitas Privat') + ' · klik baris untuk melihat rincian akun.</p></div><div id="tb"></div></div>' + checkNote(u) +
        '<div class="tabs no-print">' + TABS.map(function (t) { return '<button data-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div><div class="card" id="print-area"></div>';
      function draw() {
        $$('.tabs button', root).forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === lapState.tab); });
        var area = $('#print-area'), t = lapState.tab, name = 'Laporan', h = '';
        if (t === 'neraca') { name = 'Laporan_Posisi_Keuangan'; h = A.docHead('LAPORAN POSISI KEUANGAN', 'Per ' + A.tglLabel(p) + ' dan ' + A.tglLabel(A.prevYm(p))) + A.stmtTable(u.neraca, 'bal'); }
        else if (t === 'labarugi') { name = 'Laporan_Laba_Rugi'; h = A.docHead('LAPORAN LABA RUGI', 'Untuk bulan dan periode yang berakhir ' + A.tglLabel(p)) + A.stmtTable(u.labaRugi, 'flow'); }
        else if (t === 'aruskas') {
          var ak = lapState.metode === 'langsung' ? u.arusKasLangsung : u.arusKasTidakLangsung;
          name = 'Laporan_Arus_Kas_' + (lapState.metode === 'langsung' ? 'Langsung' : 'Tidak_Langsung');
          h = '<div class="actions no-print" style="margin-bottom:10px"><button data-m="tidakLangsung" class="' + (lapState.metode !== 'langsung' ? 'primary' : '') + '">Metode tidak langsung</button><button data-m="langsung" class="' + (lapState.metode === 'langsung' ? 'primary' : '') + '">Metode langsung</button></div>' +
            A.docHead('LAPORAN ARUS KAS — METODE ' + (lapState.metode === 'langsung' ? 'LANGSUNG' : 'TIDAK LANGSUNG'), 'Untuk bulan dan periode yang berakhir ' + A.tglLabel(p)) + A.stmtTable(ak, 'flow');
        } else if (t === 'ekuitas') {
          name = 'Laporan_Perubahan_Ekuitas';
          h = A.docHead('LAPORAN PERUBAHAN EKUITAS', 'Untuk bulan dan periode yang berakhir ' + A.tglLabel(p));
          var per = [A.ymLabel(p), A.ymLabel(A.prevYm(p)), 'Januari s.d. ' + A.ymLabel(p), 'Januari s.d. ' + A.ymLabel(A.prevYm(p))];
          h += u.ekuitas.tables.map(function (tb, i) {
            return '<h3>' + esc(tb.judul) + ' — ' + esc(per[i]) + '</h3><div class="tbl-wrap"><table class="stmt"><thead><tr><th>Uraian</th>' + u.ekuitas.cols.map(function (c) { return '<th class="num">' + esc(c.label) + '</th>'; }).join('') + '</tr></thead><tbody>' +
              tb.rows.map(function (r) { return '<tr class="' + r.type + '"><td>' + esc(r.label) + '</td>' + u.ekuitas.cols.map(function (c) { return A.numCell(r.vals[c.key]); }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
          }).join('');
        } else if (t === 'saldo') {
          name = 'Neraca_Saldo';
          h = A.docHead('NERACA SALDO', A.ymLabel(p)) + A.table([{ k: 'kode', label: 'Kode' }, { k: 'nama', label: 'Nama akun' }, { k: 'kelompok', label: 'Kelompok' },
            { k: 'awal', label: 'Saldo awal', num: true }, { k: 'debit', label: 'Debit', num: true }, { k: 'kredit', label: 'Kredit', num: true }, { k: 'akhir', label: 'Saldo akhir', num: true }], u.neracaSaldo.rows, { debit: u.neracaSaldo.total.debit, kredit: u.neracaSaldo.total.kredit });
        } else { name = 'Catatan_atas_Laporan_Keuangan'; h = calk(d); }
        area.setAttribute('data-sheet', name.replace(/_/g, ' '));
        area.className = 'card' + (t === 'calk' ? '' : ' print-landscape');
        area.innerHTML = h;
        $('#tb').innerHTML = toolbar(name, 'Laporan', t !== 'calk');
        bindToolbar(root); A.bindStmt(area);
        $$('[data-m]', area).forEach(function (b) { b.onclick = function () { lapState.metode = b.getAttribute('data-m'); draw(); }; });
      }
      $$('.tabs button', root).forEach(function (b) { b.onclick = function () { lapState.tab = b.getAttribute('data-tab'); draw(); }; });
      draw();
    });
  };

  /* Catatan atas Laporan Keuangan — kerangka SAK Entitas Privat; narasi kebijakan bersifat templat dan perlu ditinjau per klien. */
  function calk(d) {
    var c = d.klien, u = d.utama, p = S.periode, n = 0;
    var sec = function (t) { n++; return '<h3>' + n + '. ' + esc(t) + '</h3>'; };
    var sak = c.kerangkaSak || 'SAK Entitas Privat';
    var h = A.docHead('CATATAN ATAS LAPORAN KEUANGAN', 'Per ' + A.tglLabel(p) + ' dan untuk periode yang berakhir pada tanggal tersebut');
    h += sec('UMUM') + '<p>' + esc(c.nama) + ' ("Perusahaan") berkedudukan di ' + esc(c.kota || '………') + (c.alamat ? ', beralamat di ' + esc(c.alamat) : '') + '. ' +
      'Perusahaan bergerak di bidang ' + esc(c.bidangUsaha || '………') + '. NPWP: ' + esc(c.npwp || '………') + '. ' +
      'Perusahaan dipimpin oleh ' + esc(c.pimpinan || '………') + ' selaku ' + esc(c.jabatan || 'Direktur') + '.</p>';
    h += sec('IKHTISAR KEBIJAKAN AKUNTANSI YANG MATERIAL') +
      '<p><b>a. Pernyataan kepatuhan.</b> Laporan keuangan disusun sesuai dengan ' + esc(sak) + ' yang diterbitkan oleh Dewan Standar Akuntansi Keuangan Ikatan Akuntan Indonesia.</p>' +
      '<p><b>b. Dasar penyusunan.</b> Laporan keuangan disusun dengan dasar akrual dan konsep biaya historis, kecuali dinyatakan lain. Laporan arus kas menyajikan arus kas dari aktivitas operasi, investasi, dan pendanaan. Mata uang penyajian adalah Rupiah.</p>' +
      '<p><b>c. Kas dan setara kas.</b> Meliputi kas, bank, dan deposito berjangka dengan jatuh tempo tiga bulan atau kurang yang tidak dijaminkan.</p>' +
      '<p><b>d. Piutang usaha.</b> Diakui sebesar nilai tagihan dikurangi penyisihan penurunan nilai berdasarkan penelaahan kolektibilitas masing-masing saldo pada akhir periode.</p>' +
      '<p><b>e. Persediaan.</b> Dinyatakan sebesar nilai terendah antara biaya perolehan dan harga jual dikurangi biaya untuk menyelesaikan dan menjual.</p>' +
      '<p><b>f. Biaya dibayar dimuka.</b> Diamortisasi selama masa manfaatnya dengan metode garis lurus.</p>' +
      '<p><b>g. Aset tetap.</b> Dicatat sebesar biaya perolehan dikurangi akumulasi penyusutan dan penurunan nilai. Penyusutan dihitung dengan metode garis lurus selama taksiran umur manfaat aset. Tanah tidak disusutkan.</p>' +
      '<p><b>h. Pengakuan pendapatan dan beban.</b> Pendapatan diakui ketika barang atau jasa telah diserahkan kepada pelanggan dan jumlahnya dapat diukur dengan andal. Beban diakui pada saat terjadinya.</p>' +
      '<p><b>i. Pajak penghasilan.</b> Beban pajak kini dihitung berdasarkan taksiran laba kena pajak periode berjalan dengan tarif pajak yang berlaku.</p>' +
      '<p><b>j. Transaksi dalam mata uang asing.</b> Dicatat dengan kurs pada tanggal transaksi; aset dan liabilitas moneter dijabarkan dengan kurs tanggal pelaporan dan selisihnya diakui dalam laba rugi.</p>';
    var cols = ['<th class="num">' + esc(A.tglLabel(p)) + '</th><th class="num">' + esc(A.tglLabel(A.prevYm(p))) + '</th>', '<th class="num">YTD ' + esc(A.ymShort(p)) + '</th><th class="num">YTD ' + esc(A.ymShort(A.prevYm(p))) + '</th>'];
    function rinci(rows, kA, kB, ci) {
      rows.forEach(function (r) {
        if (!r.vals || !r.detail || !r.detail.length || (r.type !== 'row')) return;
        var det = r.detail.filter(function (x) { return Math.abs(x.vals[kA]) > 0.5 || Math.abs(x.vals[kB]) > 0.5; });
        if (!det.length) return;
        h += sec(r.label.toUpperCase()) + '<div class="tbl-wrap"><table class="stmt"><thead><tr><th>Rincian</th>' + cols[ci] + '</tr></thead><tbody>' +
          det.map(function (x) { return '<tr><td>' + esc(x.nama) + '</td>' + A.numCell(x.vals[kA]) + A.numCell(x.vals[kB]) + '</tr>'; }).join('') +
          '<tr class="sub"><td>Jumlah</td>' + A.numCell(r.vals[kA]) + A.numCell(r.vals[kB]) + '</tr></tbody></table></div>';
      });
    }
    rinci(u.neraca.rows, 'cur', 'prev', 0);
    rinci(u.labaRugi.rows, 'ytd', 'ytdPrev', 1);
    h += sec('PERISTIWA SETELAH PERIODE PELAPORAN') + '<p>Sampai dengan tanggal penyelesaian laporan keuangan ini, tidak terdapat peristiwa setelah periode pelaporan yang memerlukan penyesuaian atau pengungkapan, kecuali dinyatakan lain oleh manajemen.</p>';
    h += sec('PENYELESAIAN LAPORAN KEUANGAN') + '<p>Manajemen Perusahaan bertanggung jawab atas penyusunan dan penyajian laporan keuangan ini.</p>' +
      '<div class="sign"><div></div><div class="center">' + esc(c.kota || '') + ', ' + esc(A.tglLabel(p)) + '<div class="line">' + esc(c.pimpinan || '………………') + '</div><div>' + esc(c.jabatan || 'Direktur') + '</div></div></div>';
    return h;
  }

  /* ================= LAPORAN PENDUKUNG ================= */
  var SUP = [
    ['bukuKas', 'Buku Kas'], ['bukuBank', 'Buku Bank'], ['rekonBank', 'Rekonsiliasi Bank'], ['piutang', 'Daftar Piutang per Pelanggan & Invoice'], ['agingPiutang', 'Aging Piutang'],
    ['dibayarDimuka', 'Sewa/Biaya Dibayar Dimuka & Amortisasi'], ['uangMuka', 'Daftar Uang Muka'], ['asetTetap', 'Aset Tetap & Penyusutan'], ['utang', 'Daftar Utang per Pemasok & Invoice'],
    ['agingUtang', 'Aging Utang'], ['akrual', 'Biaya Masih Harus Dibayar'], ['utangBank', 'Daftar Utang Bank'], ['utangPanjang', 'Daftar Utang Jangka Panjang'],
    ['penjualan', 'Penjualan per Customer & Invoice'], ['hpp', 'Daftar Harga Pokok Penjualan'], ['biaya', 'Daftar Biaya-Biaya']
  ];
  var supSel = 'bukuKas';
  V.pendukung = function (root) {
    var m = location.hash.match(/[?&]r=(\w+)/); if (m) supSel = m[1];
    return Promise.all([A.report(['pendukung']), A.coa()]).then(function (r) {
      var s = r[0].pendukung, coa = r[1], p = S.periode;
      root.innerHTML = '<div class="page-head"><div><h1>Laporan Pendukung</h1><p>Setiap daftar dicocokkan dengan saldo buku besar; selisih ditampilkan bila ada.</p></div><div id="tb"></div></div>' +
        '<div class="card no-print"><label class="small muted">Pilih laporan<br><select id="sup" style="min-width:340px">' + SUP.map(function (x, i) { return '<option value="' + x[0] + '">' + (i + 1) + '. ' + esc(x[1]) + '</option>'; }).join('') + '</select></label></div><div class="card print-landscape" id="print-area"></div>';
      var sel = $('#sup'); sel.value = supSel;
      sel.onchange = function () { supSel = sel.value; draw(); };
      function mov(l, lab) {
        return A.table([{ k: 'kode', label: 'Akun' }, { k: 'nama', label: 'Nama akun' }, { k: 'partner', label: 'Partner' }, { k: 'invoice', label: 'Referensi' }, { k: 'awal', label: 'Saldo awal', num: true },
          { k: 'tambah', label: lab[0], num: true }, { k: 'kurang', label: lab[1], num: true }, { k: 'akhir', label: 'Saldo akhir', num: true }], l.rows, l.total);
      }
      function ledger(list) {
        if (!list.length) return '<div class="empty">Tidak ada mutasi.</div>';
        return list.map(function (a) {
          return '<h3>' + esc(a.kode + ' — ' + a.nama) + '</h3>' + A.table([{ label: 'Tanggal', fn: function (l) { return A.dmy(l.tanggal); } }, { k: 'ref', label: 'No Ref' }, { k: 'deskripsi', label: 'Keterangan' }, { k: 'partner', label: 'Partner' },
            { k: 'debit', label: 'Debit', num: true }, { k: 'kredit', label: 'Kredit', num: true }, { k: 'saldo', label: 'Saldo', num: true }],
            [{ tanggal: '', ref: '', deskripsi: 'Saldo awal', partner: '', debit: 0, kredit: 0, saldo: a.saldoAwal }].concat(a.lines), { debit: a.debit, kredit: a.kredit, saldo: a.saldoAkhir });
        }).join('');
      }
      function invList(l, who) {
        return recon(l) + A.table([{ k: 'partner', label: who }, { k: 'invoice', label: 'No Invoice' }, { label: 'Tanggal', fn: function (x) { return A.dmy(x.tanggal); } }, { label: 'Jatuh tempo', fn: function (x) { return A.dmy(x.jatuhTempo); } },
          { k: 'tagihan', label: 'Nilai', num: true }, { k: 'bayar', label: 'Pelunasan', num: true }, { k: 'sisa', label: 'Sisa', num: true },
          { label: 'Umur', html: true, fn: function (x) { return x.hari > 0 ? '<span class="badge ' + (x.hari > 60 ? 'bad' : 'warn') + '">lewat ' + x.hari + ' hari</span>' : '<span class="badge good">belum jatuh tempo</span>'; } }], l.rows, { sisa: l.total });
      }
      function recon(l) {
        return Math.abs(l.selisih) > 1 ? '<div class="note warn">Jumlah daftar Rp ' + fmt(l.total) + ' berbeda Rp ' + fmt(l.selisih) + ' dari saldo buku besar Rp ' + fmt(l.saldoBukuBesar) + '.</div>'
          : '<div class="note good no-print">Jumlah daftar sama dengan saldo buku besar: Rp ' + fmt(l.saldoBukuBesar) + '.</div>';
      }
      function aging(l, who) {
        var cols = [{ k: 'partner', label: who }].concat(l.bucketLabels.map(function (b, i) { return { label: b, num: true, fn: function (x) { return x.b[i]; } }; })).concat([{ k: 'total', label: 'Jumlah', num: true }]);
        var foot = '<tfoot><tr><td>Jumlah</td>' + l.buckets.map(function (v) { return A.numCell(v); }).join('') + A.numCell(l.total) + '</tr><tr><td>Komposisi</td>' + l.buckets.map(function (v) { return '<td class="num muted">' + A.fmtPct(l.total ? v / l.total : null) + '</td>'; }).join('') + '<td></td></tr></tfoot>';
        return recon(l) + A.table(cols, l.byPartner).replace('</tbody>', '</tbody>' + foot);
      }
      function rinci(x) {
        return A.table([{ k: 'kode', label: 'Akun' }, { k: 'nama', label: 'Nama akun' }, { label: A.ymShort(p), num: true, fn: function (r) { return r.vals.cur; } }, { label: A.ymShort(A.prevYm(p)), num: true, fn: function (r) { return r.vals.prev; } },
          { label: 'Selisih', num: true, fn: function (r) { return r.vals.cur - r.vals.prev; } }, { label: 'YTD ' + A.ymShort(p), num: true, fn: function (r) { return r.vals.ytd; } }, { label: 'YTD ' + A.ymShort(A.prevYm(p)), num: true, fn: function (r) { return r.vals.ytdPrev; } }], x.rows)
          .replace('</tbody>', '</tbody><tfoot><tr><td colspan="2">Jumlah</td>' + A.numCell(x.total.cur) + A.numCell(x.total.prev) + A.numCell(x.total.cur - x.total.prev) + A.numCell(x.total.ytd) + A.numCell(x.total.ytdPrev) + '</tr></tfoot>');
      }
      function draw() {
        var title = SUP.filter(function (x) { return x[0] === supSel; })[0][1], h = A.docHead(title.toUpperCase(), (/buku|penjualan|hpp|biaya|rekon/i.test(supSel) ? 'Periode ' + A.ymLabel(p) : 'Per ' + A.tglLabel(p)));
        if (supSel === 'bukuKas') h += ledger(s.bukuKas);
        else if (supSel === 'bukuBank') h += ledger(s.bukuBank);
        else if (supSel === 'rekonBank') {
          h += '<div class="actions no-print" style="margin-bottom:12px"><select id="rk-akun">' + coa.filter(function (a) { return a.kelompok === 'BANK'; }).map(function (a) { return '<option value="' + esc(a.kode) + '">' + esc(a.kode + ' — ' + a.nama) + '</option>'; }).join('') + '</select><button id="rk-up">Unggah rekening koran (Excel)</button><input type="file" id="rk-f" class="hidden" accept=".xlsx,.xls,.csv"><span class="small muted">Kolom: Tanggal, Keterangan, Masuk, Keluar, Saldo</span></div>';
          h += s.rekonBank.length ? s.rekonBank.map(function (b) {
            var li = function (rows, kcol) { return rows.length ? A.table([{ label: 'Tanggal', fn: function (x) { return A.dmy(x.tanggal); } }, { label: 'Keterangan', fn: function (x) { return x[kcol] || x.ref || ''; } }, { k: 'nilai', label: 'Nilai', num: true }], rows) : '<p class="muted small">Tidak ada.</p>'; };
            return '<h3>' + esc(b.kode + ' — ' + b.nama) + '</h3>' + (!b.adaRekeningKoran ? '<div class="note warn">Rekening koran bulan ini belum diunggah; semua mutasi buku tampil sebagai belum cocok.</div>' : '') +
              '<div class="tbl-wrap"><table class="stmt"><tbody><tr><td>Saldo menurut buku</td>' + A.numCell(b.saldoBuku) + '</tr><tr class="row"><td>Dikurangi: mutasi buku yang belum ada di bank</td>' + A.numCell(-b.totalBelumDiBank) + '</tr>' +
              '<tr class="row"><td>Ditambah: mutasi bank yang belum dicatat di buku</td>' + A.numCell(b.totalBelumDiBuku) + '</tr><tr class="sub"><td>Saldo buku setelah penyesuaian</td>' + A.numCell(b.saldoBukuDisesuaikan) + '</tr>' +
              '<tr><td>Saldo menurut rekening koran</td>' + (b.saldoRekeningKoran === null ? '<td class="num muted">tidak tersedia</td>' : A.numCell(b.saldoRekeningKoran)) + '</tr>' +
              '<tr class="total"><td>Selisih</td>' + (b.selisih === null ? '<td class="num muted">-</td>' : A.numCell(b.selisih)) + '</tr></tbody></table></div>' +
              '<p class="small muted">' + b.jumlahCocok + ' mutasi cocok otomatis (nominal sama, selisih tanggal maksimal 3 hari).</p>' +
              '<h3>Ada di buku, belum ada di bank</h3>' + li(b.belumDiBank, 'deskripsi') + '<h3>Ada di bank, belum dicatat di buku</h3>' + li(b.belumDiBuku, 'keterangan');
          }).join('') : '<div class="empty">Tidak ada akun bank bermutasi.</div>';
        }
        else if (supSel === 'piutang') h += invList(s.piutang, 'Pelanggan');
        else if (supSel === 'agingPiutang') h += aging(s.piutang, 'Pelanggan');
        else if (supSel === 'utang') h += invList(s.utang, 'Pemasok');
        else if (supSel === 'agingUtang') h += aging(s.utang, 'Pemasok');
        else if (supSel === 'dibayarDimuka') h += mov(s.dibayarDimuka, ['Penambahan', 'Amortisasi']);
        else if (supSel === 'uangMuka') h += mov(s.uangMuka, ['Pemberian', 'Realisasi']);
        else if (supSel === 'akrual') h += mov(s.akrual, ['Pembebanan', 'Pembayaran']);
        else if (supSel === 'utangBank') h += mov(s.utangBank, ['Pencairan', 'Pelunasan']);
        else if (supSel === 'utangPanjang') h += mov(s.utangPanjang, ['Penambahan', 'Pelunasan']);
        else if (supSel === 'asetTetap') {
          var a = s.asetTetap;
          h += '<h3>Mutasi harga perolehan (buku besar)</h3>' + mov(a.bukuBesar, ['Penambahan', 'Pengurangan']) + '<h3>Mutasi akumulasi penyusutan (buku besar)</h3>' + mov(a.akumulasi, ['Penyusutan', 'Pengurangan']) +
            '<h3>Daftar aset dan jadwal penyusutan (garis lurus)</h3>' +
            (Math.abs(a.selisihHarga) > 1 || Math.abs(a.selisihAkumulasi) > 1 ? '<div class="note warn">Daftar aset berbeda dari buku besar: harga perolehan Rp ' + fmt(a.selisihHarga) + ', akumulasi penyusutan Rp ' + fmt(a.selisihAkumulasi) + '. Lengkapi daftar aset atau buat jurnal penyesuaian.</div>' : '') +
            A.table([{ k: 'nama', label: 'Nama aset' }, { k: 'akun', label: 'Akun' }, { label: 'Tgl perolehan', fn: function (x) { return A.dmy(x.tglPerolehan); } }, { k: 'umurBulan', label: 'Umur (bln)' }, { k: 'harga', label: 'Harga perolehan', num: true },
              { k: 'penyusutanBulanIni', label: 'Penyusutan bulan ini', num: true }, { k: 'akumulasi', label: 'Akumulasi', num: true }, { k: 'nilaiBuku', label: 'Nilai buku', num: true },
              { label: '', html: true, fn: function (x) { return '<button class="link danger no-print" data-da="' + esc(x.id) + '">Hapus</button>'; } }], a.register,
              { harga: a.totalRegister.harga, penyusutanBulanIni: a.totalRegister.bulanIni, akumulasi: a.totalRegister.akumulasi, nilaiBuku: a.totalRegister.nilaiBuku }) +
            '<div class="actions no-print" style="margin-top:10px"><button id="as-add">+ Tambah aset</button></div>';
        }
        else if (supSel === 'penjualan') {
          h += '<h3>Per pelanggan</h3>' + A.table([{ k: 'partner', label: 'Pelanggan' }, { k: 'bulan', label: A.ymShort(p), num: true }, { k: 'ytd', label: 'YTD ' + A.ymShort(p), num: true },
            { label: '% YTD', fn: function (x) { return A.fmtPct(s.penjualan.totalYtd ? x.ytd / s.penjualan.totalYtd : null); } }], s.penjualan.byPartner, { bulan: s.penjualan.totalBulan, ytd: s.penjualan.totalYtd }) +
            '<h3>Per invoice — ' + esc(A.ymLabel(p)) + '</h3>' + A.table([{ label: 'Tanggal', fn: function (x) { return A.dmy(x.tanggal); } }, { k: 'invoice', label: 'No Invoice' }, { k: 'partner', label: 'Pelanggan' }, { k: 'nilai', label: 'Nilai', num: true }], s.penjualan.invoices, { nilai: s.penjualan.totalBulan });
        }
        else if (supSel === 'hpp') h += rinci(s.hpp);
        else if (supSel === 'biaya') h += rinci(s.biaya);
        var area = $('#print-area'); area.innerHTML = h; area.setAttribute('data-sheet', title);
        $('#tb').innerHTML = toolbar(title, 'Laporan', true); bindToolbar(root);
        if ($('#rk-up')) {
          $('#rk-up').onclick = function () { $('#rk-f').click(); };
          $('#rk-f').onchange = function (e) {
            var f = e.target.files[0]; if (!f || !A.needXlsx()) return;
            A.fileToBuf(f).then(function (buf) {
              var res = A.readSheet(XLSX.read(buf, { type: 'array' }), ['rekening', 'mutasi'], ['tanggal'], function (hd) {
                if (hd.indexOf('tanggal') === 0) return 'tanggal'; if (hd.indexOf('keterangan') === 0 || hd.indexOf('uraian') === 0 || hd.indexOf('deskripsi') === 0) return 'keterangan';
                if (hd.indexOf('masuk') === 0 || hd === 'kredit' || hd === 'cr') return 'masuk'; if (hd.indexOf('keluar') === 0 || hd === 'debit' || hd === 'debet' || hd === 'db') return 'keluar';
                if (hd.indexOf('saldo') === 0) return 'saldo'; return '';
              });
              res.rows.forEach(function (x) { x.tanggal = A.serialToIso(x.tanggal); });
              return A.api('bank.import', { akun: $('#rk-akun').value, rows: res.rows });
            }).then(function (d) { A.toast(d.baris + ' baris rekening koran diimpor.', 'good'); A.clearCache(); V.pendukung(root); }).catch(function (er) { A.toast(er.message, 'bad'); });
          };
        }
        if ($('#as-add')) $('#as-add').onclick = function () {
          var b = A.modal('<h2>Tambah aset tetap</h2><div class="form"><label class="full">Nama aset<input name="nama"></label>' +
            '<label>Akun aset<select name="akun">' + coa.filter(function (x) { return x.kelompok === 'ASET_TETAP'; }).map(function (x) { return '<option value="' + esc(x.kode) + '">' + esc(x.kode + ' — ' + x.nama) + '</option>'; }).join('') + '</select></label>' +
            '<label>Tanggal perolehan<input type="date" name="tglPerolehan"></label><label>Harga perolehan<input name="harga" inputmode="decimal"></label><label>Umur manfaat (bulan)<input name="umurBulan" type="number" value="48"></label>' +
            '<label>Nilai sisa<input name="nilaiSisa" value="0"></label></div><div class="foot"><button id="x">Batal</button><button class="primary" id="ok">Simpan</button></div>');
          $('#x', b).onclick = A.closeModal;
          $('#ok', b).onclick = function () { A.api('assets.save', A.formVals(b)).then(function () { A.closeModal(); A.clearCache(); V.pendukung(root); }); };
        };
        area.onclick = function (e) { var id = e.target.getAttribute('data-da'); if (id) A.api('assets.delete', { id: id }).then(function () { A.clearCache(); V.pendukung(root); }); };
      }
      draw();
    });
  };

  /* ================= FISKAL ================= */
  V.fiskal = function (root) {
    var tahun = S.periode.substring(0, 4);
    return Promise.all([A.report(['fiskal']), A.api('fiscal.settings', { tahun: tahun })]).then(function (r) {
      var f = r[0].fiskal, set = r[1], p = S.periode;
      var li = function (list) { return list.map(function (x) { return '<tr class="row"><td>' + esc(x.uraian) + ' <span class="badge">' + esc(x.sumber) + '</span></td>' + A.numCell(x.nilai) + '</tr>'; }).join('') || '<tr class="row"><td class="muted">Tidak ada</td><td></td></tr>'; };
      var modeLabel = { 'UMUM': 'Tarif umum Pasal 17 (22%)', '31E': 'Fasilitas Pasal 31E (omzet sampai Rp 50 miliar)', 'FINAL_UMKM': 'PPh final UMKM 0,5% dari omzet' };
      root.innerHTML = '<div class="page-head"><div><h1>Rekonsiliasi Fiskal &amp; PPh Badan</h1><p>Dihitung otomatis dari laba komersial YTD dan baris jurnal bertanda NDE. Angka bersifat interim (belum disetahunkan).</p></div><div id="tb">' + toolbar('Rekonsiliasi_Fiskal', 'Laporan') + '</div></div>' +
        '<div class="card no-print"><h2>Pengaturan tahun pajak ' + tahun + '</h2><div class="form" style="grid-template-columns:repeat(3,minmax(0,1fr))">' +
        '<label>Skema tarif<select name="mode"' + (A.isAdmin() ? '' : ' disabled') + '>' + Object.keys(modeLabel).map(function (k) { return '<option value="' + k + '"' + (set.mode === k ? ' selected' : '') + '>' + modeLabel[k] + '</option>'; }).join('') + '</select></label>' +
        '<label>Kompensasi kerugian fiskal (Rp)<input name="kompensasiRugi" value="' + (set.kompensasiRugi || 0) + '"' + (A.isAdmin() ? '' : ' disabled') + '></label>' +
        '<label>Tarif umum (desimal, mis. 0.22)<input name="tarifUmum" value="' + (set.tarif.tarifUmum || set.tarifDefault.tarifUmum) + '"' + (A.isAdmin() ? '' : ' disabled') + '></label></div>' +
        (A.isAdmin() ? '<div class="actions" style="margin-top:12px"><button class="primary" id="save-set">Simpan pengaturan</button><button id="add-adj">+ Koreksi fiskal manual</button></div>' : '') +
        (set.adj.length ? '<h3>Koreksi fiskal manual</h3>' + A.table([{ k: 'uraian', label: 'Uraian' }, { k: 'jenis', label: 'Jenis' }, { k: 'nilai', label: 'Nilai', num: true }, { label: '', html: true, fn: function (a) { return '<button class="link danger" data-dadj="' + esc(a.id) + '">Hapus</button>'; } }], set.adj) : '') + '</div>' +
        '<div class="card" id="print-area" data-sheet="Rekonsiliasi Fiskal">' + A.docHead('REKONSILIASI FISKAL DAN PERHITUNGAN PPh BADAN', 'Januari s.d. ' + A.ymLabel(p)) +
        '<div class="tbl-wrap"><table class="stmt"><tbody>' +
        '<tr class="sub"><td>Laba (rugi) komersial sebelum pajak</td>' + A.numCell(f.labaKomersial) + '</tr>' +
        '<tr class="head"><td colspan="2">Koreksi fiskal positif</td></tr>' + li(f.koreksiPositif) + '<tr class="sub"><td>Jumlah koreksi positif</td>' + A.numCell(f.totalKoreksiPositif) + '</tr>' +
        '<tr class="head"><td colspan="2">Koreksi fiskal negatif</td></tr>' + li(f.koreksiNegatif) + '<tr class="sub"><td>Jumlah koreksi negatif</td>' + A.numCell(f.totalKoreksiNegatif) + '</tr>' +
        '<tr class="total"><td>Penghasilan neto fiskal</td>' + A.numCell(f.penghasilanNetoFiskal) + '</tr>' +
        '<tr class="row"><td>Kompensasi kerugian fiskal</td>' + A.numCell(-f.kompensasiRugi) + '</tr>' +
        '<tr class="total"><td>Penghasilan Kena Pajak (dibulatkan ke bawah ribuan)</td>' + A.numCell(f.pkp) + '</tr>' +
        '<tr class="head"><td colspan="2">Perhitungan PPh terutang — ' + esc(modeLabel[f.mode]) + ' · peredaran bruto YTD Rp ' + fmt(f.peredaranBruto) + '</td></tr>' +
        f.rincianPph.map(function (x) { return '<tr class="row"><td>' + esc(x.uraian) + ': ' + A.fmtPct(x.tarif) + ' × Rp ' + fmt(x.dasar) + '</td>' + A.numCell(x.pajak) + '</tr>'; }).join('') +
        '<tr class="sub"><td>PPh terutang</td>' + A.numCell(f.pphTerutang) + '</tr>' +
        '<tr class="head"><td colspan="2">Kredit pajak (saldo PPh dibayar dimuka)</td></tr>' +
        (f.kreditPajak.map(function (x) { return '<tr class="row"><td>' + esc(x.kode + ' ' + x.nama) + '</td>' + A.numCell(x.nilai) + '</tr>'; }).join('') || '<tr class="row"><td class="muted">Tidak ada</td><td></td></tr>') +
        '<tr class="sub"><td>Jumlah kredit pajak</td>' + A.numCell(f.totalKreditPajak) + '</tr>' +
        '<tr class="total"><td>PPh ' + (f.kurangLebihBayar >= 0 ? 'kurang bayar (Pasal 29)' : 'lebih bayar (Pasal 28A)') + '</td>' + A.numCell(Math.abs(f.kurangLebihBayar)) + '</tr>' +
        '<tr class="row"><td class="muted">Beban pajak penghasilan yang sudah dibukukan (YTD)</td>' + A.numCell(f.bebanPajakDibukukan) + '</tr>' +
        '</tbody></table></div>' +
        '<h3>Rincian transaksi bertanda NDE (' + f.ndeLines.length + ')</h3>' + A.table([{ label: 'Tanggal', fn: function (x) { return A.dmy(x.tanggal); } }, { k: 'ref', label: 'No Ref' }, { label: 'Akun', fn: function (x) { return x.kode + ' ' + x.nama; } }, { k: 'deskripsi', label: 'Deskripsi' },
          { label: 'Koreksi', html: true, fn: function (x) { return '<span class="badge ' + (x.jenis === 'POSITIF' ? 'warn' : 'good') + '">' + x.jenis.toLowerCase() + '</span>'; } }, { k: 'nilai', label: 'Nilai', num: true }], f.ndeLines) +
        '<p class="small muted">Tarif dan batas fasilitas dapat diubah di pengaturan. Hasil ini adalah alat bantu hitung; penetapan pajak tetap mengikuti ketentuan dan pertimbangan konsultan.</p></div>';
      bindToolbar(root);
      if ($('#save-set')) $('#save-set').onclick = function () {
        var v = A.formVals(root);
        A.api('fiscal.saveSettings', { tahun: tahun, mode: v.mode, kompensasiRugi: v.kompensasiRugi, tarif: { tarifUmum: v.tarifUmum } }).then(function () { A.clearCache(); A.toast('Pengaturan fiskal disimpan.', 'good'); V.fiskal(root); });
      };
      if ($('#add-adj')) $('#add-adj').onclick = function () {
        var b = A.modal('<h2>Koreksi fiskal manual — ' + tahun + '</h2><p class="muted small">Untuk koreksi yang tidak berasal dari tanda NDE, misalnya selisih penyusutan komersial dan fiskal.</p><div class="form"><label class="full">Uraian<input name="uraian"></label>' +
          '<label>Jenis<select name="jenis"><option value="POSITIF">Positif (menambah laba fiskal)</option><option value="NEGATIF">Negatif (mengurangi laba fiskal)</option></select></label><label>Nilai (Rp)<input name="nilai" inputmode="decimal"></label></div>' +
          '<div class="foot"><button id="x">Batal</button><button class="primary" id="ok">Simpan</button></div>');
        $('#x', b).onclick = A.closeModal;
        $('#ok', b).onclick = function () { var v = A.formVals(b); v.tahun = tahun; A.api('fiscal.saveAdj', v).then(function () { A.closeModal(); A.clearCache(); V.fiskal(root); }); };
      };
      root.onclick = function (e) { var id = e.target.getAttribute('data-dadj'); if (id) A.api('fiscal.deleteAdj', { id: id }).then(function () { A.clearCache(); V.fiskal(root); }); };
    });
  };

  /* ================= CORETAX ================= */
  V.coretax = function (root) {
    return Promise.all([A.report(['coretax']), A.api('coretax.get')]).then(function (r) {
      var c = r[0].coretax, cfg = r[1], p = S.periode;
      function sect(list, title) {
        var last = '', tot = {}, body = '';
        list.forEach(function (i) {
          if (i.bagian !== last) { body += '<tr class="head"><td colspan="3">' + esc(i.bagian) + '</td></tr>'; last = i.bagian; }
          var hasD = i.akun.length;
          body += '<tr class="row' + (hasD ? ' has-detail' : '') + '" data-i="' + esc(i.kode) + '"><td>' + esc(i.nama) + '</td><td class="muted">' + esc(i.kode) + '</td>' + A.numCell(i.nilai) + '</tr>' +
            i.akun.map(function (a) { return '<tr class="detail hidden" data-p="' + esc(i.kode) + '"><td>' + esc((a.kode ? a.kode + '  ' : '') + a.nama) + '</td><td></td>' + A.numCell(a.nilai) + '</tr>'; }).join('');
          tot[i.normal] = (tot[i.normal] || 0) + i.nilai;
        });
        return { html: '<h3>' + title + '</h3><div class="tbl-wrap"><table class="stmt"><thead><tr><th>Pos Coretax</th><th>Kode</th><th class="num">Nilai (Rp)</th></tr></thead><tbody>' + body, tot: tot };
      }
      var n = sect(c.neraca, 'Neraca — per ' + esc(A.tglLabel(p))), l = sect(c.labaRugi, 'Laba rugi — Januari s.d. ' + esc(A.ymLabel(p)));
      root.innerHTML = '<div class="page-head"><div><h1>Laporan Format Coretax</h1><p>Neraca dan laba rugi komersial dipetakan ke pos-pos lampiran SPT Tahunan Badan. Klik pos untuk melihat akun pembentuknya.</p></div><div id="tb">' + toolbar('Laporan_Coretax', 'Laporan') + '</div></div>' +
        '<div class="note warn no-print">Daftar pos di bawah adalah <b>daftar bawaan sementara</b>. Unggah daftar pos sesuai formulir Coretax yang Anda pakai (menu di bawah), lalu sesuaikan pemetaannya.</div>' +
        (c.belumDipetakan.length ? '<div class="note bad">Ada ' + c.belumDipetakan.length + ' akun bersaldo yang belum dipetakan: ' + c.belumDipetakan.map(function (a) { return esc(a.kode + ' ' + a.nama); }).join(', ') + '. Atur di menu Daftar Akun.</div>' : '') +
        '<div class="card" id="print-area" data-sheet="Coretax">' + A.docHead('LAPORAN KEUANGAN FORMAT CORETAX', 'Tahun pajak ' + p.substring(0, 4) + ' · posisi ' + A.tglLabel(p)) +
        n.html + '<tr class="total"><td>Jumlah aset</td><td></td>' + A.numCell(n.tot.D || 0) + '</tr><tr class="total"><td>Jumlah liabilitas dan ekuitas</td><td></td>' + A.numCell(n.tot.K || 0) + '</tr></tbody></table></div>' +
        l.html + '<tr class="total"><td>Laba (rugi) bersih</td><td></td>' + A.numCell((l.tot.K || 0) - (l.tot.D || 0)) + '</tr></tbody></table></div></div>' +
        (A.isAdmin() ? '<div class="card no-print"><h2>Pengaturan pemetaan (berlaku untuk semua klien)</h2><p class="muted">Pemetaan bawaan mengikuti kelompok akun. Untuk mengecualikan satu akun, pilih pos Coretax-nya di menu Daftar Akun.</p>' +
          '<div class="actions" style="margin-bottom:12px"><button id="ct-up">Unggah daftar pos Coretax (Excel)</button><input type="file" id="ct-f" class="hidden" accept=".xlsx,.xls,.csv"><span class="small muted">Kolom: Kode, Nama, Jenis (NERACA/LABARUGI), Bagian, Normal (D/K)</span><button class="primary" id="ct-save">Simpan pemetaan kelompok</button></div>' +
          A.table([{ label: 'Kelompok akun', fn: function (k) { return k.label; } }, { label: 'Pos Coretax', html: true, fn: function (k) {
            return '<select data-kel="' + k.kode + '"><option value="">— belum dipetakan —</option>' + cfg.items.map(function (i) { return '<option value="' + esc(i.kode) + '"' + (cfg.kelMap[k.kode] === i.kode ? ' selected' : '') + '>' + esc(i.kode + ' — ' + i.nama) + '</option>'; }).join('') + '</select>'; } }], S.kelompok) + '</div>' : '');
      bindToolbar(root);
      $$('#print-area tr.has-detail').forEach(function (tr) { tr.firstChild.onclick = function () { tr.classList.toggle('open'); $$('tr.detail[data-p="' + tr.getAttribute('data-i') + '"]', tr.parentNode).forEach(function (d) { d.classList.toggle('hidden'); }); }; });
      if ($('#ct-save')) $('#ct-save').onclick = function () {
        var m = {}; Object.keys(cfg.kelMap).forEach(function (k) { if (k.indexOf('__') === 0) m[k] = cfg.kelMap[k]; });
        $$('[data-kel]', root).forEach(function (s) { if (s.value) m[s.getAttribute('data-kel')] = s.value; });
        A.api('coretax.save', { kelMap: m }).then(function () { A.clearCache(); A.toast('Pemetaan disimpan.', 'good'); V.coretax(root); });
      };
      if ($('#ct-up')) {
        $('#ct-up').onclick = function () { $('#ct-f').click(); };
        $('#ct-f').onchange = function (e) {
          var f = e.target.files[0]; if (!f || !A.needXlsx()) return;
          A.fileToBuf(f).then(function (buf) {
            var res = A.readSheet(XLSX.read(buf, { type: 'array' }), ['coretax', 'pos'], ['kode', 'nama'], function (h) { return ['kode', 'nama', 'jenis', 'bagian', 'normal', 'urutan'].filter(function (k) { return h.indexOf(k) === 0; })[0] || ''; });
            return A.confirm(res.rows.length + ' pos terbaca. Daftar pos lama akan diganti dan pemetaan kelompok perlu diatur ulang. Lanjutkan?').then(function (ok) { if (ok) return A.api('coretax.save', { items: res.rows }); });
          }).then(function (d) { if (d) { A.clearCache(); A.toast('Daftar pos Coretax diperbarui.', 'good'); V.coretax(root); } }).catch(function (er) { A.toast(er.message, 'bad'); });
        };
      }
    });
  };

  A.toolbar = toolbar; A.bindToolbar = bindToolbar;
})();
