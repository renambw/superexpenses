-- ==============================================================================
-- 1. credit_cards テーブルに独立上限用のカラムを追加し、旧カラムを削除
-- ==============================================================================
ALTER TABLE credit_cards
  -- ── 本地上限（月間・季度） ──
  ADD COLUMN IF NOT EXISTS local_monthly_cap NUMERIC,
  ADD COLUMN IF NOT EXISTS local_quarterly_cap NUMERIC,
  
  -- ── 海外上限（月間・季度） ──
  ADD COLUMN IF NOT EXISTS overseas_monthly_cap NUMERIC,
  ADD COLUMN IF NOT EXISTS overseas_quarterly_cap NUMERIC,
  
  -- ── 特定分類上限（月間・季度） ──
  -- ※ JSONB を使って {"飲食": 10000, "交通": 5000} のように設定可能にする
  ADD COLUMN IF NOT EXISTS category_monthly_caps JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS category_quarterly_caps JSONB DEFAULT '{}'::jsonb,
  
  -- ── 降級後の基本利率 ──
  -- 上限超過後はこの利率が適用される（カードごとに1つ）
  ADD COLUMN IF NOT EXISTS capped_base_rate NUMERIC;

-- ※ 注意：既存の monthly_cap_limit, monthly_cap_rate, monthly_cap_apply_to, 
-- quarterly_cap_limit, quarterly_cap_rate, quarterly_cap_apply_to は
-- データ移行後に DROP COLUMN することを推奨しますが、安全のため今回は残しています。

-- ==============================================================================
-- 2. 本地/海外/分類ごとの累積消費額を計算する View を作成
-- ==============================================================================

-- ── 月間詳細 View ──
CREATE OR REPLACE VIEW monthly_card_usage_detailed AS
SELECT 
    card_used,
    EXTRACT(YEAR FROM created_at) AS year,
    EXTRACT(MONTH FROM created_at) AS month,
    is_overseas,
    category,
    SUM(amount_hkd) AS total_hkd,
    SUM(miles_earned) AS total_miles,
    COUNT(*) AS transaction_count
FROM 
    transactions
GROUP BY 
    card_used,
    EXTRACT(YEAR FROM created_at),
    EXTRACT(MONTH FROM created_at),
    is_overseas,
    category;

-- ── 季度詳細 View ──
CREATE OR REPLACE VIEW quarterly_card_usage_detailed AS
SELECT 
    card_used,
    EXTRACT(YEAR FROM created_at) AS year,
    EXTRACT(QUARTER FROM created_at) AS quarter,
    is_overseas,
    category,
    SUM(amount_hkd) AS total_hkd,
    SUM(miles_earned) AS total_miles,
    COUNT(*) AS transaction_count
FROM 
    transactions
GROUP BY 
    card_used,
    EXTRACT(YEAR FROM created_at),
    EXTRACT(QUARTER FROM created_at),
    is_overseas,
    category;
