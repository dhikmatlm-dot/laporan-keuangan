/* app.js — masuk, navigasi, dan pemilihan klien/periode. */
(function () {
  'use strict';
  var A = window.App, S = A.S, $ = A.$, esc = A.esc;
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* abaikan */ } },
    sget: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, sset: function (k, v) { try { v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) { /* abaikan */ } } };

  var NAV = [
    { grp: 'Ringkasan' },
    { id: 'dashboard', label: 'Dashboard' },
    { grp: 'Transaksi' },
    { id: 'unggah', label: 'Unggah Jurnal' },
    { id: 'jurnal', label: 'Jurnal & Bukti' },
    { id: 'coa', label: 'Daftar Akun (COA)' },
    { grp: 'Laporan' },
    { id: 'laporan', label: 'Laporan Keuangan' },
    { id: 'pendukung', label: 'Laporan Pendukung' },
    { id: 'fiskal', label: 'Rekonsiliasi Fiskal & PPh' },
    { id: 'coretax', label: 'Format Coretax' },
    { id: 'analisa', label: 'Analisa AI' },
    { grp: 'Pengaturan' },
    { id: 'profil', label: 'Profil Perusahaan' },
    { id: 'periode', label: 'Periode & Arsip' },
    { id: 'klien', label: 'Klien & Pengguna', admin: true },
    { id: 'log', label: 'Log Audit', admin: true }
  ];

  function showLogin(msg) {
    $('#app').classList.add('hidden'); $('#login').classList.remove('hidden');
    $('#login-msg').textContent = msg || '';
    if (A.CFG.DEV_LOGIN) {
      $('#dev-login').classList.remove('hidden');
      $('#dev-go').onclick = function () { enter('dev:' + $('#dev-email').value.trim()); };
      return;
    }
    var tryInit = function (n) {
      if (window.google && google.accounts && google.accounts.id) {
        google.accounts.id.initialize({ client_id: A.CFG.GOOGLE_CLIENT_ID, callback: function (r) { enter(r.credential); }, auto_select: false });
        google.accounts.id.renderButton($('#g-btn'), { theme: 'outline', size: 'large', text: 'signin_with', locale: 'id', width: 300 });
      } else if (n < 40) setTimeout(function () { tryInit(n + 1); }, 250);
      else $('#login-msg').textContent = 'Tombol masuk Google gagal dimuat. Periksa koneksi internet.';
    };
    tryInit(0);
  }

  function enter(token) {
    S.token = token;
    A.api('session', {}, { quiet: true }).then(function (d) {
      store.sset('lk_token', token);
      S.user = d.user; S.clients = d.clients; S.kelompok = d.kelompok;
      var saved = store.get('lk_client');
      S.clientId = S.clients.some(function (c) { return c.id === saved; }) ? saved : (S.clients[0] ? S.clients[0].id : '');
      var now = new Date(), def = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2);
      S.periode = store.get('lk_periode') || def;
      $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
      renderShell();
      if (!location.hash) location.hash = A.isAdmin() && !S.clients.length ? '#/klien' : '#/dashboard';
      route();
    }).catch(function (e) { S.token = ''; store.sset('lk_token', null); showLogin(e.message); });
  }

  A.logout = function (expired) {
    S.token = ''; S.user = null; store.sset('lk_token', null);
    try { if (window.google && google.accounts) google.accounts.id.disableAutoSelect(); } catch (e) { /* abaikan */ }
    showLogin(expired ? 'Sesi berakhir. Silakan masuk kembali.' : '');
  };

  function renderShell() {
    $('#nav').innerHTML = NAV.filter(function (n) { return !n.admin || A.isAdmin(); }).map(function (n) {
      return n.grp ? '<div class="grp">' + esc(n.grp) + '</div>' : '<a href="#/' + n.id + '" data-id="' + n.id + '">' + esc(n.label) + '</a>';
    }).join('');
    $('#who').innerHTML = '<b>' + esc(S.user.nama || S.user.email) + '</b>' + esc(S.user.email) + '<br><span class="badge">' + (A.isAdmin() ? 'Super Admin' : 'Klien') + '</span><br><button id="out">Keluar</button>';
    $('#out').onclick = function () { A.logout(false); };
    renderTop();
  }
  function renderTop() {
    var sel = $('#sel-client');
    sel.innerHTML = S.clients.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.id + ' — ' + c.nama) + '</option>'; }).join('');
    sel.value = S.clientId; sel.disabled = !A.isAdmin();
    sel.onchange = function () { S.clientId = sel.value; store.set('lk_client', S.clientId); S.coa = null; A.clearCache(); route(); };
    var per = $('#sel-periode'); per.value = S.periode;
    per.onchange = function () { if (!per.value) return; S.periode = per.value; store.set('lk_periode', S.periode); route(); };
    $('#per-prev').onclick = function () { S.periode = A.addYm(S.periode, -1); per.value = S.periode; store.set('lk_periode', S.periode); route(); };
    $('#per-next').onclick = function () { S.periode = A.addYm(S.periode, 1); per.value = S.periode; store.set('lk_periode', S.periode); route(); };
  }
  A.refreshClients = function () {
    return A.api('session', {}).then(function (d) { S.clients = d.clients; if (!S.clientId && S.clients[0]) S.clientId = S.clients[0].id; renderTop(); });
  };
  A.coa = function (force) {
    if (S.coa && !force) return Promise.resolve(S.coa);
    return A.api('coa.list').then(function (rows) { S.coa = rows; return rows; });
  };

  function route() {
    if (!S.user) return;
    var id = (location.hash || '#/dashboard').replace('#/', '').split('?')[0];
    var item = NAV.filter(function (n) { return n.id === id; })[0];
    if (!item || (item.admin && !A.isAdmin())) { id = 'dashboard'; }
    A.$$('#nav a').forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-id') === id); });
    var v = $('#view');
    v.className = '';
    if (!S.clientId && id !== 'klien' && id !== 'log') { v.innerHTML = '<div class="card empty">Belum ada klien. ' + (A.isAdmin() ? 'Buka menu <a href="#/klien">Klien &amp; Pengguna</a> untuk menambah klien pertama.' : '') + '</div>'; return; }
    S.nav++;
    window.scrollTo(0, 0);
    // setiap navigasi mendapat wadah baru; halaman lama yang terlambat selesai menulis ke wadah yang sudah dilepas
    var holder = document.createElement('div'), nav = S.nav;
    v.innerHTML = '<div class="empty" id="loading">Memuat…</div>';
    v.appendChild(holder);
    var obs = new MutationObserver(function () { obs.disconnect(); var l = document.getElementById('loading'); if (l && nav === S.nav) l.remove(); });
    obs.observe(holder, { childList: true });
    Promise.resolve().then(function () { return A.views[id](holder); }).catch(function (e) {
      if (nav === S.nav) { obs.disconnect(); v.innerHTML = '<div class="note bad">' + esc(e.message || e) + '</div>'; }
    });
  }
  A.route = route;

  window.addEventListener('hashchange', route);
  window.addEventListener('DOMContentLoaded', function () {
    A.initTips();
    document.title = A.CFG.APP_NAME || 'Laporan Keuangan';
    $('#login-title').textContent = A.CFG.APP_NAME || 'Sistem Laporan Keuangan';
    $('#login-sub').textContent = A.CFG.KONSULTAN || '';
    $('#side-brand').textContent = A.CFG.APP_SHORT || 'Laporan Keuangan';
    var t = store.sget('lk_token');
    if (t) enter(t); else showLogin('');
  });
})();
