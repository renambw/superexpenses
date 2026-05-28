// src/lib/milesEngine.ts
//
// 設計方針：
//   - 信用卡規則は全て Supabase の credit_cards テーブルから読み込む
//   - ハードコードされた CARD_RULES 配列を廃止し、DB 駆動型に移行
//   - カードルールは 60 秒間キャッシュして API 呼び出しを最小化
//   - 上限追蹤：月間上限 → 季度上限 の順で二重チェック
//   - 季度の定義：Q1=1-3月, Q2=4-6月, Q3=7-9月, Q4=10-12月

import { supabase } from './supabase';
import type {
  Category,
  CreditCard,
  CardRecommendation,
  TransactionInput,
  MonthlyCardUsage,
  QuarterlyCardUsage,
} from '@/types';

// ============================================================
// ユーティリティ：現在の四半期番号を返す（1〜4）
// ============================================================
export function getCurrentQuarter(): number {
  return Math.ceil((new Date().getMonth() + 1) / 3);
}

export function getCurrentYear(): number {
  return new Date().getFullYear();
}

/** 四半期の開始月・終了月を返す（1-indexed） */
export function getQuarterMonthRange(quarter: number): { start: number; end: number } {
  return { start: (quarter - 1) * 3 + 1, end: quarter * 3 };
}

// ============================================================
// カードルールのキャッシュ（60 秒 TTL）
// ============================================================
let cardRulesCache: CreditCard[] | null = null;
let cardRulesCachedAt = 0;
const CACHE_TTL_MS = 60_000;

export async function fetchCardRules(forceRefresh = false): Promise<CreditCard[]> {
  const now = Date.now();
  if (!forceRefresh && cardRulesCache && now - cardRulesCachedAt < CACHE_TTL_MS) {
    return cardRulesCache;
  }

  const { data, error } = await supabase
    .from('credit_cards')
    .select('*')
    .order('name');

  if (error || !data) {
    console.error('credit_cards テーブルの読み込みに失敗しました：', error?.message);
    if (cardRulesCache) return cardRulesCache;
    throw new Error('信用卡規則の読み込みに失敗しました。Supabase の接続を確認してください。');
  }

  cardRulesCache = data as CreditCard[];
  cardRulesCachedAt = now;
  return cardRulesCache;
}

/** キャッシュを強制クリアする（Admin ページで保存後に呼び出す） */
export function invalidateCardRulesCache(): void {
  cardRulesCache = null;
  cardRulesCachedAt = 0;
}

// ============================================================
// 本月各カードの累積消費額を取得
// ============================================================
async function getMonthlyUsageMap(): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('monthly_card_usage')
    .select('card_used, total_hkd_this_month');

  if (error || !data) {
    console.error('monthly_card_usage の読み込みに失敗しました：', error?.message);
    return new Map();
  }

  const usageMap = new Map<string, number>();
  (data as MonthlyCardUsage[]).forEach((row) => {
    usageMap.set(row.card_used, Number(row.total_hkd_this_month));
  });
  return usageMap;
}

// ============================================================
// 本季各カードの累積消費額を取得（quarterly_card_usage View）
// ============================================================
async function getQuarterlyUsageMap(): Promise<Map<string, number>> {
  const currentYear    = getCurrentYear();
  const currentQuarter = getCurrentQuarter();

  const { data, error } = await supabase
    .from('quarterly_card_usage')
    .select('card_used, total_hkd_this_quarter, year, quarter')
    .eq('year', currentYear)
    .eq('quarter', currentQuarter);

  if (error || !data) {
    console.error('quarterly_card_usage の読み込みに失敗しました：', error?.message);
    return new Map();
  }

  const usageMap = new Map<string, number>();
  (data as QuarterlyCardUsage[]).forEach((row) => {
    usageMap.set(row.card_used, Number(row.total_hkd_this_quarter));
  });
  return usageMap;
}

// ============================================================
// 上限チェックのコアロジック（月間・季度共通）
// ============================================================
interface CapCheckResult {
  effectiveRate: number;
  isCapped: boolean;
  cappedNote?: string;
  milesOverride?: number; // 部分超過時に直接里数を返す
}

function applyCapLogic(
  amountHKD: number,
  currentUsage: number,
  capLimit: number,
  capRate: number,
  preferentialRate: number,
  capLabel: string // 「本月」or「本季」
): CapCheckResult {
  const remainingCap = capLimit - currentUsage;

  if (remainingCap <= 0) {
    // 上限を完全に超過
    return {
      effectiveRate: capRate,
      isCapped: true,
      cappedNote: `${capLabel}優惠額度已用盡（上限 HKD ${capLimit.toLocaleString()}）`,
    };
  }

  if (remainingCap < amountHKD) {
    // 部分超過：加重平均
    const milesInCap   = remainingCap / preferentialRate;
    const milesOverCap = (amountHKD - remainingCap) / capRate;
    const totalMiles   = milesInCap + milesOverCap;
    const weightedRate = amountHKD / totalMiles;

    return {
      effectiveRate: parseFloat(weightedRate.toFixed(2)),
      isCapped: true,
      cappedNote: `部分金額（HKD ${remainingCap.toLocaleString()}）享優惠，超出部分套用基本里數（${capLabel}上限）`,
      milesOverride: parseFloat(totalMiles.toFixed(2)),
    };
  }

  // 上限内
  return { effectiveRate: preferentialRate, isCapped: false };
}

// ============================================================
// 1 枚のカードに対する里数計算（月間 + 季度 二重上限チェック）
// ============================================================
function calculateMilesForCard(
  card: CreditCard,
  input: TransactionInput,
  currentMonthlyUsage: number,
  currentQuarterlyUsage: number
): CardRecommendation {
  const { amountHKD, currency, category } = input;
  const isOverseas = currency !== 'HKD';

  let effectiveRate   = card.base_rate;
  let isCapped        = false;
  let cappedNote: string | undefined;
  let isOverseasBonus = false;
  let isBelowMinSpend = false;
  let minSpendNote: string | undefined;
  let milesEarned: number | undefined;

  // ── ステップ 1：最低消費額チェック ──────────────────────────
  if (card.min_spend_hkd !== null && amountHKD < card.min_spend_hkd) {
    isBelowMinSpend = true;
    minSpendNote = `需達 HKD ${card.min_spend_hkd.toLocaleString()} 最低消費`;
  }

  // ── ステップ 2：適用利率を決定（優先順位：分類 > 海外 > 基本）──
  const catRate = card.category_rates?.[category as Category];
  if (catRate !== undefined) {
    effectiveRate = catRate;
  } else if (isOverseas && card.overseas_rate !== null) {
    effectiveRate = card.overseas_rate;
    isOverseasBonus = true;
  }

  // 優遇利率（上限チェックに使用）
  const preferentialRate = effectiveRate;

  // ── ステップ 3：月間上限チェック ────────────────────────────
  if (
    card.monthly_cap_limit !== null &&
    card.monthly_cap_rate !== null &&
    card.monthly_cap_apply_to !== null
  ) {
    const isSubjectToMonthly =
      card.monthly_cap_apply_to === 'all' ||
      (card.monthly_cap_apply_to === 'overseas' && isOverseas) ||
      (card.monthly_cap_apply_to === 'category' && catRate !== undefined);

    if (isSubjectToMonthly) {
      const result = applyCapLogic(
        amountHKD,
        currentMonthlyUsage,
        card.monthly_cap_limit,
        card.monthly_cap_rate,
        preferentialRate,
        '本月'
      );
      effectiveRate = result.effectiveRate;
      isCapped      = result.isCapped;
      cappedNote    = result.cappedNote;
      if (result.milesOverride !== undefined) {
        milesEarned = result.milesOverride;
      }
    }
  }

  // ── ステップ 4：季度上限チェック（月間上限より厳しい場合のみ適用）──
  if (
    card.quarterly_cap_limit !== null &&
    card.quarterly_cap_rate !== null &&
    card.quarterly_cap_apply_to !== null
  ) {
    const isSubjectToQuarterly =
      card.quarterly_cap_apply_to === 'all' ||
      (card.quarterly_cap_apply_to === 'overseas' && isOverseas) ||
      (card.quarterly_cap_apply_to === 'category' && catRate !== undefined);

    if (isSubjectToQuarterly) {
      const result = applyCapLogic(
        amountHKD,
        currentQuarterlyUsage,
        card.quarterly_cap_limit,
        card.quarterly_cap_rate,
        preferentialRate,
        '本季'
      );

      // 季度上限の方が厳しい（里数が少ない）場合のみ上書き
      const quarterlyMiles =
        result.milesOverride !== undefined
          ? result.milesOverride
          : amountHKD / result.effectiveRate;

      const currentMiles =
        milesEarned !== undefined ? milesEarned : amountHKD / effectiveRate;

      if (result.isCapped && quarterlyMiles < currentMiles) {
        effectiveRate = result.effectiveRate;
        isCapped      = true;
        cappedNote    = result.cappedNote;
        milesEarned   = result.milesOverride;
      }
    }
  }

  // ── ステップ 5：最終里数を計算 ──────────────────────────────
  const finalMiles =
    milesEarned !== undefined ? milesEarned : amountHKD / effectiveRate;

  return {
    cardId: card.id,
    cardName: card.name,
    milesEarned: parseFloat(finalMiles.toFixed(2)),
    effectiveRate,
    baseRate: card.base_rate,
    isCapped,
    cappedNote,
    isOverseasBonus,
    isBelowMinSpend,
    minSpendNote,
  };
}

// ============================================================
// 公開 API：推薦信用卡ランキング（DB から規則を読み込む）
// ============================================================
export async function recommendCards(
  input: TransactionInput
): Promise<CardRecommendation[]> {
  // 並列で取得してレイテンシを最小化
  const [cards, monthlyUsageMap, quarterlyUsageMap] = await Promise.all([
    fetchCardRules(),
    getMonthlyUsageMap(),
    getQuarterlyUsageMap(),
  ]);

  const recommendations = cards.map((card) => {
    const monthlyUsage   = monthlyUsageMap.get(card.name) ?? 0;
    const quarterlyUsage = quarterlyUsageMap.get(card.name) ?? 0;
    return calculateMilesForCard(card, input, monthlyUsage, quarterlyUsage);
  });

  // 里数の多い順にソート。同点の場合は上限未達を優先
  return recommendations.sort((a, b) => {
    const diff = b.milesEarned - a.milesEarned;
    if (Math.abs(diff) > 0.01) return diff;
    return Number(a.isCapped) - Number(b.isCapped);
  });
}
