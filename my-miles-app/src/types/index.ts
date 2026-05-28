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

export type CardName =
  | '渣打 Cathay 卡'
  | 'AE Explorer'
  | 'AE 白金細頭'
  | 'HSBC EveryMile'
  | 'BOC Cheers';

export interface TransactionInput {
  amountOriginal: number;
  currency: string;
  exchangeRate: number;
  amountHKD: number;
  category: Category;
  description?: string;
}

export interface CardRecommendation {
  cardName: CardName;
  milesEarned: number;
  effectiveRate: number;
  baseRate: number;
  isCapped: boolean;
  cappedNote?: string;
  isOverseasBonus: boolean;
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
