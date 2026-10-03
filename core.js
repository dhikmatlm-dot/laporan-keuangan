/* core.js — utilitas, pemanggil API, komponen tabel laporan, grafik SVG. */
(function () {
  'use strict';
  var CFG = window.APP_CONFIG || {};
  var S = { nav: 0, token: '', user: null, clients: [], clientId: '', periode: '', kelompok: [], cache: {} };
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  function esc(v) { return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n, dec) {
    if (n === null || n === undefined || n === '' || isNaN(n)) return '-';
    var v = Number(n), a = Math.abs(v).toLocaleString('id-ID', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
    if (Math.abs(v) < (dec ? 0.005 : 0.5)) return '-';
    return v < 0 ? '(' + a + ')' : a;
  }
  function short(n) {
    var a = Math.abs(n), s = n < 0 ? '-' : '';
    if (a >= 1e12) return s + (a / 1e12).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' T';
    if (a >= 1e9) return s + (a / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M';
    if (a >= 1e6) return s + (a / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
    if (a >= 1e3) return s + (a / 1e3).toLocaleString('id-ID', { maximumFractionDigits: 0 }) + ' rb';
    return s + a.toLocaleString('id-ID');
  }
  function pct(a, b) { if (!b) return null; return (a - b) / Math.abs(b); }
  function fmtPct(p) { if (p === null || p === undefined || isNaN(p)) return '-'; return (p * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '%'; }
  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  function ymLabel(ym) { return ym ? BULAN[Number(ym.substring(5, 7)) - 1] + ' ' + ym.substring(0, 4) : ''; }
  function ymShort(ym) { return BULAN[Number(ym.substring(5, 7)) - 1].substring(0, 3) + ' ' + ym.substring(2, 4); }
  function lastDay(ym) { return new Date(Date.UTC(Number(ym.substring(0, 4)), Number(ym.substring(5, 7)), 0)).getUTCDate(); }
  function tglLabel(ym) { return lastDay(ym) + ' ' + ymLabel(ym); }
  function dmy(iso) { return iso ? iso.substring(8, 10) + '/' + iso.substring(5, 7) + '/' + iso.substring(0, 4) : ''; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  function toast(msg, kind) {
    var d = document.createElement('div'); d.className = kind || ''; d.textContent = msg;
    $('#toast').appendChild(d); setTimeout(function () { d.remove(); }, kind === 'bad' ? 7000 : 3500);
  }
  var busyN = 0;
  function busy(on) { busyN += on ? 1 : -1; $('#busy').classList.toggle('hidden', busyN <= 0); }

  /* ---------- API ---------- */
  var READ = /(\.list|\.get|\.settings|\.validate)$/;
  function api(action, payload, opt) {
    opt = opt || {};
    var nav = S.nav, done = false;
    var end = function () { if (!done && !opt.silent) busy(false); done = true; };
    // jawaban baca-saja milik halaman yang sudah ditinggalkan diabaikan, agar tidak menimpa halaman baru
    var stale = function () { return READ.test(action) && nav !== S.nav; };
    if (!opt.silent) busy(true);
    return fetch(CFG.API_URL, {
      method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, token: S.token, clientId: opt.clientId || S.clientId, payload: payload || {} })
    }).then(function (r) { return r.json(); }).then(function (j) {
      end();
      if (!j.ok) throw new Error(j.error || 'Gagal');
      if (stale()) return new Promise(function () {});
      return j.data;
    }).catch(function (e) {
      end();
      if (stale()) return new Promise(function () {});
      if (!opt.quiet) toast(e.message === 'Failed to fetch' ? 'Tidak dapat menghubungi server. Periksa koneksi internet.' : e.message, 'bad');
      if (/Sesi berakhir|Belum masuk/.test(e.message)) App.logout(true);
      throw e;
    });
  }
  function clearCache() { S.cache = {}; }
  function report(bagian) {
    var key = S.clientId + '|' + S.periode + '|' + bagian.slice().sort().join(',');
    if (S.cache[key]) return Promise.resolve(S.cache[key]);
    return api('report.get', { periode: S.periode, bagian: bagian }).then(function (d) { S.cache[key] = d; return d; });
  }
  function client() { return S.clients.filter(function (c) { return c.id === S.clientId; })[0] || {}; }
  function isAdmin() { return S.user && S.user.role === 'SUPER_ADMIN'; }

  /* ---------- modal ---------- */
  function modal(html, opt) {
    opt = opt || {};
    var m = $('#modal');
    m.innerHTML = '<div class="box ' + (opt.wide ? 'wide' : '') + '">' + html + '</div>';
    m.classList.remove('hidden');
    m.onclick = function (e) { if (e.target === m && !opt.sticky) closeModal(); };
    return $('.box', m);
  }
  function closeModal() { $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; }
  function confirmBox(msg, okLabel) {
    return new Promise(function (res) {
      var b = modal('<h2>Konfirmasi</h2><p>' + esc(msg) + '</p><div class="foot"><button data-x="0">Batal</button><button class="primary" data-x="1">' + esc(okLabel || 'Ya, lanjutkan') + '</button></div>');
      b.onclick = function (e) { var x = e.target.getAttribute('data-x'); if (x !== null) { closeModal(); res(x === '1'); } };
    });
  }

  /* ---------- file ---------- */
  function fileToB64(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(',')[1] || ''); };
      r.onerror = rej; r.readAsDataURL(file);
    });
  }
  function fileToBuf(file) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsArrayBuffer(file); });
  }
  function needXlsx() { if (!window.XLSX) { toast('Pustaka Excel belum termuat. Periksa koneksi internet lalu muat ulang.', 'bad'); return false; } return true; }
  function serialToIso(v) {
    if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5).toISOString().substring(0, 10);
    if (v instanceof Date) return v.getFullYear() + '-' + ('0' + (v.getMonth() + 1)).slice(-2) + '-' + ('0' + v.getDate()).slice(-2);
    return String(v === null || v === undefined ? '' : v).trim();
  }
  /** Baca sheet menjadi baris objek berdasarkan peta judul kolom -> nama field. */
  function readSheet(wb, sheetNames, headerMust, mapFn) {
    var name = wb.SheetNames.filter(function (n) { return sheetNames.some(function (s) { return n.toLowerCase().indexOf(s) >= 0; }); })[0] || wb.SheetNames[0];
    var aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
    var hi = -1;
    for (var i = 0; i < Math.min(aoa.length, 30); i++) {
      var low = aoa[i].map(function (c) { return String(c).toLowerCase().replace(/\s+/g, ' ').trim(); });
      if (headerMust.every(function (h) { return low.some(function (c) { return c.indexOf(h) === 0; }); })) { hi = i; break; }
    }
    if (hi < 0) throw new Error('Baris judul kolom tidak ditemukan di sheet "' + name + '". Gunakan template yang disediakan.');
    var fields = aoa[hi].map(function (c) { return mapFn(String(c).toLowerCase().replace(/\s+/g, ' ').trim()); });
    var rows = [];
    for (var r = hi + 1; r < aoa.length; r++) {
      var o = {}, any = false;
      fields.forEach(function (f, c) { if (!f) return; var v = aoa[r][c]; if (v !== '' && v !== null && v !== undefined) any = true; o[f] = v; });
      if (any) { o._row = r + 1; rows.push(o); }
    }
    return { sheet: name, rows: rows };
  }

  /* ---------- tabel laporan ---------- */
  function numCell(v, cls) {
    var n = Number(v) || 0;
    return '<td class="num ' + (cls || '') + (n < -0.5 ? ' neg' : '') + '" data-t="n" data-v="' + (Math.round(n * 100) / 100) + '">' + fmt(n) + '</td>';
  }
  function pctCell(a, b) { var p = pct(a, b); return '<td class="num muted' + (p !== null && p < 0 ? ' neg' : '') + '">' + fmtPct(p) + '</td>'; }
  /**
   * st = {cols, rows}; kind 'flow' (laba rugi, arus kas) atau 'bal' (neraca).
   */
  function stmtTable(st, kind) {
    var keys = st.cols.map(function (c) { return c.key; }), has = function (k) { return keys.indexOf(k) >= 0; };
    var p = App.S.periode, pm = App.prevYm(p);
    var head = '<tr><th>Uraian</th>', layout = [];
    if (kind === 'bal') {
      head += '<th class="num">' + esc(tglLabel(p)) + '</th><th class="num">' + esc(tglLabel(pm)) + '</th><th class="num">Selisih</th><th class="num">%</th>';
      layout = [['v', 'cur'], ['v', 'prev'], ['d', 'cur', 'prev'], ['p', 'cur', 'prev']];
      if (has('ly')) { head += '<th class="num gap">' + esc(tglLabel(App.addYm(p, -12))) + '</th><th class="num">%</th>'; layout.push(['v', 'ly', 'gap'], ['p', 'cur', 'ly']); }
    } else {
      head += '<th class="num">' + esc(ymShort(p)) + '</th><th class="num">' + esc(ymShort(pm)) + '</th><th class="num">Selisih</th><th class="num">%</th>' +
        '<th class="num gap">YTD ' + esc(ymShort(p)) + '</th><th class="num">YTD ' + esc(ymShort(pm)) + '</th><th class="num">Selisih</th><th class="num">%</th>';
      layout = [['v', 'cur'], ['v', 'prev'], ['d', 'cur', 'prev'], ['p', 'cur', 'prev'], ['v', 'ytd', 'gap'], ['v', 'ytdPrev'], ['d', 'ytd', 'ytdPrev'], ['p', 'ytd', 'ytdPrev']];
      if (has('ly')) { head += '<th class="num gap">' + esc(ymShort(App.addYm(p, -12))) + '</th><th class="num">YTD ' + esc(ymShort(App.addYm(p, -12))) + '</th><th class="num">% YTD</th>'; layout.push(['v', 'ly', 'gap'], ['v', 'lyYtd'], ['p', 'ytd', 'lyYtd']); }
    }
    head += '</tr>';
    function cells(vals) {
      return layout.map(function (l) {
        if (l[0] === 'v') return numCell(vals[l[1]], l[2] || '');
        if (l[0] === 'd') return numCell((vals[l[1]] || 0) - (vals[l[2]] || 0));
        return pctCell(vals[l[1]] || 0, vals[l[2]] || 0);
      }).join('');
    }
    var body = st.rows.map(function (r, i) {
      if (!r.vals) return '<tr class="' + r.type + '"><td colspan="' + (layout.length + 1) + '">' + esc(r.label) + '</td></tr>';
      var hasD = r.detail && r.detail.length;
      var out = '<tr class="' + r.type + (hasD ? ' has-detail' : '') + '" data-i="' + i + '"><td>' + esc(r.label) + '</td>' + cells(r.vals) + '</tr>';
      if (hasD) out += r.detail.map(function (d) { return '<tr class="detail hidden" data-p="' + i + '"><td>' + esc((d.kode ? d.kode + '  ' : '') + d.nama) + '</td>' + cells(d.vals) + '</tr>'; }).join('');
      return out;
    }).join('');
    return '<div class="tbl-wrap"><table class="stmt"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
  }
  function bindStmt(root) {
    $$('table.stmt tr.has-detail', root).forEach(function (tr) {
      tr.firstChild.onclick = function () {
        tr.classList.toggle('open');
        $$('tr.detail[data-p="' + tr.getAttribute('data-i') + '"]', tr.parentNode).forEach(function (d) { d.classList.toggle('hidden'); });
      };
    });
  }
  /** Tabel umum: cols = [{k,label,num,fn}] */
  function table(cols, rows, foot) {
    var h = '<tr>' + cols.map(function (c) { return '<th class="' + (c.num ? 'num' : '') + '">' + esc(c.label) + '</th>'; }).join('') + '</tr>';
    var cell = function (c, r) {
      var v = c.fn ? c.fn(r) : r[c.k];
      if (c.html) return '<td>' + v + '</td>';
      return c.num ? numCell(v) : '<td>' + esc(v) + '</td>';
    };
    var b = rows.length ? rows.map(function (r) { return '<tr>' + cols.map(function (c) { return cell(c, r); }).join('') + '</tr>'; }).join('')
      : '<tr><td colspan="' + cols.length + '" class="empty">Tidak ada data pada periode ini.</td></tr>';
    var f = foot ? '<tfoot><tr>' + cols.map(function (c, i) { return i === 0 ? '<td>Jumlah</td>' : (foot[c.k] !== undefined ? numCell(foot[c.k]) : '<td></td>'); }).join('') + '</tr></tfoot>' : '';
    return '<div class="tbl-wrap"><table><thead>' + h + '</thead><tbody>' + b + '</tbody>' + f + '</table></div>';
  }
  function docHead(title, sub) {
    var c = client();
    return '<div class="doc-head"><div class="nm">' + esc(c.nama || '') + '</div><div class="tt">' + esc(title) + '</div><div class="pr">' + esc(sub || '') + '</div><div class="pr small">(dalam Rupiah)</div></div>';
  }

  /* ---------- ekspor ---------- */
  function exportExcel(root, fileName) {
    if (!needXlsx()) return;
    var wb = XLSX.utils.book_new(), n = 0;
    $$('table', root).forEach(function (t) {
      var clone = t.cloneNode(true);
      $$('.hidden', clone).forEach(function (x) { x.classList.remove('hidden'); });
      $$('td, th', clone).forEach(function (x) { if (!x.getAttribute('data-t')) x.setAttribute('data-t', 's'); });
      $$('.no-print', clone).forEach(function (x) { x.remove(); });
      var card = t.closest('[data-sheet]');
      var name = ((card && card.getAttribute('data-sheet')) || 'Laporan') + (n ? ' ' + (n + 1) : '');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.table_to_sheet(clone, { raw: false }), name.substring(0, 31).replace(/[\\\/?*\[\]:]/g, ' '));
      n++;
    });
    if (!n) return toast('Tidak ada tabel untuk diekspor.', 'bad');
    XLSX.writeFile(wb, fileName + '.xlsx');
  }
  function savePdfToDrive(root, fileName, jenis, landscape) {
    if (!window.html2pdf) return toast('Pustaka PDF belum termuat. Gunakan tombol Cetak lalu pilih "Simpan sebagai PDF".', 'bad');
    busy(true);
    $$('tr.detail.hidden', root).forEach(function (x) { x.setAttribute('data-was', '1'); x.classList.remove('hidden'); });
    return html2pdf().from(root).set({ margin: [10, 8, 10, 8], filename: fileName + '.pdf', pagebreak: { mode: ['css', 'legacy'], after: '.pb' },
      html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' } })
      .outputPdf('datauristring').then(function (uri) {
        $$('tr.detail[data-was]', root).forEach(function (x) { x.classList.add('hidden'); x.removeAttribute('data-was'); });
        return api('files.save', { periode: S.periode, jenis: jenis, nama: fileName + '.pdf', mime: 'application/pdf', b64: uri.split(',')[1] });
      }).then(function (f) { toast('PDF tersimpan di folder Drive klien.', 'good'); return f; })
      .finally(function () { busy(false); });
  }

  /* ---------- grafik SVG ---------- */
  var COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'];
  function niceMax(v) { if (v <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
  function tipAttr(title, lines) { return ' data-tip="' + esc(JSON.stringify({ t: title, l: lines })) + '"'; }
  /** Grafik batang berkelompok. data=[{label, vals:[..]}], series=[nama] */
  function barChart(data, series, opt) {
    opt = opt || {};
    var W = 640, H = opt.h || 240, L = 54, R = 10, T = 10, B = 28, iw = W - L - R, ih = H - T - B;
    var all = []; data.forEach(function (d) { d.vals.forEach(function (v) { all.push(v); }); });
    var mx = niceMax(Math.max.apply(null, all.concat([0]))), mn = Math.min.apply(null, all.concat([0]));
    mn = mn < 0 ? -niceMax(-mn) : 0;
    var y = function (v) { return T + ih - (v - mn) / (mx - mn) * ih; };
    var gw = iw / data.length, bw = Math.min(26, (gw - 10) / series.length - 2);
    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opt.title || '') + '">';
    for (var i = 0; i <= 4; i++) { var gv = mn + (mx - mn) * i / 4; s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(gv) + '" y2="' + y(gv) + '" stroke="' + (Math.abs(gv) < 1e-9 ? '#9aa5b1' : '#e6eaee') + '"/><text x="' + (L - 6) + '" y="' + (y(gv) + 4) + '" text-anchor="end">' + short(gv) + '</text>'; }
    data.forEach(function (d, gi) {
      var x0 = L + gi * gw + (gw - (bw + 2) * series.length + 2) / 2;
      d.vals.forEach(function (v, si) {
        var yy = Math.min(y(v), y(0)), hh = Math.max(1, Math.abs(y(v) - y(0)));
        s += '<rect x="' + (x0 + si * (bw + 2)) + '" y="' + yy + '" width="' + bw + '" height="' + hh + '" rx="3" fill="' + COLORS[si] + '"/>';
      });
      s += '<text x="' + (L + gi * gw + gw / 2) + '" y="' + (H - 9) + '" text-anchor="middle">' + esc(d.label) + '</text>';
      s += '<rect class="hit" x="' + (L + gi * gw) + '" y="' + T + '" width="' + gw + '" height="' + ih + '"' + tipAttr(d.full || d.label, series.map(function (n, si) { return n + ': ' + fmt(d.vals[si]); })) + '/>';
    });
    return legend(series) + s + '</svg>';
  }
  /** Grafik garis. data=[{label, vals:[..]}] */
  function lineChart(data, series, opt) {
    opt = opt || {};
    var W = 640, H = opt.h || 240, L = 54, R = 14, T = 10, B = 28, iw = W - L - R, ih = H - T - B;
    var all = []; data.forEach(function (d) { d.vals.forEach(function (v) { all.push(v); }); });
    var mx = niceMax(Math.max.apply(null, all.concat([0]))), mn = Math.min.apply(null, all.concat([0]));
    mn = mn < 0 ? -niceMax(-mn) : 0;
    var x = function (i) { return L + (data.length === 1 ? iw / 2 : i * iw / (data.length - 1)); }, y = function (v) { return T + ih - (v - mn) / (mx - mn) * ih; };
    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opt.title || '') + '">';
    for (var i = 0; i <= 4; i++) { var gv = mn + (mx - mn) * i / 4; s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(gv) + '" y2="' + y(gv) + '" stroke="' + (Math.abs(gv) < 1e-9 ? '#9aa5b1' : '#e6eaee') + '"/><text x="' + (L - 6) + '" y="' + (y(gv) + 4) + '" text-anchor="end">' + short(gv) + '</text>'; }
    series.forEach(function (n, si) {
      s += '<polyline fill="none" stroke="' + COLORS[si] + '" stroke-width="2" stroke-linejoin="round" points="' + data.map(function (d, i) { return x(i) + ',' + y(d.vals[si]); }).join(' ') + '"/>';
      var last = data.length - 1;
      s += '<circle cx="' + x(last) + '" cy="' + y(data[last].vals[si]) + '" r="4" fill="' + COLORS[si] + '" stroke="#fff" stroke-width="2"/>';
    });
    var step = Math.ceil(data.length / 12), bwid = iw / Math.max(1, data.length - 1);
    data.forEach(function (d, i) {
      if (i % step === 0) s += '<text x="' + x(i) + '" y="' + (H - 9) + '" text-anchor="middle">' + esc(d.label) + '</text>';
      s += '<rect class="hit" x="' + (x(i) - bwid / 2) + '" y="' + T + '" width="' + bwid + '" height="' + ih + '"' + tipAttr(d.full || d.label, series.map(function (n, si) { return n + ': ' + fmt(d.vals[si]); })) + '/>';
    });
    return legend(series) + s + '</svg>';
  }
  /** Batang mendatar satu seri, diurutkan. items=[{label,value}] */
  function hbarChart(items, opt) {
    opt = opt || {};
    var W = 640, rowH = 26, L = opt.labelW || 210, R = 80, H = items.length * rowH + 8, iw = W - L - R;
    var mx = Math.max.apply(null, items.map(function (i) { return Math.abs(i.value); }).concat([1]));
    var tot = items.reduce(function (t, i) { return t + i.value; }, 0);
    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opt.title || '') + '">';
    items.forEach(function (it, i) {
      var yy = 4 + i * rowH, w = Math.max(2, Math.abs(it.value) / mx * iw), lab = it.label.length > 32 ? it.label.substring(0, 31) + '…' : it.label;
      s += '<text x="' + (L - 8) + '" y="' + (yy + 15) + '" text-anchor="end">' + esc(lab) + '</text>' +
        '<rect x="' + L + '" y="' + (yy + 4) + '" width="' + w + '" height="16" rx="3" fill="' + (it.color || COLORS[opt.color || 0]) + '"/>' +
        '<text x="' + (L + w + 6) + '" y="' + (yy + 16) + '" style="fill:var(--ink)">' + short(it.value) + '</text>' +
        '<rect class="hit" x="0" y="' + yy + '" width="' + W + '" height="' + rowH + '"' + tipAttr(it.label, ['Rp ' + fmt(it.value), tot ? fmtPct(it.value / tot) + ' dari jumlah' : '']) + '/>';
    });
    return s + '</svg>';
  }
  function legend(series) {
    if (series.length < 2) return '';
    return '<div class="legend">' + series.map(function (n, i) { return '<span><i style="background:' + COLORS[i] + '"></i>' + esc(n) + '</span>'; }).join('') + '</div>';
  }
  function initTips() {
    var tip = $('#tip');
    document.addEventListener('mousemove', function (e) {
      var t = e.target.closest && e.target.closest('[data-tip]');
      if (!t) { tip.classList.add('hidden'); return; }
      var d = JSON.parse(t.getAttribute('data-tip'));
      tip.innerHTML = '<b>' + esc(d.t) + '</b>' + d.l.filter(Boolean).map(function (l) { return '<span>' + esc(l) + '</span>'; }).join('');
      tip.classList.remove('hidden');
      var x = e.clientX + 14, yy = e.clientY + 14;
      if (x + 270 > window.innerWidth) x = e.clientX - 270;
      tip.style.left = x + 'px'; tip.style.top = yy + 'px';
    });
  }

  window.App = {
    CFG: CFG, S: S, $: $, $$: $$, esc: esc, fmt: fmt, short: short, pct: pct, fmtPct: fmtPct, ymLabel: ymLabel, ymShort: ymShort, tglLabel: tglLabel, dmy: dmy, today: today,
    toast: toast, busy: busy, api: api, report: report, clearCache: clearCache, client: client, isAdmin: isAdmin, modal: modal, closeModal: closeModal, confirm: confirmBox,
    fileToB64: fileToB64, fileToBuf: fileToBuf, needXlsx: needXlsx, serialToIso: serialToIso, readSheet: readSheet,
    numCell: numCell, stmtTable: stmtTable, bindStmt: bindStmt, table: table, docHead: docHead, exportExcel: exportExcel, savePdfToDrive: savePdfToDrive,
    barChart: barChart, lineChart: lineChart, hbarChart: hbarChart, initTips: initTips, views: {},
    addYm: function (ym, n) { var y = Number(ym.substring(0, 4)), m = Number(ym.substring(5, 7)) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + ('0' + (m + 1)).slice(-2); },
    prevYm: function (ym) { return App.addYm(ym, -1); }
  };
})();
