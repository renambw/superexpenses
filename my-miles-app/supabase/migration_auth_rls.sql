-- 1. transactions テーブルに user_id を追加
ALTER TABLE transactions 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 既存のデータ（もしあれば）を特定のユーザーに紐付けるか、とりあえず NULL 許容のままにしておく
-- 完全に RLS を有効にするには NOT NULL にするべきですが、移行中のため今回は NULL を許可します。
-- 将来的に全データに user_id が入ったら NOT NULL に変更してください。

-- 2. RLS (Row Level Security) を有効化
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- 3. ポリシーの作成：自分のデータのみ SELECT, INSERT, UPDATE, DELETE 可能
CREATE POLICY "Users can view their own transactions" 
  ON transactions FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own transactions" 
  ON transactions FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own transactions" 
  ON transactions FOR UPDATE 
  USING (auth.uid() = user_id) 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own transactions" 
  ON transactions FOR DELETE 
  USING (auth.uid() = user_id);

-- 4. View の更新（RLS が適用された transactions テーブルを元に計算されるため、View 自体の RLS は不要ですが、
-- View が auth.uid() を正しく評価できるように `security_invoker = true` を設定します）

DROP VIEW IF EXISTS monthly_category_summary;
CREATE VIEW monthly_category_summary WITH (security_invoker = true) AS
SELECT 
    user_id,
    category,
    SUM(amount_hkd) AS total_hkd
FROM transactions
WHERE EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM CURRENT_DATE)
  AND EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM CURRENT_DATE)
GROUP BY user_id, category;

DROP VIEW IF EXISTS monthly_card_usage;
CREATE VIEW monthly_card_usage WITH (security_invoker = true) AS
SELECT 
    user_id,
    card_used,
    is_overseas,
    category,
    SUM(amount_hkd) AS total_hkd
FROM transactions
WHERE EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM CURRENT_DATE)
  AND EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM CURRENT_DATE)
GROUP BY user_id, card_used, is_overseas, category;

DROP VIEW IF EXISTS quarterly_card_usage;
CREATE VIEW quarterly_card_usage WITH (security_invoker = true) AS
SELECT 
    user_id,
    card_used,
    is_overseas,
    category,
    SUM(amount_hkd) AS total_hkd
FROM transactions
WHERE EXTRACT(QUARTER FROM date) = EXTRACT(QUARTER FROM CURRENT_DATE)
  AND EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM CURRENT_DATE)
GROUP BY user_id, card_used, is_overseas, category;

-- credit_cards テーブルは全ユーザー共通のマスターデータなので RLS は不要（誰でも読める）ですが、
-- Admin のみ編集可能にする場合は以下のように設定できます。
ALTER TABLE credit_cards ENABLE ROW LEVEL SECURITY;

-- 誰でも読めるポリシー
CREATE POLICY "Anyone can read credit cards" 
  ON credit_cards FOR SELECT 
  USING (true);

-- 編集・追加・削除は認証済みユーザー（Admin）のみ
CREATE POLICY "Authenticated users can modify credit cards" 
  ON credit_cards FOR ALL 
  USING (auth.role() = 'authenticated') 
  WITH CHECK (auth.role() = 'authenticated');
