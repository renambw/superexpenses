-- ==============================================================================
-- credit_cards テーブルに min_spend_apply_to カラムを追加
-- ==============================================================================
ALTER TABLE credit_cards
  ADD COLUMN IF NOT EXISTS min_spend_apply_to TEXT 
  CHECK (min_spend_apply_to IN ('all', 'local', 'overseas', 'category'));

-- 既存のデータで min_spend_hkd が設定されている場合、デフォルトを 'all' にする
UPDATE credit_cards 
SET min_spend_apply_to = 'all' 
WHERE min_spend_hkd IS NOT NULL AND min_spend_apply_to IS NULL;
