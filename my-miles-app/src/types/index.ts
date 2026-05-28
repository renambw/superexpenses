// src/types/index.ts

export type Category =
  | '飲食'
  | '購物'
  | '酒店'
  | '交通'
  | '娛樂'
  | '通訊'
  | '手信/禮物'
  | '醫療/保險'
  | '雜項';

// CardName は DB の name カラムに合わせて string に拡張
// （Admin ページで新しいカードを追加できるようにするため）
export type CardName = string;

// ============================================================
// Supabase credit_cards テーブルの型定義
// ============================================================
export type MonthlyCapApplyTo = 'all' | 'overseas' | 'category';

export interface CreditCard {
  id: string;
  name: string;
  base_rate: number;
  overseas_rate: number | null;
  category_rates: Partial<Record<Category, number>>;
  min_spend_hkd: number | null;
  monthly_cap_limit: number | null;
  monthly_cap_rate: number | null;
  monthly_cap_apply_to: MonthlyCapApplyTo | null;
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
