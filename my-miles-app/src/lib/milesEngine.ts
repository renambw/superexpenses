// src/lib/milesEngine.ts
import { supabase } from './supabase';
import type {
  Category,
  CardName,
  CardRecommendation,
  TransactionInput,
  MonthlyCardUsage,
} from '@/types';

// ============================================================
// 信用卡規則定義
// ============================================================

interface CardRule {
  name: CardName;
  baseRate: number;
  overseasRate?: number;
  categoryRates?: Partial<Record<Category, number>>;
  monthlyCap?: {
    limitHKD: number;
    capRate: number;
    applyTo: 'overseas' | 'category' | 'all';
  };
}

const CARD_RULES: CardRule[] = [
  {
    name: '渣打 Cathay 卡',
    baseRate: 6,
    overseasRate: 4,
    categoryRates: { '飲食': 4 },
  },
  {
    name: 'AE Explorer',
    baseRate: 5,
    overseasRate: 4,
  },
  {
    name: 'AE 白金細頭',
    baseRate: 6.25,
    overseasRate: 5,
    categoryRates: { '飲食': 5, '購物': 5 },
  },
  {
    name: 'HSBC EveryMile',
    baseRate: 6,
    categoryRates: { '交通': 2, '飲食': 3 },
    monthlyCap: {
      limitHKD: 4000,
      capRate: 6,
      applyTo: 'category',
    },
  },
  {
    name: 'BOC Cheers',
    baseRate: 15,
    overseasRate: 1.5,
    categoryRates: { '飲食': 1.5 },
    monthlyCap: {
      limitHKD: 25000,
      capRate: 15,
      applyTo: 'all',
    },
  },
];

// ============================================================
// 本月各卡片累積簽帳額を取得する
// ============================================================

async function getMonthlyUsageMap(): Promise<Map<CardName, number>> {
  const { data, error } = await supabase
    .from('monthly_card_usage')
    .select('card_used, total_hkd_this_month');

  if (error || !data) {
    console.error('無法取得本月信用卡使用量：', error?.message);
    return new Map();
  }

  const usageMap = new Map<CardName, number>();
  (data as MonthlyCardUsage[]).forEach((row) => {
    usageMap.set(row.card_used, Number(row.total_hkd_this_month));
  });

  return usageMap;
}

// ============================================================
// 核心計分函式
// ============================================================

function calculateMilesForCard(
  card: CardRule,
  input: TransactionInput,
  currentMonthlyUsage: number
): CardRecommendation {
  const { amountHKD, currency, category } = input;
  const isOverseas = currency !== 'HKD';

  let effectiveRate = card.baseRate;
  let isCapped = false;
  let cappedNote: string | undefined;
  let isOverseasBonus = false;

  // 步驟 1：確定基礎適用利率（特定分類 > 海外加成 > 基本利率）
  if (card.categoryRates?.[category] !== undefined) {
    effectiveRate = card.categoryRates[category]!;
  } else if (isOverseas && card.overseasRate !== undefined) {
    effectiveRate = card.overseasRate;
    isOverseasBonus = true;
  }

  // 步驟 2：檢查每月回贈上限並降級
  if (card.monthlyCap) {
    const { limitHKD, capRate, applyTo } = card.monthlyCap;
    const isSubjectToCap =
      applyTo === 'all' ||
      (applyTo === 'overseas' && isOverseas) ||
      (applyTo === 'category' && card.categoryRates?.[category] !== undefined);

    if (isSubjectToCap) {
      const remainingCap = limitHKD - currentMonthlyUsage;

      if (remainingCap <= 0) {
        // 已完全超過上限
        effectiveRate = capRate;
        isCapped = true;
        cappedNote = `本月優惠額度已用盡（上限 HKD ${limitHKD.toLocaleString()}）`;
      } else if (remainingCap < amountHKD) {
        // 部分超過上限：計算加權平均里數
        const preferentialRate =
          card.categoryRates?.[category] ??
          (isOverseas ? card.overseasRate : undefined) ??
          card.baseRate;
        const milesInCap = remainingCap / preferentialRate;
        const milesOverCap = (amountHKD - remainingCap) / capRate;
        const totalMiles = milesInCap + milesOverCap;
        const weightedRate = amountHKD / totalMiles;

        return {
          cardName: card.name,
          milesEarned: parseFloat(totalMiles.toFixed(2)),
          effectiveRate: parseFloat(weightedRate.toFixed(2)),
          baseRate: card.baseRate,
          isCapped: true,
          cappedNote: `部分金額（HKD ${remainingCap.toLocaleString()}）享優惠，超出部分套用基本里數`,
          isOverseasBonus,
        };
      }
    }
  }

  const milesEarned = amountHKD / effectiveRate;

  return {
    cardName: card.name,
    milesEarned: parseFloat(milesEarned.toFixed(2)),
    effectiveRate,
    baseRate: card.baseRate,
    isCapped,
    cappedNote,
    isOverseasBonus,
  };
}

// ============================================================
// 公開 API：推薦信用卡排行
// ============================================================

export async function recommendCards(
  input: TransactionInput
): Promise<CardRecommendation[]> {
  const usageMap = await getMonthlyUsageMap();

  const recommendations = CARD_RULES.map((card) => {
    const currentUsage = usageMap.get(card.name) ?? 0;
    return calculateMilesForCard(card, input, currentUsage);
  });

  return recommendations.sort((a, b) => {
    if (Math.abs(b.milesEarned - a.milesEarned) > 0.01) {
      return b.milesEarned - a.milesEarned;
    }
    return Number(a.isCapped) - Number(b.isCapped);
  });
}
