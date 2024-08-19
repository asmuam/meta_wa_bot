# Membangun Bot WhatsApp dengan Node.js dan Python

Panduan ini akan membimbing Anda dalam proses pembuatan bot WhatsApp menggunakan Node.js dan Python.

## Daftar Isi

- [Prasyarat](#prasyarat)
- [Pengenalan Node.js](#pengenalan-nodejs)
- [Pengenalan Python](#pengenalan-python)
- [AI Handler](#ai-handler)
- [Masalah](#masalah)

## Prasyarat

Sebelum memulai, pastikan Anda telah mempersiapkan hal-hal berikut:

- Node.js
- Python
- Kunci API Gemini AI

## Pengenalan Node.js

Terdapat dua file utama dalam proyek ini yaitu `server-wpp.js` dan `server.py`:

### server-webhook.js
kode lama yang sejatinya ingin digunakan jika memakai cloud-api dari facebook

### server-wpp.js

File ini berisi kode JavaScript yang menggunakan pustaka WPPConnect untuk berkomunikasi dengan WhatsApp. WPPConnect memanfaatkan Puppeteer untuk merekayasa WhatsApp Web pada sistem.

Untuk memulai, jalankan perintah berikut:

```bash
npm install // install dependensi
npm run start // jalankan program
```

Anda akan melihat QR code atau kode pairing pada terminal. Pindai QR code tersebut atau masukkan kode pairing ke aplikasi WhatsApp untuk melakukan sinkronisasi.

Pastikan untuk mengubah nomor HP bot pada file `.env`.

Whatsapp Bot Siap Menerima Pesan!

### server.py

File ini adalah aplikasi Flask yang menangani POST request untuk meminta prompt yang akan dimasukkan ke dalam handler Node.js dengan Gemini AI. Flask memanfaatkan ChromaDB untuk menyimpan data. Data yang digunakan adalah teks yang diparse dari file PDF (tersedia pada folder `pdfs`).

Untuk memulai, jalankan perintah berikut:

- Install dependensi Python: `pip install -r requirements.txt`
- Jalankan server Flask: `python server.py`

```bash
pip install -r requirements.txt ## install dependensi
python server.py ## menjalankan server
```

### AI Handler
sesuaikan url post pada [aiHandlers.js](./aiHandlers.js)

## Masalah

Jika Anda mengalami masalah, Anda dapat membaca dokumentasi berikut untuk bantuan terkait ChromaDB:

- [Masalah terkait ChromaDB](https://github.com/chroma-core/chroma/issues/189#issuecomment-1454418844)
