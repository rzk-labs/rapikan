# Rapikan

PWA iPhone: tab **Langsung** = panduan Pintasan (Shortcuts) untuk akses langsung Foto/File + kompres + hapus asli; **file manager (Brankas)**, **bersih-bersih** (duplikat, foto mirip, screenshot, file terbesar), dan **kompres foto/video**.
Semua diproses di perangkat — tidak ada upload (dikunci dengan Content-Security-Policy `connect-src 'self'`).

- Live: https://rzk-labs.github.io/rapikan/
- Pasang: Safari → Bagikan → Tambah ke Layar Utama
- File statis tanpa build: `index.html`, `app.js`, `sw.js`, `manifest.webmanifest`
- Brankas = IndexedDB di HP. Kompres foto = canvas JPEG; video = canvas + MediaRecorder (real-time).
- Batasan iOS: app web tidak bisa menghapus langsung dari app Foto.
