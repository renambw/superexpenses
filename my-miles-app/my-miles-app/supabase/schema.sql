-- ============================================
-- Miles Tracker — Supabase Schema
-- Supabase Dashboard > SQL Editor で実行してください
-- ============================================

-- 1. UUID 拡張を有効化
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. 取引記録メインテーブル
CREATE TABLE IF NOT EXISTS transactions (
  id               UUID           DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at       TIMESTAMPTZ    DEFAULT NOW() NOT NULL,
  amount_original  NUMERIC(12, 2) NOT NULL,
  currency         TEXT           NOT NULL DEFAULT 'HKD',
  exchange_rate    NUMERIC(10, 6) NOT NULL DEFAULT 1.0,
  amount_hkd       NUMERIC(12, 2) NOT NULL,
  category         TEXT           NOT NULL,
  card_used        TEXT           NOT NULL,
  miles_earned     NUMERIC(10, 2) NOT NULL DEFAULT 0,
  is_overseas      BOOLEAN        NOT NULL DEFAULT FALSE,
  description      TEXT
);

-- 3. インデックス
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_card_used  ON transactions (card_used);
CREATE INDEX IF NOT EXISTS idx_transactions_category   ON transactions (category);

-- 4. 当月カード使用量 View（上限チェック用）
CREATE OR REPLACE VIEW monthly_card_usage AS
SELECT
  card_used,
  SUM(amount_hkd)    AS total_hkd_this_month,
  SUM(miles_earned)  AS total_miles_this_month,
  COUNT(*)           AS transaction_count
FROM transactions
WHERE date_trunc('month', created_at AT TIME ZONE 'Asia/Hong_Kong')
    = date_trunc('month', NOW() AT TIME ZONE 'Asia/Hong_Kong')
GROUP BY card_used;

-- 5. 当月カテゴリ集計 View（Dashboard 用）
CREATE OR REPLACE VIEW monthly_category_summary AS
SELECT
  category,
  SUM(amount_hkd) AS total_hkd,
  COUNT(*)        AS transaction_count
FROM transactions
WHERE date_trunc('month', created_at AT TIME ZONE 'Asia/Hong_Kong')
    = date_trunc('month', NOW() AT TIME ZONE 'Asia/Hong_Kong')
GROUP BY category
ORDER BY total_hkd DESC;

-- 6. Row Level Security（単一ユーザー向け：全操作許可）
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations" ON transactions
  FOR ALL USING (true) WITH CHECK (true);
