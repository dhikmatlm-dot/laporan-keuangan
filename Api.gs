/**
 * Api.gs — satu pintu masuk untuk frontend.
 * Permintaan: POST { action, token, clientId, payload }  (Content-Type: text/plain agar bebas preflight CORS)
 * Jawaban   : { ok:true, data } atau { ok:false, error }
 *
 * admin : hanya Super Admin
 * scope : aksi butuh klien (clientId diturunkan dari pengguna bila perannya CLIENT)
 * log   : dicatat di log audit
 */
var ROUTES = {
  'session':            { fn: 'apiSession' },
  'clients.list':       { fn: 'apiClientsList', admin: true },
  'clients.save':       { fn: 'apiClientsSave', admin: true, log: true },
  'client.get':         { fn: 'apiClientGet', scope: true },
  'client.saveProfile': { fn: 'apiClientSaveProfile', scope: true, log: true },
  'users.list':         { fn: 'apiUsersList', admin: true },
  'users.save':         { fn: 'apiUsersSave', admin: true, log: true },
  'users.remove':       { fn: 'apiUsersRemove', admin: true, log: true },
  'coa.list':           { fn: 'apiCoaList', scope: true },
  'coa.save':           { fn: 'apiCoaSave', scope: true, log: true },
  'coa.delete':         { fn: 'apiCoaDelete', scope: true, log: true },
  'coa.import':         { fn: 'apiCoaImport', scope: true, log: true },
  'journal.validate':   { fn: 'apiJournalValidate', scope: true },
  'journal.post':       { fn: 'apiJournalPost', scope: true, log: true },
  'journal.list':       { fn: 'apiJournalList', scope: true },
  'journal.setNde':     { fn: 'apiJournalSetNde', scope: true, log: true },
  'journal.deleteRef':  { fn: 'apiJournalDeleteRef', scope: true, log: true },
  'uploads.list':       { fn: 'apiUploadsList', scope: true },
  'uploads.rollback':   { fn: 'apiUploadsRollback', scope: true, admin: true, log: true },
  'docs.list':          { fn: 'apiDocsList', scope: true },
  'docs.upload':        { fn: 'apiDocsUpload', scope: true, log: true },
  'docs.remove':        { fn: 'apiDocsRemove', scope: true, log: true },
  'period.list':        { fn: 'apiPeriodList', scope: true },
  'period.set':         { fn: 'apiPeriodSet', scope: true, admin: true, log: true },
  'report.get':         { fn: 'apiReportGet', scope: true },
  'assets.list':        { fn: 'apiAssetsList', scope: true },
  'assets.save':        { fn: 'apiAssetsSave', scope: true, log: true },
  'assets.delete':      { fn: 'apiAssetsDelete', scope: true, log: true },
  'bank.import':        { fn: 'apiBankImport', scope: true, log: true },
  'bank.clear':         { fn: 'apiBankClear', scope: true, log: true },
  'fiscal.settings':    { fn: 'apiFiscalSettings', scope: true },
  'fiscal.saveSettings':{ fn: 'apiFiscalSaveSettings', scope: true, admin: true, log: true },
  'fiscal.saveAdj':     { fn: 'apiFiscalSaveAdj', scope: true, log: true },
  'fiscal.deleteAdj':   { fn: 'apiFiscalDeleteAdj', scope: true, log: true },
  'coretax.get':        { fn: 'apiCoretaxGet' },
  'coretax.save':       { fn: 'apiCoretaxSave', admin: true, log: true },
  'ai.list':            { fn: 'apiAiList', scope: true },
  'ai.generate':        { fn: 'apiAiGenerate', scope: true, admin: true, log: true },
  'ai.save':            { fn: 'apiAiSave', scope: true, admin: true, log: true },
  'files.save':         { fn: 'apiFilesSave', scope: true, log: true },
  'files.list':         { fn: 'apiFilesList', scope: true },
  'audit.list':         { fn: 'apiAuditList', admin: true }
};

function doGet() {
  return json_({ ok: true, data: { app: APP_NAME, status: 'aktif' } });
}

function doPost(e) {
  var user = null, req = {};
  try {
    req = JSON.parse(e.postData.contents || '{}');
    var route = ROUTES[req.action];
    if (!route) fail_('Aksi tidak dikenal: ' + req.action);
    user = authenticate_(req.token);
    if (route.admin && !isAdmin_(user)) {
      audit_(user, user.clientId, 'AKSES_DITOLAK', req.action);
      fail_('Aksi ini hanya untuk Super Admin.');
    }
    var client = route.scope ? resolveClient_(user, req.clientId) : null;
    var data = globalThis[route.fn](req.payload || {}, user, client);
    if (route.log) audit_(user, client ? client.id : '', req.action, summarize_(req.payload));
    return json_({ ok: true, data: data });
  } catch (err) {
    if (!err.userError) audit_(user, req.clientId || '', 'ERROR', req.action + ': ' + (err && err.stack || err));
    return json_({ ok: false, error: err.userError ? err.message : 'Terjadi kesalahan di server: ' + err.message });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/** Ringkas payload untuk log (tanpa isi file dan tanpa daftar baris panjang). */
function summarize_(p) {
  var o = {};
  Object.keys(p || {}).forEach(function (k) {
    var v = p[k];
    if (k === 'b64') o[k] = '(file)';
    else if (Array.isArray(v)) o[k] = '(' + v.length + ' baris)';
    else if (v && typeof v === 'object') o[k] = '(objek)';
    else o[k] = String(v).substring(0, 120);
  });
  return JSON.stringify(o);
}

function apiSession(p, user) {
  var out = { user: user, kelompok: Object.keys(KELOMPOK).map(function (k) { return { kode: k, label: KELOMPOK[k].label, tipe: KELOMPOK[k].tipe }; }) };
  if (isAdmin_(user)) out.clients = apiClientsList();
  else out.clients = [publicClient_(resolveClient_(user, user.clientId))];
  return out;
}

function apiAuditList(p) {
  var rows = readTable_(prop_('MASTER_ID'), 'Audit');
  if (p.clientId) rows = rows.filter(function (r) { return r.clientId === p.clientId; });
  return rows.slice(-Math.min(Number(p.limit) || 500, 2000)).reverse();
}
