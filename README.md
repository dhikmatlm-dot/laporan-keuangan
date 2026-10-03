# Sistem Laporan Keuangan Klien

Unggah jurnal dari Excel, lalu dapatkan laporan keuangan lengkap, laporan pendukung, rekonsiliasi fiskal dan PPh Badan, laporan format Coretax, serta analisa AI siap cetak.

- **Backend**: Google Apps Script (`backend/`), data di Google Sheets dan Google Drive milik Super Admin.
- **Frontend**: halaman statis (`frontend/`) di GitHub Pages, masuk dengan akun Google.
- **AI**: Claude (Anthropic API), kunci API disimpan di server.

## Isi repositori

| Folder / file | Isi |
| --- | --- |
| `backend/Engine.gs` | Mesin laporan: neraca, laba rugi, perubahan ekuitas, arus kas (langsung dan tidak langsung), laporan pendukung, fiskal, Coretax, rasio |
| `backend/Journal.gs` | Validasi dan posting jurnal, deteksi duplikat, NDE, kunci periode, dokumen bukti |
| `backend/Clients.gs` | Klien, pengguna dan kuota, COA |
| `backend/Reports.gs`, `Ai.gs` | Penyusun laporan, aset tetap, rekening koran, pengaturan fiskal, narasi Claude |
| `backend/Api.gs`, `Auth.gs`, `Db.gs`, `Config.gs` | Pintu API, verifikasi login dan hak akses, akses tabel, skema dan `setup()` |
| `backend/DefaultCoa.gs` | COA bawaan (156 akun dari file Anda) beserta kelompok laporannya |
| `frontend/` | Aplikasi web: `index.html`, `config.js`, `css/`, `js/`, `assets/Template_Jurnal.xlsx` |
| `tools/` | Server lokal, tiruan layanan Google, data contoh, dan uji otomatis |
| `.github/workflows/` | Uji otomatis, deploy backend (clasp), deploy frontend (Pages) |

## Coba dulu di komputer sendiri (tanpa akun Google)

Butuh Node.js 18 atau lebih baru.

```bash
node tools/test-backend.js     # 72 uji otomatis
node tools/local-server.js     # lalu buka http://localhost:8787
```

Masuk sebagai `admin@demo.test` (Super Admin) atau `klien.a@demo.test` (Klien). Data contoh berisi jurnal Januari 2025 sampai September 2026 dan hilang saat server dimatikan. Narasi AI di mode lokal adalah teks contoh, bukan dari Claude.

## Pemasangan

### 1. Repositori GitHub

Buat repositori baru, lalu unggah seluruh isi folder ini (`git init`, `git add .`, `git commit`, `git push`). GitHub Pages gratis memerlukan repositori publik; tidak ada kunci rahasia di dalam kode.

### 2. Backend Apps Script

```bash
npm install -g @google/clasp
clasp login
clasp create --type standalone --title "Laporan Keuangan API" --rootDir backend
clasp push -f
```

Aktifkan dulu Apps Script API di <https://script.google.com/home/usersettings>. Setelah `clasp push`, buka editor (`clasp open`), pilih fungsi **`setup`**, tekan **Run**, dan setujui izin. `setup` membuat folder `LaporanKeuangan` di Drive, spreadsheet `MASTER`, dan mendaftarkan akun Anda sebagai Super Admin pertama.

Tanpa clasp: buat proyek di <https://script.new>, lalu salin setiap file di `backend/` (termasuk `appsscript.json` lewat Project Settings > Show manifest).

### 3. Login Google (OAuth Client ID)

1. Buka Google Cloud Console > APIs & Services > OAuth consent screen. Pilih **External**, isi nama aplikasi, lalu **Publish**.
2. Credentials > Create credentials > **OAuth client ID** > **Web application**.
3. Authorized JavaScript origins: `https://NAMAUSER.github.io` (tambahkan `http://localhost:8787` bila perlu).
4. Salin Client ID.

### 4. Script Properties

Di editor Apps Script: Project Settings > Script Properties.

| Kunci | Nilai |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Client ID dari langkah 3 |
| `ANTHROPIC_API_KEY` | Kunci API Claude dari console.anthropic.com |
| `CLAUDE_MODEL` | ID model Claude yang ingin dipakai (cek daftar terbaru di docs.claude.com) |
| `APP_URL` | Alamat frontend, dipakai di email pemberitahuan |

Jangan mengisi `DEV_MODE` di produksi.

### 5. Deploy web app

Deploy > New deployment > **Web app**. Execute as: **Me**. Who has access: **Anyone**. Salin URL berakhiran `/exec`.

Akses "Anyone" diperlukan agar frontend di GitHub Pages dapat memanggil API. Setiap permintaan tetap ditolak tanpa token login Google yang sah dan email yang terdaftar.

### 6. Frontend

Pilih salah satu:

- **Otomatis**: Settings > Pages > Source = **GitHub Actions**, lalu isi Variables `API_URL` dan `GOOGLE_CLIENT_ID` (Settings > Secrets and variables > Actions > Variables). Workflow `deploy-frontend.yml` menulis `config.js` dan menerbitkan halaman.
- **Manual**: isi `frontend/config.js`, lalu terbitkan folder `frontend/` di Pages.

### 7. Deploy otomatis backend (opsional)

Isi Secrets `CLASPRC_JSON` (isi `~/.clasprc.json`), `SCRIPT_ID`, dan `DEPLOYMENT_ID`. Setiap perubahan `backend/` di `main` diuji lalu dikirim ke Apps Script.

### 8. Mulai memakai

1. Buka alamat Pages, masuk dengan akun Super Admin.
2. **Klien & Pengguna**: tambah klien, lalu email penggunanya (maksimal 2; naikkan kuota untuk add-on).
3. **Daftar Akun**: sesuaikan COA klien bila perlu.
4. **Unggah Jurnal**: unduh template, isi, unggah.
5. **Laporan Keuangan** dan menu laporan lain langsung terisi.

## Aturan pengisian jurnal

- Satu baris satu sisi (kolom `DR/CR`), dengan `No Lawan Akun` sebagai akun pasangannya. Lawan akun dipakai untuk arus kas metode langsung.
- Jumlah debit dan kredit tiap `No Ref Dok` harus sama. Jika tidak, seluruh file ditolak.
- **Saldo awal** dimasukkan sebagai jurnal bertanggal hari terakhir sebelum periode pertama (misalnya 31/12/2025).
- **Jangan memposting jurnal penutup akhir tahun.** Laba tahun lalu otomatis masuk ke saldo laba.
- Tahun buku mengikuti tahun kalender.
- `Partner`, `No Invoice`, dan `TOP` pada akun piutang dan utang usaha membentuk daftar per invoice dan aging.
- `NDE` = `Y` menandai beban yang dikoreksi fiskal. Tanda ini juga dapat diklik di menu Jurnal & Bukti.

## Batasan yang perlu diketahui

- **Kapasitas**: satu spreadsheet Google menampung 10 juta sel. Dengan 19 kolom, satu klien muat sekitar 400.000 baris jurnal. Di atas itu, tahun lama perlu diarsipkan ke spreadsheet lain (belum otomatis).
- **Kecepatan**: setiap laporan membaca seluruh jurnal klien. Sampai puluhan ribu baris terasa beberapa detik; ratusan ribu baris bisa mendekati batas eksekusi Apps Script (6 menit).
- **Email pemberitahuan**: akun Gmail biasa dibatasi sekitar 100 email per hari.
- **Daftar pos Coretax** bawaan bersifat sementara. Unggah daftar pos sesuai formulir Coretax Anda di menu Format Coretax.
- **CaLK**: narasi kebijakan akuntansi adalah templat SAK Entitas Privat dan perlu ditinjau per klien.
- **Tarif PPh Badan** bawaan: 22%, fasilitas Pasal 31E sampai omzet Rp 50 miliar (bagian Rp 4,8 miliar), final UMKM 0,5%. Tarif dapat diubah per klien; periksa ketentuan yang berlaku.
- **Belum diuji di akun Google sungguhan.** Seluruh logika diuji dengan tiruan layanan Google di `tools/`. Uji ulang di proyek Apps Script percobaan sebelum dipakai klien.
