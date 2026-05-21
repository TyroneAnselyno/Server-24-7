-- ============================================================
-- SURYA YOGA STUDIO — AI System Database Schema
-- Jalankan di Supabase SQL Editor
-- ============================================================

-- 1. MEMBERS
CREATE TABLE IF NOT EXISTS members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama        TEXT NOT NULL,
  phone       TEXT,
  telegram_id TEXT UNIQUE,
  email       TEXT UNIQUE,
  status      TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','nonaktif','trial')),
  paket       TEXT NOT NULL DEFAULT 'bulanan' CHECK (paket IN ('bulanan','tahunan','per-kelas','trial')),
  tanggal_daftar TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. CLASSES
CREATE TABLE IF NOT EXISTS classes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama        TEXT NOT NULL,
  instruktur  TEXT NOT NULL,
  hari        TEXT NOT NULL,
  jam_mulai   TIME NOT NULL,
  jam_selesai TIME NOT NULL,
  kapasitas   INT NOT NULL DEFAULT 20,
  tipe        TEXT NOT NULL CHECK (tipe IN ('Hatha','Vinyasa','Yin','Power','Ashtanga')),
  harga       BIGINT NOT NULL DEFAULT 0,
  aktif       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. BOOKINGS
CREATE TABLE IF NOT EXISTS bookings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  class_id    UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  tanggal     DATE NOT NULL,
  status      TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled','hadir','tidak_hadir')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. TRANSACTIONS
CREATE TABLE IF NOT EXISTS transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   UUID REFERENCES members(id) ON DELETE SET NULL,
  jumlah      BIGINT NOT NULL,
  tipe        TEXT NOT NULL CHECK (tipe IN ('pemasukan','pengeluaran')),
  keterangan  TEXT,
  tanggal     DATE NOT NULL DEFAULT CURRENT_DATE,
  status_bayar TEXT NOT NULL DEFAULT 'lunas' CHECK (status_bayar IN ('lunas','pending','gagal')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. INVENTORY
CREATE TABLE IF NOT EXISTS inventory (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama_item     TEXT NOT NULL,
  stok          INT NOT NULL DEFAULT 0,
  stok_minimum  INT NOT NULL DEFAULT 5,
  satuan        TEXT NOT NULL DEFAULT 'pcs',
  vendor        TEXT,
  harga_satuan  BIGINT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. AI LOGS
CREATE TABLE IF NOT EXISTS ai_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent       TEXT NOT NULL,
  input       TEXT,
  output      TEXT,
  outcome     TEXT CHECK (outcome IN ('sukses','gagal','pending')),
  rating      INT CHECK (rating BETWEEN 1 AND 5),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. AI CONFIG
CREATE TABLE IF NOT EXISTS ai_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name    TEXT NOT NULL UNIQUE,
  system_prompt TEXT NOT NULL,
  versi         INT NOT NULL DEFAULT 1,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. WEEKLY REPORTS
CREATE TABLE IF NOT EXISTS weekly_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  minggu        DATE NOT NULL,
  metrics_json  JSONB,
  rekomendasi   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── INDEX untuk performa query ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bookings_member   ON bookings(member_id);
CREATE INDEX IF NOT EXISTS idx_bookings_class    ON bookings(class_id);
CREATE INDEX IF NOT EXISTS idx_bookings_tanggal  ON bookings(tanggal);
CREATE INDEX IF NOT EXISTS idx_transactions_tanggal ON transactions(tanggal);
CREATE INDEX IF NOT EXISTS idx_ai_logs_agent     ON ai_logs(agent);
CREATE INDEX IF NOT EXISTS idx_ai_logs_created   ON ai_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_members_telegram  ON members(telegram_id);

-- ── SEED: ai_config default system prompts ───────────────────
INSERT INTO ai_config (agent_name, system_prompt) VALUES
('adminAgent',
 'Kamu adalah asisten virtual Surya Yoga Studio yang ramah dan profesional. Tugasmu membantu member dengan booking kelas, informasi jadwal, harga, dan pertanyaan umum seputar studio. Selalu balas dalam Bahasa Indonesia yang hangat dan positif. Gunakan emoji secara wajar. Tutup setiap pesan dengan ajakan positif seputar yoga dan kesehatan.'),
('marketingAgent',
 'Kamu adalah spesialis marketing Surya Yoga Studio. Tugasmu membuat konten promosi yang menarik, personal, dan sesuai tone wellness/yoga. Gunakan bahasa Indonesia yang energik tapi tetap tenang dan mengundang. Fokus pada manfaat kelas dan komunitas, bukan hanya harga.'),
('financeAgent',
 'Kamu adalah asisten keuangan Surya Yoga Studio. Tugasmu mencatat transaksi, membuat ringkasan keuangan yang jelas, dan mengirim reminder pembayaran dengan sopan. Selalu profesional, akurat, dan gunakan format angka Rupiah yang benar (Rp X.XXX.XXX).'),
('purchasingAgent',
 'Kamu adalah asisten pengadaan Surya Yoga Studio. Tugasmu memantau stok perlengkapan studio, membuat draft purchase order yang rapi, dan menginformasikan kebutuhan pengadaan kepada owner dengan jelas dan terstruktur.')
ON CONFLICT (agent_name) DO NOTHING;

-- ── SEED: sample classes ──────────────────────────────────────
INSERT INTO classes (nama, instruktur, hari, jam_mulai, jam_selesai, kapasitas, tipe, harga) VALUES
('Hatha Yoga Pagi',      'Sari Dewi Kusuma',    'Senin',  '06:00', '07:15', 20, 'Hatha',    75000),
('Vinyasa Flow',         'Budi Santoso',        'Selasa', '17:00', '18:00', 18, 'Vinyasa',  85000),
('Yin Yoga Sore',        'Larasati Putri',      'Rabu',   '17:00', '18:30', 22, 'Yin',      70000),
('Power Yoga',           'Rizky Fajar',         'Kamis',  '18:30', '19:30', 16, 'Power',    90000),
('Hatha Yoga Malam',     'Ayu Maharani',        'Jumat',  '19:00', '20:15', 20, 'Hatha',    75000),
('Ashtanga Weekend',     'Dimas Prasetyo',      'Sabtu',  '08:00', '09:30', 16, 'Ashtanga', 95000),
('Gentle Vinyasa',       'Fitri Nuraini',       'Minggu', '09:00', '10:00', 20, 'Vinyasa',  80000)
ON CONFLICT DO NOTHING;
