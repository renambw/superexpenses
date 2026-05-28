-- ==============================================================================
-- 1. credit_cards テーブルに每季上限用のカラムを追加
-- ==============================================================================
ALTER TABLE credit_cards
ADD COLUMN IF NOT EXISTS quarterly_cap_limit NUMERIC,
ADD COLUMN IF NOT EXISTS quarterly_cap_rate NUMERIC,
ADD COLUMN IF NOT EXISTS quarterly_cap_apply_to TEXT CHECK (quarterly_cap_apply_to IN ('all', 'overseas', 'category'));

-- ==============================================================================
-- 2. 季度 (Quarter) ごとの累積消費額を計算する View を作成
-- ==============================================================================
-- Supabase (PostgreSQL) の EXTRACT(QUARTER FROM date) を使って四半期ごとにグループ化します。
-- EXTRACT(QUARTER) は 1~3月=1, 4~6月=2, 7~9月=3, 10~12月=4 を返します。

CREATE OR REPLACE VIEW quarterly_card_usage AS
SELECT 
    card_used,
    EXTRACT(YEAR FROM created_at) AS year,
    EXTRACT(QUARTER FROM created_at) AS quarter,
    SUM(amount_hkd) AS total_hkd_this_quarter,
    SUM(miles_earned) AS total_miles_this_quarter,
    COUNT(*) AS transaction_count
FROM 
    transactions
GROUP BY 
    card_used,
    EXTRACT(YEAR FROM created_at),
    EXTRACT(QUARTER FROM created_at);
