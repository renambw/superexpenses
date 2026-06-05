// src/types/index.ts

export type Category =
  | '飲食'
  | '購物'
  | '酒店'
  | '旅遊'
  | '交通'
  | '娛樂'
  | '通訊'
  | '手信/禮物'
  | '醫療/保險'
  | '雜項'
  | '網購';

// CardName は DB の name カラムに合わせて string に拡張
export type CardName = string;

// ============================================================
// Supabase credit_cards テーブルの型定義（独立上限対応版）
// ============================================================
export type MonthlyCapApplyTo   = 'all' | 'overseas' | 'category';
export type QuarterlyCapApplyTo = 'all' | 'overseas' | 'category';
export type MinSpendApplyTo     = 'all' | 'local' | 'overseas' | 'category';

export interface CreditCard {
  id: string;
  name: string;
  base_rate: number;
  overseas_rate: number | null;
  category_rates: Partial<Record<Category, number>>;
  min_spend_hkd: number | null;
  min_spend_apply_to: MinSpendApplyTo | null;

  // ── 旧来の上限フィールド（後方互換性のために保持） ──
  monthly_cap_limit:    number | null;
  monthly_cap_rate:     number | null;
  monthly_cap_apply_to: MonthlyCapApplyTo | null;
  quarterly_cap_limit:    number | null;
  quarterly_cap_rate:     number | null;
  quarterly_cap_apply_to: QuarterlyCapApplyTo | null;

  // ── 独立上限フィールド（新規追加） ──
  // 本地（HKD）上限
  local_monthly_cap:   number | null;
  local_quarterly_cap: number | null;
  // 海外（外幣）上限
  overseas_monthly_cap:   number | null;
  overseas_quarterly_cap: number | null;
  // 特定分類上限（JSONB: {"飲食": 10000, "交通": 5000}）
  category_monthly_caps:   Partial<Record<Category, number>> | null;
  category_quarterly_caps: Partial<Record<Category, number>> | null;
  // 上限超過後の降級利率（全上限共通）
  capped_base_rate: number | null;

  // ── 結單日 & 用戶月度簽帳上限（新增） ──
  // 每月結單日（1-31），用於計算本期消費週期
  statement_date: number;
  // 用戶自訂月度簽帳警告上限（可選，如 HKD 20000）
  user_monthly_limit: number | null;
}

// ============================================================
// アプリケーション内部で使用する型
// ============================================================
export interface TransactionInput {
  amountOriginal: number;
  currency: string;
  exchangeRate: number;
  amountHKD: number;
  category: Category;
  description?: string;
}

export interface CardRecommendation {
  cardId: string;
  cardName: CardName;
  milesEarned: number;
  effectiveRate: number;
  baseRate: number;
  isCapped: boolean;
  cappedNote?: string;
  isOverseasBonus: boolean;
  isBelowMinSpend: boolean;
  minSpendNote?: string;
  // 月度上限警告（新增）
  monthlyLimitWarning?: string | null;
}

export interface Transaction {
  id: string;
  created_at: string;
  amount_original: number;
  currency: string;
  exchange_rate: number;
  amount_hkd: number;
  category: Category;
  card_used: CardName;
  miles_earned: number;
  is_overseas: boolean;
  description?: string;
}

export interface MonthlyCardUsage {
  card_used: CardName;
  total_hkd_this_month: number;
  total_miles_this_month: number;
  transaction_count: number;
}

export interface QuarterlyCardUsage {
  card_used: CardName;
  year: number;
  quarter: number;
  total_hkd_this_quarter: number;
  total_miles_this_quarter: number;
  transaction_count: number;
}

// ── 独立上限用の詳細 Usage 型 ──
export interface DetailedUsage {
  card_used: CardName;
  local_hkd: number;
  overseas_hkd: number;
  category_hkd: Partial<Record<Category, number>>;
}

// ── 結單週期內的信用卡消費統計（新增） ──
export interface CardCycleUsage {
  card_name: CardName;
  statement_date: number;
  cycle_start: Date;
  cycle_end: Date;
  total_hkd: number;
  transaction_count: number;
  user_monthly_limit: number | null;
}
