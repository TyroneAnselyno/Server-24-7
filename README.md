# Surya Yoga Studio — Sistem AI Multi-Agent

Sistem otomasi berbasis AI untuk Surya Yoga Studio menggunakan arsitektur WAT (Workflows, Agents, Tools).

## Arsitektur

```
ai-system/
├── agents/
│   ├── adminAgent.js        ← Claude API — layanan pelanggan via Telegram
│   ├── marketingAgent.js    ← Claude API — konten promo & welcome
│   ├── financeAgent.js      ← Claude API — laporan keuangan & reminder bayar
│   └── purchasingAgent.js   ← Claude API — manajemen inventori & PO
├── learning/
│   └── weeklyEvaluator.js   ← Gemini API — evaluasi & perbaikan prompt mingguan
├── bot/
│   └── server.js            ← Express + Telegram Bot webhook server
├── utils/
│   └── sheetsUpdater.js     ← Google Sheets API utility
├── make-workflow.json        ← Definisi skenario Make.com
├── supabase-schema.sql       ← Schema database Supabase
├── .env.example              ← Template environment variables
└── package.json
```

## Teknologi

| Layer | Teknologi | Fungsi |
|-------|-----------|--------|
| Database | Supabase (PostgreSQL) | Simpan member, booking, transaksi, inventori, log AI |
| AI Utama | Claude API (claude-haiku-4-5) | 4 agent operasional |
| AI Evaluator | Gemini API (gemini-1.5-flash) | Self-learning mingguan |
| Komunikasi | Telegram Bot API | Chat dengan member & owner |
| Otomasi | Make.com | Trigger otomatis (webhook + jadwal) |
| Laporan | Google Sheets API | Tulis laporan mingguan |
| Runtime | Node.js + Express | Server webhook |
| Jadwal | node-cron | Cron jobs internal |

## Instalasi

### 1. Install dependencies

```bash
cd ai-system
npm install
```

### 2. Setup environment variables

```bash
cp .env.example .env
# Edit .env dengan nilai yang sebenarnya
```

### 3. Setup database Supabase

Jalankan `supabase-schema.sql` di Supabase SQL Editor.

### 4. Setup Google Sheets

1. Buat project di [Google Cloud Console](https://console.cloud.google.com)
2. Aktifkan Google Sheets API
3. Buat Service Account dan download credentials JSON
4. Simpan sebagai `credentials/service-account.json`
5. Share Google Sheet dengan email service account

### 5. Setup Telegram Bot

1. Chat [@BotFather](https://t.me/BotFather) di Telegram
2. Buat bot baru dengan `/newbot`
3. Simpan token ke `TELEGRAM_BOT_TOKEN` di `.env`
4. Cari Telegram ID kamu di [@userinfobot](https://t.me/userinfobot)
5. Simpan ke `TELEGRAM_OWNER_ID` di `.env`

### 6. Deploy server

Untuk produksi, deploy ke Railway / Render / VPS:

```bash
npm start
```

Server akan otomatis mendaftarkan Telegram webhook ke URL yang di-set di `WEBHOOK_URL`.

### 7. Setup Make.com (opsional)

Import skenario dari `make-workflow.json` ke Make.com untuk otomasi tambahan.

## Menjalankan Lokal (Development)

```bash
npm run dev
```

Server berjalan di `http://localhost:3001`. Gunakan [ngrok](https://ngrok.com) untuk expose ke internet agar Telegram webhook bisa terhubung:

```bash
ngrok http 3001
# Copy URL ngrok ke WEBHOOK_URL di .env
```

## Perintah Owner di Telegram

Kirim perintah ini ke bot dari akun owner (TELEGRAM_OWNER_ID):

| Perintah | Fungsi |
|----------|--------|
| `/laporan` | Laporan keuangan bulan ini |
| `/stok` | Status inventori (item yang perlu dipesan) |
| `/po` | Buat draft Purchase Order |
| `/reminder` | Kirim reminder pembayaran ke member yang menunggak |
| `/promo [tipe]` | Buat konten promosi (tipe: promo_bulanan, event, winback) |
| `/welcome` | Kirim pesan welcome ke member baru minggu ini |
| `/evaluasi` | Jalankan evaluasi AI mingguan secara manual |
| `/help` | Daftar semua perintah |

## Jadwal Otomatis

| Waktu | Tugas |
|-------|-------|
| Setiap hari 09:00 WIB | Kirim reminder pembayaran ke member yang menunggak |
| Senin 08:00 WIB | Alert stok rendah + buat PO jika diperlukan |
| Senin 08:00 WIB | Evaluasi AI mingguan dengan Gemini, update prompt |

## Self-Learning (weeklyEvaluator)

Setiap Senin, sistem membaca log interaksi AI seminggu terakhir dari tabel `ai_logs`, lalu menggunakan Gemini untuk:

1. Mengevaluasi kualitas respons setiap agent
2. Mengidentifikasi pola masalah yang berulang
3. Mengusulkan perbaikan system prompt
4. Secara otomatis mengupdate `ai_config` jika skor evaluasi ≥ 7
5. Menulis laporan ke Google Sheets dan tabel `weekly_reports`
6. Mengirim ringkasan ke owner via Telegram

Jalankan manual:
```bash
npm run evaluate
```

## Struktur Database

Lihat `supabase-schema.sql` untuk schema lengkap. Tabel utama:

- `members` — data member studio
- `classes` — jadwal kelas
- `bookings` — reservasi kelas
- `transactions` — transaksi keuangan
- `inventory` — stok perlengkapan
- `ai_logs` — log setiap interaksi AI (input, output, outcome, rating)
- `ai_config` — system prompt setiap agent (bisa diupdate oleh evaluator)
- `weekly_reports` — ringkasan laporan mingguan

## Keamanan

- Semua secrets disimpan di `.env` (jangan di-commit ke git)
- `.env` sudah ada di `.gitignore`
- Server hanya menerima Telegram webhook dari path dengan secret token
- Google Sheets menggunakan Service Account (bukan OAuth personal)
- Supabase menggunakan Service Role Key hanya di server (tidak di frontend)

## Troubleshooting

**Bot tidak merespons:**
- Cek `TELEGRAM_BOT_TOKEN` benar
- Cek server berjalan dan WEBHOOK_URL bisa diakses publik
- Cek log dengan `npm run dev`

**Google Sheets error:**
- Pastikan file `credentials/service-account.json` ada
- Pastikan Google Sheet sudah di-share ke email service account
- Pastikan Google Sheets API diaktifkan di Google Cloud Console

**Gemini evaluasi gagal:**
- Cek `GEMINI_API_KEY` valid
- Gemini 1.5 Flash tersedia di free tier dengan limit tertentu

**Supabase error:**
- Cek `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY`
- Pastikan tabel sudah dibuat dengan `supabase-schema.sql`
