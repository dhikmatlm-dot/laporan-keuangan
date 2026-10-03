/* views-data.js — klien, pengguna, COA, unggah jurnal, jurnal & bukti, periode, log, profil. */
(function () {
  'use strict';
  var A = window.App, S = A.S, $ = A.$, $$ = A.$$, esc = A.esc, fmt = A.fmt, V = A.views;

  function formVals(root) {
    var o = {};
    $$('[name]', root).forEach(function (el) { o[el.name] = el.type === 'checkbox' ? el.checked : el.value; });
    return o;
  }
  function kelOptions(sel) {
    return S.kelompok.map(function (k) { return '<option value="' + k.kode + '"' + (k.kode === sel ? ' selected' : '') + '>' + esc(k.label) + '</option>'; }).join('');
  }
  function kelInfo(kode) { return S.kelompok.filter(function (k) { return k.kode === kode; })[0] || { label: kode, tipe: '' }; }

  /* ================= KLIEN & PENGGUNA ================= */
  V.klien = function (root) {
    return Promise.all([A.api('clients.list'), A.api('users.list', {})]).then(function (r) {
      var clients = r[0], users = r[1];
      S.clients = clients;
      root.innerHTML = '<div class="page-head"><div><h1>Klien &amp; Pengguna</h1><p>Setiap klien mendapat folder Drive dan basis data sendiri. Kuota bawaan 2 email per klien; naikkan kuota untuk add-on pengguna.</p></div>' +
        '<div class="actions"><button class="primary" id="add-c">+ Klien baru</button><button id="add-a">+ Super Admin</button></div></div>' +
        '<div class="card"><h2>Daftar klien (' + clients.length + ')</h2>' + A.table([
          { k: 'id', label: 'Kode' }, { k: 'nama', label: 'Nama' }, { k: 'pimpinan', label: 'Pimpinan' }, { k: 'kerangkaSak', label: 'Kerangka' },
          { label: 'Pengguna', html: true, fn: function (c) { return '<span class="badge ' + (c.jumlahUser >= c.kuotaUser ? 'warn' : '') + '">' + c.jumlahUser + ' / ' + c.kuotaUser + '</span>'; } },
          { label: 'Status', html: true, fn: function (c) { return c.aktif === 'N' ? '<span class="badge bad">Nonaktif</span>' : '<span class="badge good">Aktif</span>'; } },
          { label: '', html: true, fn: function (c) { return '<button class="link" data-edit="' + esc(c.id) + '">Ubah</button><button class="link" data-user="' + esc(c.id) + '">+ Pengguna</button>'; } }
        ], clients) + '</div>' +
        '<div class="card"><h2>Pengguna (' + users.length + ')</h2>' + A.table([
          { k: 'email', label: 'Email' }, { k: 'nama', label: 'Nama' },
          { label: 'Peran', html: true, fn: function (u) { return u.role === 'SUPER_ADMIN' ? '<span class="badge good">Super Admin</span>' : '<span class="badge">Klien</span>'; } },
          { label: 'Klien', fn: function (u) { var c = clients.filter(function (x) { return x.id === u.clientId; })[0]; return c ? c.id + ' — ' + c.nama : ''; } },
          { label: '', html: true, fn: function (u) { return '<button class="link danger" data-del="' + esc(u.email) + '">Hapus</button>'; } }
        ], users) + '</div>';
      $('#add-c').onclick = function () { clientForm({}); };
      $('#add-a').onclick = function () { userForm({ role: 'SUPER_ADMIN' }, clients); };
      root.onclick = function (e) {
        var t = e.target, id;
        if ((id = t.getAttribute('data-edit'))) clientForm(clients.filter(function (c) { return c.id === id; })[0]);
        else if ((id = t.getAttribute('data-user'))) userForm({ role: 'CLIENT', clientId: id }, clients);
        else if ((id = t.getAttribute('data-del'))) A.confirm('Hapus pengguna ' + id + '?').then(function (ok) { if (ok) A.api('users.remove', { email: id }).then(function () { A.toast('Pengguna dihapus.', 'good'); V.klien(root); }); });
      };
    });
  };
  function clientForm(c) {
    var f = function (name, label, val, cls) { return '<label class="' + (cls || '') + '">' + label + '<input name="' + name + '" value="' + esc(val || '') + '"></label>'; };
    var b = A.modal('<h2>' + (c.id ? 'Ubah klien ' + esc(c.id) : 'Klien baru') + '</h2><div class="form">' +
      f('nama', 'Nama perusahaan', c.nama, 'full') + f('npwp', 'NPWP', c.npwp) + f('bidangUsaha', 'Bidang usaha', c.bidangUsaha) +
      f('alamat', 'Alamat', c.alamat, 'full') + f('kota', 'Kota', c.kota) +
      '<label>Kerangka pelaporan<select name="kerangkaSak">' + ['SAK Entitas Privat', 'SAK (umum)', 'SAK EMKM'].map(function (k) { return '<option' + (c.kerangkaSak === k ? ' selected' : '') + '>' + k + '</option>'; }).join('') + '</select></label>' +
      f('pimpinan', 'Nama pimpinan', c.pimpinan) + f('jabatan', 'Jabatan', c.jabatan || 'Direktur') +
      '<label>Kuota pengguna (2 + add-on)<input name="kuotaUser" type="number" min="2" value="' + (c.kuotaUser || 2) + '"></label>' +
      '<label>Status<select name="aktif"><option value="Y">Aktif</option><option value="N"' + (c.aktif === 'N' ? ' selected' : '') + '>Nonaktif</option></select></label>' +
      '</div><div class="foot"><button id="x">Batal</button><button class="primary" id="ok">Simpan</button></div>');
    $('#x', b).onclick = A.closeModal;
    $('#ok', b).onclick = function () {
      var p = formVals(b); p.id = c.id;
      A.api('clients.save', p).then(function () { A.closeModal(); A.toast('Klien disimpan.', 'good'); return A.refreshClients(); }).then(function () { V.klien($('#view')); });
    };
  }
  function userForm(u, clients) {
    var b = A.modal('<h2>Tambah pengguna</h2><div class="form">' +
      '<label class="full">Email akun Google<input name="email" type="email" placeholder="nama@gmail.com"></label>' +
      '<label>Nama<input name="nama"></label>' +
      '<label>Peran<select name="role"><option value="CLIENT">Klien</option><option value="SUPER_ADMIN"' + (u.role === 'SUPER_ADMIN' ? ' selected' : '') + '>Super Admin</option></select></label>' +
      '<label class="full">Klien<select name="clientId"><option value="">—</option>' + clients.map(function (c) { return '<option value="' + c.id + '"' + (c.id === u.clientId ? ' selected' : '') + '>' + esc(c.id + ' — ' + c.nama) + '</option>'; }).join('') + '</select></label>' +
      '</div><div class="foot"><button id="x">Batal</button><button class="primary" id="ok">Simpan</button></div>');
    $('#x', b).onclick = A.closeModal;
    $('#ok', b).onclick = function () { A.api('users.save', formVals(b)).then(function () { A.closeModal(); A.toast('Pengguna disimpan.', 'good'); V.klien($('#view')); }); };
  }

  /* ================= PROFIL ================= */
  V.profil = function (root) {
    return A.api('client.get').then(function (c) {
      var f = function (name, label, val, cls, ro) { return '<label class="' + (cls || '') + '">' + label + '<input name="' + name + '" value="' + esc(val || '') + '"' + (ro ? ' disabled' : '') + '></label>'; };
      root.innerHTML = '<div class="page-head"><div><h1>Profil Perusahaan</h1><p>Nama pimpinan dan jabatan dipakai di Surat Pernyataan Manajemen dan Catatan atas Laporan Keuangan.</p></div></div>' +
        '<div class="card" style="max-width:760px"><div class="form">' + f('nama', 'Nama perusahaan', c.nama, 'full', true) +
        f('pimpinan', 'Nama pimpinan', c.pimpinan) + f('jabatan', 'Jabatan', c.jabatan) + f('npwp', 'NPWP', c.npwp) + f('bidangUsaha', 'Bidang usaha', c.bidangUsaha) +
        f('alamat', 'Alamat', c.alamat, 'full') + f('kota', 'Kota', c.kota) + f('kerangkaSak', 'Kerangka pelaporan', c.kerangkaSak, '', true) +
        '</div><div class="actions" style="margin-top:16px"><button class="primary" id="ok">Simpan profil</button>' +
        (c.folderId ? '<a class="btn" target="_blank" rel="noopener" href="https://drive.google.com/drive/folders/' + esc(c.folderId) + '">Buka folder Drive klien</a>' : '') + '</div></div>';
      $('#ok').onclick = function () {
        var p = formVals(root);
        A.api('client.saveProfile', p).then(function () { A.toast('Profil disimpan.', 'good'); A.clearCache(); return A.refreshClients(); });
      };
    });
  };

  /* ================= COA ================= */
  V.coa = function (root) {
    return Promise.all([A.coa(true), A.api('coretax.get')]).then(function (r) {
      var coa = r[0], items = r[1].items;
      root.innerHTML = '<div class="page-head"><div><h1>Daftar Akun (COA)</h1><p>Kolom <b>Kelompok</b> menentukan letak akun di setiap laporan. Akun dapat ditambah, diubah, dihapus, atau diunggah dari Excel.</p></div>' +
        '<div class="actions"><input id="q" placeholder="Cari kode atau nama…"><button id="imp">Unggah COA (Excel)</button><input type="file" id="imp-f" accept=".xlsx,.xls,.csv" class="hidden"><button class="primary" id="add">+ Akun</button></div></div>' +
        '<div class="card" id="list"></div>';
      function draw() {
        var q = $('#q').value.toLowerCase();
        var rows = coa.filter(function (a) { return !q || (a.kode + ' ' + a.nama).toLowerCase().indexOf(q) >= 0; });
        $('#list').innerHTML = A.table([
          { k: 'kode', label: 'Kode' }, { k: 'nama', label: 'Nama akun' }, { k: 'normal', label: 'Normal' }, { k: 'pos', label: 'Pos' },
          { label: 'Kelompok laporan', fn: function (a) { return kelInfo(a.kelompok).label; } },
          { label: 'NDE bawaan', html: true, fn: function (a) { return a.ndeDefault === 'Y' ? '<span class="badge warn">NDE</span>' : ''; } },
          { label: 'Pos Coretax', fn: function (a) { var it = items.filter(function (i) { return i.kode === a.coretax; })[0]; return it ? it.kode + ' ' + it.nama : (a.coretax || '(ikut kelompok)'); } },
          { label: '', html: true, fn: function (a) { return '<button class="link" data-e="' + esc(a.kode) + '">Ubah</button><button class="link danger" data-d="' + esc(a.kode) + '">Hapus</button>'; } }
        ], rows);
      }
      draw();
      $('#q').oninput = draw;
      $('#add').onclick = function () { coaForm({}, items, root); };
      $('#imp').onclick = function () { $('#imp-f').click(); };
      $('#imp-f').onchange = function (e) { var f = e.target.files[0]; if (f) importCoa(f, root); e.target.value = ''; };
      $('#list').onclick = function (e) {
        var k;
        if ((k = e.target.getAttribute('data-e'))) coaForm(coa.filter(function (a) { return a.kode === k; })[0], items, root);
        else if ((k = e.target.getAttribute('data-d'))) A.confirm('Hapus akun ' + k + '? Akun yang sudah dipakai di jurnal tidak dapat dihapus.').then(function (ok) {
          if (ok) A.api('coa.delete', { kode: k }).then(function () { A.toast('Akun dihapus.', 'good'); A.clearCache(); V.coa(root); });
        });
      };
    });
  };
  function coaForm(a, items, root) {
    var b = A.modal('<h2>' + (a.kode ? 'Ubah akun ' + esc(a.kode) : 'Akun baru') + '</h2><div class="form">' +
      '<label>Kode akun<input name="kode" value="' + esc(a.kode || '') + '"></label>' +
      '<label>Saldo normal<select name="normal"><option value="">(otomatis)</option><option value="DR"' + (a.normal === 'DR' ? ' selected' : '') + '>DR</option><option value="CR"' + (a.normal === 'CR' ? ' selected' : '') + '>CR</option></select></label>' +
      '<label class="full">Nama akun<input name="nama" value="' + esc(a.nama || '') + '"></label>' +
      '<label class="full">Kelompok laporan<select name="kelompok"><option value="">(tebak otomatis dari kode dan nama)</option>' + kelOptions(a.kelompok) + '</select></label>' +
      '<label>Pos / Unpos<select name="pos"><option>Y</option><option' + (a.pos === 'N' ? ' selected' : '') + '>N</option></select></label>' +
      '<label>NDE bawaan<select name="ndeDefault"><option value="">Tidak</option><option value="Y"' + (a.ndeDefault === 'Y' ? ' selected' : '') + '>Ya — otomatis dicentang NDE</option></select></label>' +
      '<label class="full">Pos Coretax<select name="coretax"><option value="">(ikut pemetaan kelompok)</option>' + items.map(function (i) { return '<option value="' + esc(i.kode) + '"' + (i.kode === a.coretax ? ' selected' : '') + '>' + esc(i.kode + ' — ' + i.nama) + '</option>'; }).join('') + '</select></label>' +
      '</div><div class="foot"><button id="x">Batal</button><button class="primary" id="ok">Simpan</button></div>');
    $('#x', b).onclick = A.closeModal;
    $('#ok', b).onclick = function () {
      var p = formVals(b); p.kodeLama = a.kode || '';
      A.api('coa.save', p).then(function () { A.closeModal(); A.toast('Akun disimpan.', 'good'); A.clearCache(); V.coa(root); });
    };
  }
  function importCoa(file, root) {
    if (!A.needXlsx()) return;
    A.fileToBuf(file).then(function (buf) {
      var wb = XLSX.read(buf, { type: 'array' });
      var res = A.readSheet(wb, ['coa', 'akun'], ['ref', 'nama'], function (h) {
        if (h === 'ref' || h.indexOf('kode') === 0 || h === 'no akun') return 'kode';
        if (h.indexOf('nama') === 0) return 'nama';
        if (h === 'normal') return 'normal';
        if (h.indexOf('pos') === 0) return 'pos';
        if (h.indexOf('kelompok') === 0) return 'kelompok';
        if (h.indexOf('nde') === 0) return 'ndeDefault';
        if (h.indexOf('coretax') === 0) return 'coretax';
        return '';
      });
      var rows = res.rows.filter(function (r) { return r.kode !== '' && r.nama; }).map(function (r) { r.kode = String(r.kode).trim(); return r; });
      var b = A.modal('<h2>Unggah COA</h2><p>' + rows.length + ' akun terbaca dari sheet "' + esc(res.sheet) + '".</p>' +
        '<div class="form"><label class="full">Cara impor<select name="mode"><option value="GABUNG">Gabung — tambah akun baru dan perbarui akun yang kodenya sama</option><option value="GANTI">Ganti — COA lama diganti seluruhnya dengan isi file</option></select></label></div>' +
        '<div class="foot"><button id="x">Batal</button><button class="primary" id="ok">Impor</button></div>');
      $('#x', b).onclick = A.closeModal;
      $('#ok', b).onclick = function () {
        A.api('coa.import', { rows: rows, mode: formVals(b).mode }).then(function (d) { A.closeModal(); A.toast('COA diimpor: ' + d.jumlah + ' akun.', 'good'); A.clearCache(); V.coa(root); });
      };
    }).catch(function (e) { A.toast(e.message, 'bad'); });
  }

  /* ================= DUPLIKAT (dipakai unggah dan jurnal manual) ================= */
  function dupHtml(dups) {
    if (!dups.length) return '';
    return '<div class="note warn"><b>' + dups.length + ' jurnal terindikasi ganda.</b> Tentukan untuk tiap jurnal: benar dan dilanjutkan, atau salah satunya dihapus.</div>' +
      A.table([
        { k: 'ref', label: 'No Ref baru' }, { label: 'Tanggal', fn: function (d) { return A.dmy(d.tanggal); } }, { k: 'total', label: 'Nilai', num: true }, { k: 'pesan', label: 'Temuan' },
        { label: 'Keputusan', html: true, fn: function (d) {
          return '<select data-dup="' + esc(d.ref) + '"><option value="">— pilih —</option><option value="LANJUT">Benar, posting keduanya</option>' +
            '<option value="LEWATI">Hapus yang baru (tidak diposting)</option><option value="GANTI">Hapus yang lama, posting yang baru</option></select>';
        } }
      ], dups);
  }
  function dupDecisions(root, dups) {
    var o = {}, miss = false;
    dups.forEach(function (d) { var el = $('[data-dup="' + (window.CSS && CSS.escape ? CSS.escape(d.ref) : d.ref) + '"]', root); o[d.ref] = el ? el.value : ''; if (!o[d.ref]) miss = true; });
    return miss ? null : o;
  }

  /* ================= UNGGAH JURNAL ================= */
  var HEAD_J = function (h) {
    if (h === 'no') return 'no';
    if (h.indexOf('tanggal') === 0) return 'tanggal';
    if (h.indexOf('partner') === 0) return 'partner';
    if (h.indexOf('no invoice') === 0) return 'invoice';
    if (h === 'top') return 'top';
    if (h.indexOf('no ref') === 0) return 'ref';
    if (h === 'no akun') return 'akun';
    if (h.indexOf('no lawan') === 0) return 'lawan';
    if (h.indexOf('deskripsi') === 0 || h.indexOf('keterangan') === 0) return 'deskripsi';
    if (h.indexOf('value ori') === 0) return 'valueOri';
    if (h.indexOf('mata uang') === 0) return 'mataUang';
    if (h === 'kurs') return 'kurs';
    if (h.indexOf('dr/cr') === 0 || h === 'd/k') return 'dc';
    if (h === 'nilai') return 'nilai';
    if (h === 'nde') return 'nde';
    return '';
  };
  V.unggah = function (root) {
    var state = { rows: null, file: null, val: null };
    root.innerHTML = '<div class="page-head"><div><h1>Unggah Jurnal</h1><p>Unggah file Excel sesuai sheet <b>Jurnal Input</b>. Debit dan kredit setiap No Ref Dok harus sama; jika tidak, jurnal tidak dapat diposting.</p></div>' +
      '<div class="actions"><a class="btn" href="assets/Template_Jurnal.xlsx" download>Unduh template Excel</a></div></div>' +
      '<div class="card"><label class="drop" id="drop"><input type="file" id="file" accept=".xlsx,.xls"><b>Klik atau seret file Excel ke sini</b><br><span class="small muted">Format .xlsx — kolom: Tanggal, Partner, No Invoice, TOP, No Ref Dok, No Akun, No Lawan Akun, Deskripsi, Value Original, Mata Uang, Kurs, DR/CR, Nilai, NDE</span></label></div>' +
      '<div id="result"></div><div class="card"><h2>Riwayat unggahan</h2><div id="hist"></div></div>';
    var drop = $('#drop');
    drop.ondragover = function (e) { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = function () { drop.classList.remove('over'); };
    drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) take(e.dataTransfer.files[0]); };
    $('#file').onchange = function (e) { if (e.target.files[0]) take(e.target.files[0]); e.target.value = ''; };

    function take(file) {
      if (!A.needXlsx()) return;
      A.fileToBuf(file).then(function (buf) {
        var res = A.readSheet(XLSX.read(buf, { type: 'array' }), ['jurnal'], ['tanggal', 'no akun'], HEAD_J);
        state.rows = res.rows.map(function (r) { r.tanggal = A.serialToIso(r.tanggal); r.no = r._row; delete r._row; return r; });
        state.file = file;
        return A.api('journal.validate', { rows: state.rows });
      }).then(showVal).catch(function (e) { $('#result').innerHTML = '<div class="note bad">' + esc(e.message) + '</div>'; });
    }
    function showVal(v) {
      state.val = v;
      var r = v.ringkasan, h = '<div class="card"><h2>Hasil pemeriksaan: ' + esc(state.file.name) + '</h2>' +
        '<div class="grid g4" style="margin-bottom:12px"><div class="kpi"><div class="lb">Jurnal (No Ref)</div><div class="vl">' + fmt(r.jurnal) + '</div></div><div class="kpi"><div class="lb">Baris</div><div class="vl">' + fmt(r.baris) + '</div></div>' +
        '<div class="kpi"><div class="lb">Total debit</div><div class="vl">' + A.short(r.totalDebit) + '</div></div><div class="kpi"><div class="lb">Status</div><div class="vl">' +
        (v.errors.length ? '<span class="badge bad">' + v.errors.length + ' kesalahan</span>' : '<span class="badge good">Siap diposting</span>') + '</div></div></div>';
      if (v.errors.length) h += '<div class="note bad">File ditolak. Perbaiki kesalahan berikut di Excel lalu unggah ulang.</div>' +
        A.table([{ k: 'baris', label: 'Baris Excel' }, { k: 'pesan', label: 'Kesalahan' }], v.errors.slice(0, 300));
      if (v.warnings.length) h += '<h3>Peringatan (' + v.warnings.length + ') — tidak menghalangi posting</h3>' + A.table([{ k: 'baris', label: 'Baris Excel' }, { k: 'pesan', label: 'Peringatan' }], v.warnings.slice(0, 100));
      h += dupHtml(v.duplicates);
      if (!v.errors.length) h += '<div class="actions" style="margin-top:14px"><button class="primary" id="post">Posting ' + r.jurnal + ' jurnal</button><button id="cancel">Batal</button></div>';
      h += '</div>';
      $('#result').innerHTML = h;
      if ($('#cancel')) $('#cancel').onclick = function () { $('#result').innerHTML = ''; };
      if ($('#post')) $('#post').onclick = function () {
        var kep = dupDecisions($('#result'), v.duplicates);
        if (!kep) return A.toast('Tentukan keputusan untuk semua jurnal yang terindikasi ganda.', 'bad');
        A.fileToB64(state.file).then(function (b64) {
          return A.api('journal.post', { rows: state.rows, keputusan: kep, sumber: 'UPLOAD', fileName: state.file.name, mime: state.file.type, b64: b64 });
        }).then(function (d) {
          A.clearCache();
          $('#result').innerHTML = '<div class="note good"><b>Berhasil diposting:</b> ' + d.jurnal + ' jurnal, ' + d.baris + ' baris.' +
            (d.dilewati.length ? ' Dilewati: ' + esc(d.dilewati.join(', ')) + '.' : '') + (d.diganti.length ? ' Jurnal lama diganti: ' + esc(d.diganti.join(', ')) + '.' : '') +
            ' <a href="#/laporan">Lihat laporan keuangan</a></div>';
          hist();
        });
      };
    }
    function hist() {
      return A.api('uploads.list').then(function (rows) {
        $('#hist').innerHTML = A.table([
          { label: 'Waktu', fn: function (u) { return u.at.substring(0, 16).replace('T', ' '); } }, { k: 'by', label: 'Oleh' },
          { label: 'Sumber', html: true, fn: function (u) { return '<span class="badge">' + esc(u.sumber) + '</span>' + (u.role === 'CLIENT' ? ' <span class="badge warn">klien</span>' : ''); } },
          { label: 'File', html: true, fn: function (u) { return u.fileUrl ? '<a target="_blank" rel="noopener" href="' + esc(u.fileUrl) + '">' + esc(u.fileName) + '</a>' : esc(u.fileName || '-'); } },
          { k: 'jurnal', label: 'Jurnal', num: true }, { k: 'baris', label: 'Baris', num: true }, { k: 'total', label: 'Total debit', num: true },
          { label: 'Status', html: true, fn: function (u) { return u.status === 'POSTED' ? '<span class="badge good">Diposting</span>' : '<span class="badge bad">Dibatalkan</span>'; } },
          { label: '', html: true, fn: function (u) { return A.isAdmin() && u.status === 'POSTED' ? '<button class="link danger" data-rb="' + esc(u.id) + '">Batalkan</button>' : ''; } }
        ], rows);
      });
    }
    $('#hist').onclick = function (e) {
      var id = e.target.getAttribute('data-rb');
      if (id) A.confirm('Batalkan unggahan ini? Semua baris jurnal dari unggahan tersebut dihapus.').then(function (ok) {
        if (ok) A.api('uploads.rollback', { uploadId: id }).then(function (d) { A.toast(d.deleted + ' baris dihapus.', 'good'); A.clearCache(); hist(); });
      });
    };
    return hist();
  };

  /* ================= JURNAL & BUKTI ================= */
  V.jurnal = function (root) {
    var st = { rows: [], docs: {}, sel: '', coa: [], locked: false };
    root.innerHTML = '<div class="page-head"><div><h1>Jurnal &amp; Bukti Transaksi</h1><p>Centang <b>NDE</b> pada baris beban yang tidak dapat dikurangkan secara fiskal. Pilih sebuah jurnal untuk mengunggah dokumen bukti di panel kanan.</p></div>' +
      '<div class="actions"><input id="q" placeholder="Cari ref, akun, partner…"><label class="small"><input type="checkbox" id="only-nde"> Hanya NDE</label><button class="primary" id="add">+ Jurnal manual</button></div></div>' +
      '<div class="split"><div class="card" id="list"></div><div class="side-panel" id="panel"></div></div>';
    function accName(k) { var a = st.coa.filter(function (x) { return x.kode === k; })[0]; return a ? a.nama : ''; }
    function accIsPL(k) { var a = st.coa.filter(function (x) { return x.kode === k; })[0]; var t = a ? kelInfo(a.kelompok).tipe : ''; return t === 'R' || t === 'X'; }
    function load() {
      return Promise.all([A.coa(), A.api('journal.list', { periode: S.periode })]).then(function (r) {
        st.coa = r[0]; st.rows = r[1].rows; st.docs = r[1].docs; st.locked = r[1].terkunci; st.total = r[1].total; draw(); panel();
      });
    }
    function draw() {
      var q = $('#q').value.toLowerCase(), only = $('#only-nde').checked;
      var rows = st.rows.filter(function (j) { return (!only || j.nde === 'Y') && (!q || (j.ref + ' ' + j.deskripsi + ' ' + j.partner + ' ' + j.invoice + ' ' + j.akun + ' ' + accName(j.akun)).toLowerCase().indexOf(q) >= 0); });
      var td = 0, tk = 0, last = null;
      var body = rows.map(function (j) {
        var first = j.ref !== last; last = j.ref;
        var d = j.dc === 'DR' ? j.nilai : 0, k = j.dc === 'CR' ? j.nilai : 0; td += d; tk += k;
        return '<tr class="clickable ' + (first ? 'jr-first ' : '') + (j.ref === st.sel ? 'sel' : '') + '" data-ref="' + esc(j.ref) + '">' +
          '<td class="nw">' + (first ? A.dmy(j.tanggal) : '') + '</td><td>' + (first ? '<b>' + esc(j.ref) + '</b>' + (st.docs[j.ref] ? ' <span class="badge good" title="Dokumen bukti">' + st.docs[j.ref] + ' bukti</span>' : '') + (j.sumber === 'MANUAL' ? ' <span class="badge">manual</span>' : '') : '') + '</td>' +
          '<td>' + esc(j.akun) + ' <span class="muted">' + esc(accName(j.akun)) + '</span></td><td>' + esc(j.partner) + (j.invoice ? '<br><span class="small muted">' + esc(j.invoice) + '</span>' : '') + '</td><td>' + esc(j.deskripsi) + '</td>' +
          A.numCell(d) + A.numCell(k) + '<td class="center">' + (accIsPL(j.akun) ? '<input type="checkbox" data-nde="' + esc(j.id) + '"' + (j.nde === 'Y' ? ' checked' : '') + (st.locked ? ' disabled' : '') + ' title="Non-deductible expense">' : '') + '</td></tr>';
      }).join('');
      $('#list').innerHTML = (st.locked ? '<div class="note warn">Periode ' + esc(A.ymLabel(S.periode)) + ' sudah dikunci; jurnal tidak dapat diubah.</div>' : '') +
        '<div class="tbl-wrap"><table class="jr"><thead><tr><th>Tanggal</th><th>No Ref Dok</th><th>Akun</th><th>Partner</th><th>Deskripsi</th><th class="num">Debit</th><th class="num">Kredit</th><th class="center">NDE</th></tr></thead><tbody>' +
        (body || '<tr><td colspan="8" class="empty">Belum ada jurnal pada ' + esc(A.ymLabel(S.periode)) + '.</td></tr>') + '</tbody>' +
        '<tfoot><tr><td colspan="5">Jumlah (' + rows.length + ' baris' + (st.total > st.rows.length ? ', ditampilkan ' + st.rows.length + ' dari ' + st.total : '') + ')</td>' + A.numCell(td) + A.numCell(tk) + '<td></td></tr></tfoot></table></div>';
    }
    function panel() {
      var p = $('#panel');
      if (!st.sel) { p.innerHTML = '<div class="card"><h2>Bukti transaksi</h2><p class="muted">Pilih salah satu jurnal di tabel untuk melihat rincian dan mengunggah dokumen bukti (faktur, kuitansi, bukti transfer).</p></div>'; return; }
      var ls = st.rows.filter(function (j) { return j.ref === st.sel; });
      if (!ls.length) { st.sel = ''; return panel(); }
      p.innerHTML = '<div class="card"><h2>' + esc(st.sel) + '</h2><div class="small muted">' + A.dmy(ls[0].tanggal) + ' · ' + esc(ls[0].by) + '</div><p>' + esc(ls[0].deskripsi) + '</p>' +
        '<table>' + ls.map(function (j) { return '<tr><td>' + esc(j.akun) + '<br><span class="small muted">' + esc(accName(j.akun)) + '</span></td><td class="num">' + (j.dc === 'DR' ? fmt(j.nilai) : '') + '</td><td class="num">' + (j.dc === 'CR' ? fmt(j.nilai) : '') + '</td></tr>'; }).join('') + '</table>' +
        (st.locked ? '' : '<div class="actions" style="margin-top:10px"><button class="danger" id="del-ref">Hapus jurnal ini</button></div>') + '</div>' +
        '<div class="card"><h2>Dokumen bukti</h2><div id="docs" class="muted small">Memuat…</div>' +
        '<label class="drop" style="margin-top:10px;padding:14px"><input type="file" id="doc-f" multiple><b>+ Unggah dokumen</b><br><span class="small muted">PDF, gambar, Excel — maks. 10 MB per file. Tersimpan di folder Drive klien.</span></label></div>';
      var ref = st.sel;
      A.api('docs.list', { ref: ref }, { silent: true }).then(function (docs) {
        if (ref !== st.sel) return;
        $('#docs').innerHTML = docs.length ? docs.map(function (d) { return '<div class="doc-item"><a target="_blank" rel="noopener" href="' + esc(d.url) + '">' + esc(d.nama) + '</a><button class="link danger" data-rm="' + esc(d.id) + '">Hapus</button></div>'; }).join('') : 'Belum ada dokumen.';
      });
      $('#doc-f').onchange = function (e) {
        var files = Array.prototype.slice.call(e.target.files), i = 0;
        (function next() {
          if (i >= files.length) { A.toast('Dokumen tersimpan.', 'good'); return load(); }
          var f = files[i++];
          if (f.size > 10 * 1024 * 1024) { A.toast(f.name + ' melebihi 10 MB.', 'bad'); return next(); }
          A.fileToB64(f).then(function (b64) { return A.api('docs.upload', { ref: ref, nama: f.name, mime: f.type, b64: b64 }); }).then(next);
        })();
      };
      if ($('#del-ref')) $('#del-ref').onclick = function () {
        A.confirm('Hapus jurnal ' + ref + ' (' + ls.length + ' baris)?').then(function (ok) { if (ok) A.api('journal.deleteRef', { ref: ref }).then(function () { st.sel = ''; A.clearCache(); A.toast('Jurnal dihapus.', 'good'); load(); }); });
      };
      $('#docs').onclick = function (e) { var id = e.target.getAttribute('data-rm'); if (id) A.api('docs.remove', { id: id }).then(load); };
    }
    $('#q').oninput = draw; $('#only-nde').onchange = draw;
    $('#list').onclick = function (e) {
      var nd = e.target.getAttribute('data-nde');
      if (nd) {
        var chk = e.target.checked;
        A.api('journal.setNde', { id: nd, nde: chk }).then(function () {
          st.rows.forEach(function (j) { if (j.id === nd) j.nde = chk ? 'Y' : ''; }); A.clearCache();
          A.toast(chk ? 'Ditandai NDE — masuk koreksi fiskal.' : 'Tanda NDE dilepas.', 'good');
        }).catch(function () { e.target.checked = !chk; });
        return;
      }
      var tr = e.target.closest('tr[data-ref]');
      if (tr) { st.sel = tr.getAttribute('data-ref'); draw(); panel(); }
    };
    $('#add').onclick = function () { manualForm(st.coa, load); };
    return load();
  };

  function manualForm(coa, done) {
    var opts = coa.map(function (a) { return '<option value="' + esc(a.kode) + '">' + esc(a.nama) + '</option>'; }).join('');
    var line = function () { return '<tr><td><input list="dl-coa" class="ak" placeholder="Kode akun" style="width:110px"></td><td class="nm small muted"></td><td><input class="db num" inputmode="decimal" style="width:130px"></td><td><input class="kr num" inputmode="decimal" style="width:130px"></td><td class="center"><input type="checkbox" class="nd"></td><td><button class="link danger rm">×</button></td></tr>'; };
    var b = A.modal('<h2>Jurnal manual</h2><div class="form" style="grid-template-columns:repeat(3,minmax(0,1fr))">' +
      '<label>Tanggal<input type="date" name="tanggal" value="' + (S.periode === A.today().substring(0, 7) ? A.today() : S.periode + '-01') + '"></label><label>No Ref Dok<input name="ref" placeholder="mis. JM-001"></label><label>TOP (hari)<input name="top" type="number" min="0"></label>' +
      '<label>Partner<input name="partner"></label><label>No Invoice<input name="invoice"></label><label>Deskripsi<input name="deskripsi"></label></div>' +
      '<datalist id="dl-coa">' + opts + '</datalist>' +
      '<div class="tbl-wrap" style="margin-top:14px"><table><thead><tr><th>Akun</th><th>Nama</th><th class="num">Debit</th><th class="num">Kredit</th><th class="center">NDE</th><th></th></tr></thead><tbody id="ml">' + line() + line() + '</tbody>' +
      '<tfoot><tr><td colspan="2"><button class="link" id="more">+ Tambah baris</button></td><td class="num" id="td">-</td><td class="num" id="tk">-</td><td colspan="2" id="bal"></td></tr></tfoot></table></div>' +
      '<div id="m-msg"></div><div class="foot"><button id="x">Batal</button><button class="primary" id="ok">Periksa &amp; posting</button></div>', { wide: true, sticky: true });
    var num = function (v) { v = String(v || '').replace(/\./g, '').replace(',', '.'); return Number(v) || 0; };
    function recalc() {
      var d = 0, k = 0;
      $$('#ml tr', b).forEach(function (tr) {
        var a = coa.filter(function (x) { return x.kode === $('.ak', tr).value.trim(); })[0];
        $('.nm', tr).textContent = a ? a.nama : '';
        d += num($('.db', tr).value); k += num($('.kr', tr).value);
      });
      $('#td', b).textContent = fmt(d); $('#tk', b).textContent = fmt(k);
      $('#bal', b).innerHTML = Math.abs(d - k) < 0.5 && d > 0 ? '<span class="badge good">Seimbang</span>' : '<span class="badge bad">Selisih ' + fmt(d - k) + '</span>';
    }
    b.oninput = recalc;
    $('#more', b).onclick = function () { $('#ml', b).insertAdjacentHTML('beforeend', line()); };
    $('#ml', b).onclick = function (e) { if (e.target.classList.contains('rm')) { e.target.closest('tr').remove(); recalc(); } };
    $('#x', b).onclick = A.closeModal;
    $('#ok', b).onclick = function () {
      var h = formVals(b), lines = [];
      $$('#ml tr', b).forEach(function (tr) {
        var ak = $('.ak', tr).value.trim(), d = num($('.db', tr).value), k = num($('.kr', tr).value);
        if (!ak && !d && !k) return;
        lines.push({ akun: ak, dc: d ? 'DR' : 'CR', nilai: d || k, nde: $('.nd', tr).checked ? 'Y' : 'N' });
      });
      var drs = lines.filter(function (l) { return l.dc === 'DR'; }), crs = lines.filter(function (l) { return l.dc === 'CR'; });
      var rows = lines.map(function (l, i) {
        var opp = l.dc === 'DR' ? crs : drs;
        return { no: i + 1, tanggal: h.tanggal, ref: h.ref, partner: h.partner, invoice: h.invoice, top: h.top, deskripsi: h.deskripsi, akun: l.akun,
          lawan: opp.length === 1 ? opp[0].akun : '', dc: l.dc, nilai: l.nilai, valueOri: l.nilai, mataUang: 'IDR', kurs: 1, nde: l.nde };
      });
      A.api('journal.validate', { rows: rows, sumber: 'MANUAL' }).then(function (v) {
        if (v.errors.length) { $('#m-msg', b).innerHTML = '<div class="note bad" style="margin-top:12px">' + v.errors.map(function (e) { return esc(e.pesan); }).join('<br>') + '</div>'; return; }
        if (v.duplicates.length && !$('[data-dup]', b)) { $('#m-msg', b).innerHTML = '<div style="margin-top:12px">' + dupHtml(v.duplicates) + '</div>'; return; }
        var kep = dupDecisions(b, v.duplicates);
        if (!kep) return A.toast('Tentukan keputusan untuk jurnal yang terindikasi ganda.', 'bad');
        return A.api('journal.post', { rows: rows, sumber: 'MANUAL', keputusan: kep }).then(function (d) {
          A.closeModal(); A.clearCache(); A.toast(d.jurnal ? 'Jurnal manual diposting.' : 'Jurnal dilewati.', 'good'); done();
        });
      });
    };
  }

  /* ================= PERIODE & ARSIP ================= */
  V.periode = function (root) {
    return Promise.all([A.api('period.list'), A.api('files.list', {})]).then(function (r) {
      root.innerHTML = '<div class="page-head"><div><h1>Periode &amp; Arsip</h1><p>Periode yang dikunci tidak dapat ditambah, diubah, atau dihapus jurnalnya.</p></div></div>' +
        '<div class="card"><h2>Status periode</h2>' + A.table([
          { label: 'Periode', fn: function (p) { return A.ymLabel(p.periode); } }, { k: 'baris', label: 'Baris jurnal', num: true },
          { label: 'Status', html: true, fn: function (p) { return p.status === 'LOCKED' ? '<span class="badge bad">Terkunci</span>' : '<span class="badge good">Terbuka</span>'; } },
          { label: 'Diubah oleh', fn: function (p) { return p.by ? p.by + ' · ' + p.at.substring(0, 10) : ''; } },
          { label: '', html: true, fn: function (p) { return !A.isAdmin() ? '' : '<button class="link" data-p="' + p.periode + '" data-s="' + (p.status === 'LOCKED' ? 'OPEN' : 'LOCKED') + '">' + (p.status === 'LOCKED' ? 'Buka kembali' : 'Kunci') + '</button>'; } }
        ], r[0]) + '</div>' +
        '<div class="card"><h2>Arsip laporan di Drive</h2>' + A.table([
          { label: 'Waktu', fn: function (f) { return f.at.substring(0, 16).replace('T', ' '); } }, { label: 'Periode', fn: function (f) { return f.periode ? A.ymLabel(f.periode) : ''; } }, { k: 'jenis', label: 'Jenis' },
          { label: 'File', html: true, fn: function (f) { return '<a target="_blank" rel="noopener" href="' + esc(f.url) + '">' + esc(f.nama) + '</a>'; } }, { k: 'by', label: 'Oleh' }
        ], r[1]) + '</div>';
      root.onclick = function (e) {
        var p = e.target.getAttribute('data-p');
        if (p) A.api('period.set', { periode: p, status: e.target.getAttribute('data-s') }).then(function () { A.toast('Status periode diperbarui.', 'good'); V.periode(root); });
      };
    });
  };

  /* ================= LOG AUDIT ================= */
  V.log = function (root) {
    return A.api('audit.list', { limit: 500 }).then(function (rows) {
      root.innerHTML = '<div class="page-head"><div><h1>Log Audit</h1><p>500 aktivitas terakhir dari semua klien. Aksi oleh pengguna klien ditandai.</p></div><div class="actions"><input id="q" placeholder="Saring email, klien, aksi…"></div></div><div class="card" id="list"></div>';
      function draw() {
        var q = $('#q').value.toLowerCase();
        $('#list').innerHTML = A.table([
          { label: 'Waktu', fn: function (r) { return r.ts.substring(0, 19).replace('T', ' '); } }, { k: 'email', label: 'Pengguna' },
          { label: 'Peran', html: true, fn: function (r) { return r.role === 'CLIENT' ? '<span class="badge warn">Klien</span>' : '<span class="badge">' + esc(r.role || '-') + '</span>'; } },
          { k: 'clientId', label: 'Klien' },
          { label: 'Aksi', html: true, fn: function (r) { return /DITOLAK|ERROR|GAGAL/.test(r.action) ? '<span class="badge bad">' + esc(r.action) + '</span>' : esc(r.action); } },
          { label: 'Rincian', fn: function (r) { return String(r.detail).substring(0, 160); } }
        ], rows.filter(function (r) { return !q || (r.email + ' ' + r.clientId + ' ' + r.action + ' ' + r.detail).toLowerCase().indexOf(q) >= 0; }));
      }
      draw(); $('#q').oninput = draw;
    });
  };

  A.formVals = formVals; A.kelInfo = kelInfo;
})();
