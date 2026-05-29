// src/lib/milesEngine.ts
//
// Asia Miles 計分引擎（独立上限対応版）
//
// 上限チェック優先順位（全て「より少ない里数」を採用）：
//   1. 特定分類の月間上限（category_monthly_caps）
//   2. 特定分類の季度上限（category_quarterly_caps）
//   3. 海外の月間上限（overseas_monthly_cap）
//   4. 海外の季度上限（overseas_quarterly_cap）
//   5. 本地の月間上限（local_monthly_cap）
//   6. 本地の季度上限（local_quarterly_cap）
//   7. 旧来の統合上限（monthly_cap_limit / quarterly_cap_limit）← 後方互換

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
// ユーティリティ
// ============================================================
export function getCurrentQuarter(): number {
  return Math.ceil((new Date().getMonth() + 1) / 3);
}
export function getCurrentYear(): number {
  return new Date().getFullYear();
}
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
    if (cardRulesCache) return cardRulesCache;
    throw new Error('信用卡規則の読み込みに失敗しました。');
  }
  cardRulesCache = data as CreditCard[];
  cardRulesCachedAt = now;
  return cardRulesCache;
}

export function invalidateCardRulesCache(): void {
  cardRulesCache = null;
  cardRulesCachedAt = 0;
}

// ============================================================
// 使用量の取得（本地/海外/分類 独立集計）
// ============================================================
interface UsageMap {
  local: number;
  overseas: number;
  category: Partial<Record<Category, number>>;
}

function getMonthStart(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

function getQuarterStart(): string {
  const d = new Date();
  const qStartMonth = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), qStartMonth, 1).toISOString();
}

async function buildUsageMap(since: string): Promise<Map<string, UsageMap>> {
  const { data, error } = await supabase
    .from('transactions')
    .select('card_used, amount_hkd, is_overseas, category')
    .gte('created_at', since);

  const map = new Map<string, UsageMap>();
  if (error || !data) return map;

  for (const tx of data) {
    const key = tx.card_used as string;
    if (!map.has(key)) map.set(key, { local: 0, overseas: 0, category: {} });
    const u = map.get(key)!;
    const amt = Number(tx.amount_hkd);
    if (tx.is_overseas) {
      u.overseas += amt;
    } else {
      u.local += amt;
    }
    const cat = tx.category as Category;
    u.category[cat] = (u.category[cat] ?? 0) + amt;
  }
  return map;
}

// 後方互換：旧来の View ベースの月間/季度合計
async function getMonthlyUsageMap(): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('monthly_card_usage')
    .select('card_used, total_hkd_this_month');
  const m = new Map<string, number>();
  if (error || !data) return m;
  (data as MonthlyCardUsage[]).forEach((r) => m.set(r.card_used, Number(r.total_hkd_this_month)));
  return m;
}

async function getQuarterlyUsageMap(): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('quarterly_card_usage')
    .select('card_used, total_hkd_this_quarter, year, quarter')
    .eq('year', getCurrentYear())
    .eq('quarter', getCurrentQuarter());
  const m = new Map<string, number>();
  if (error || !data) return m;
  (data as QuarterlyCardUsage[]).forEach((r) => m.set(r.card_used, Number(r.total_hkd_this_quarter)));
  return m;
}

// ============================================================
// 上限チェック共通ロジック
// ============================================================
interface BestResult {
  effectiveRate: number;
  isCapped: boolean;
  cappedNote?: string;
  milesEarned?: number;
}

interface CapResult {
  effectiveRate: number;
  isCapped: boolean;
  cappedNote?: string;
  milesOverride?: number;
}

function applyCapLogic(
  amountHKD: number,
  usedSoFar: number,
  capLimit: number,
  cappedRate: number,
  normalRate: number,
  periodLabel: string
): CapResult {
  const remaining = capLimit - usedSoFar;

  if (remaining <= 0) {
    return {
      effectiveRate: cappedRate,
      isCapped: true,
      cappedNote: `${periodLabel}優惠額度已用盡（上限 HKD ${capLimit.toLocaleString()}）`,
      milesOverride: amountHKD / cappedRate,
    };
  }

  if (amountHKD <= remaining) {
    return { effectiveRate: normalRate, isCapped: false };
  }

  // 部分超過 → 加重平均
  const milesNormal  = remaining / normalRate;
  const milesCapped  = (amountHKD - remaining) / cappedRate;
  const totalMiles   = milesNormal + milesCapped;
  const weightedRate = amountHKD / totalMiles;

  return {
    effectiveRate: parseFloat(weightedRate.toFixed(4)),
    isCapped: true,
    cappedNote: `部分金額（HKD ${remaining.toLocaleString()}）享優惠，超出部分套用基本里數（${periodLabel}上限）`,
    milesOverride: parseFloat(totalMiles.toFixed(2)),
  };
}

/** 現在の最良結果と新しい上限結果を比較し、より厳しい（里数が少ない）方を返す */
function pickWorseResult(
  amountHKD: number,
  current: BestResult,
  result: CapResult
): BestResult {
  if (!result.isCapped) return current;
  const newMiles = result.milesOverride ?? amountHKD / result.effectiveRate;
  const curMiles = current.milesEarned  ?? amountHKD / current.effectiveRate;
  if (newMiles < curMiles) {
    return {
      effectiveRate: result.effectiveRate,
      isCapped: true,
      cappedNote: result.cappedNote,
      milesEarned: result.milesOverride,
    };
  }
  return current;
}

// ============================================================
// 1 枚のカードに対する里数計算
// ============================================================
function calculateMilesForCard(
  card: CreditCard,
  input: TransactionInput,
  monthly: UsageMap,
  quarterly: UsageMap,
  legacyMonthly: number,
  legacyQuarterly: number
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

  // ── ステップ 1：最低消費額チェック（min_spend_apply_to 対応版）──
  // min_spend_apply_to に従って累積金額を選択し、「累積 + 今回」が最低消費未満なら強制降級
  if (card.min_spend_hkd !== null) {
    const applyTo = card.min_spend_apply_to ?? 'all';

    // 「適用範囲」と「現在の取引種別」が一致しない場合は最低消費チェックをスキップ
    // 例： apply_to='overseas' なのに HKD 取引→ 最低消費は海外消費にのみ適用されるので警告不要
    // 例： apply_to='local' なのに海外取引→ 同様にスキップ
    const shouldSkipMinSpendCheck =
      (applyTo === 'overseas' && !isOverseas) ||
      (applyTo === 'local'   &&  isOverseas);

    if (!shouldSkipMinSpendCheck) {
      // 適用範囲に応じた累積金額を計算
      let accumulatedUsage: number;
      switch (applyTo) {
        case 'local':
          accumulatedUsage = monthly.local;
          break;
        case 'overseas':
          accumulatedUsage = monthly.overseas;
          break;
        case 'category':
          accumulatedUsage = monthly.category[category as Category] ?? 0;
          break;
        case 'all':
        default:
          accumulatedUsage = monthly.local + monthly.overseas;
          break;
      }

      const projectedTotal = accumulatedUsage + amountHKD;
      if (projectedTotal < card.min_spend_hkd) {
        isBelowMinSpend = true;
        // 差額 = 最低消費 - 「現在の累積 + 今回の金額」
        const shortfall = card.min_spend_hkd - projectedTotal;
        const scopeLabel = applyTo === 'overseas' ? '海外簽費' :
                           applyTo === 'local'    ? '本地簽費' :
                           applyTo === 'category' ? `${category}簽費` : '簽費總額';
        minSpendNote = `未達最低要求 HKD ${card.min_spend_hkd.toLocaleString()}（${scopeLabel}），還欠 HKD ${Math.ceil(shortfall).toLocaleString()} 才達到要求`;
      }
    }
  }

  // ── ステップ 2：適用利率を決定（分類 > 海外 > 基本）──
  const catRate = card.category_rates?.[category as Category];
  if (catRate !== undefined) {
    effectiveRate = catRate;
  } else if (isOverseas && card.overseas_rate !== null) {
    effectiveRate = card.overseas_rate;
    isOverseasBonus = true;
  }
  const preferentialRate = effectiveRate;
  // 降級後利率（capped_base_rate が設定されていれば使用）
  const fallbackCappedRate = card.capped_base_rate ?? card.base_rate;

  // ── 最低消費未達の場合：全ての上限チェックをスキップし、即座に降級利率を適用 ──
  if (isBelowMinSpend) {
    const forcedRate = fallbackCappedRate;
    return {
      cardId: card.id,
      cardName: card.name,
      milesEarned: parseFloat((amountHKD / forcedRate).toFixed(2)),
      effectiveRate: forcedRate,
      baseRate: card.base_rate,
      isCapped: false,          // cappedNote を非表示にする（minSpendNote のみ表示）
      cappedNote: undefined,
      isOverseasBonus: false,
      isBelowMinSpend: true,
      minSpendNote,
    };
  }

  // 現在の最良結果（上限チェック前）
  let best: BestResult = { effectiveRate, isCapped: false };

  // ── ステップ 3a：特定分類の月間上限 ──
  const catMonthlyCap = card.category_monthly_caps?.[category as Category];
  if (catMonthlyCap != null && catMonthlyCap > 0) {
    const used = monthly.category[category as Category] ?? 0;
    const r = applyCapLogic(amountHKD, used, catMonthlyCap, fallbackCappedRate, preferentialRate, '本月分類');
    best = pickWorseResult(amountHKD, best, r);
  }

  // ── ステップ 3b：特定分類の季度上限 ──
  const catQuarterlyCap = card.category_quarterly_caps?.[category as Category];
  if (catQuarterlyCap != null && catQuarterlyCap > 0) {
    const used = quarterly.category[category as Category] ?? 0;
    const r = applyCapLogic(amountHKD, used, catQuarterlyCap, fallbackCappedRate, preferentialRate, '本季分類');
    best = pickWorseResult(amountHKD, best, r);
  }

  // ── ステップ 3c：海外の月間上限 ──
  if (isOverseas && card.overseas_monthly_cap != null && card.overseas_monthly_cap > 0) {
    const r = applyCapLogic(amountHKD, monthly.overseas, card.overseas_monthly_cap, fallbackCappedRate, preferentialRate, '本月海外');
    best = pickWorseResult(amountHKD, best, r);
  }

  // ── ステップ 3d：海外の季度上限 ──
  if (isOverseas && card.overseas_quarterly_cap != null && card.overseas_quarterly_cap > 0) {
    const r = applyCapLogic(amountHKD, quarterly.overseas, card.overseas_quarterly_cap, fallbackCappedRate, preferentialRate, '本季海外');
    best = pickWorseResult(amountHKD, best, r);
  }

  // ── ステップ 3e：本地の月間上限 ──
  if (!isOverseas && card.local_monthly_cap != null && card.local_monthly_cap > 0) {
    const r = applyCapLogic(amountHKD, monthly.local, card.local_monthly_cap, fallbackCappedRate, preferentialRate, '本月本地');
    best = pickWorseResult(amountHKD, best, r);
  }

  // ── ステップ 3f：本地の季度上限 ──
  if (!isOverseas && card.local_quarterly_cap != null && card.local_quarterly_cap > 0) {
    const r = applyCapLogic(amountHKD, quarterly.local, card.local_quarterly_cap, fallbackCappedRate, preferentialRate, '本季本地');
    best = pickWorseResult(amountHKD, best, r);
  }

  // ── ステップ 3g：旧来の月間上限（後方互換）──
  if (card.monthly_cap_limit !== null && card.monthly_cap_rate !== null && card.monthly_cap_apply_to !== null) {
    const isSubject =
      card.monthly_cap_apply_to === 'all' ||
      (card.monthly_cap_apply_to === 'overseas' && isOverseas) ||
      (card.monthly_cap_apply_to === 'category' && catRate !== undefined);
    if (isSubject) {
      const usedForCap =
        card.monthly_cap_apply_to === 'all' ? legacyMonthly :
        card.monthly_cap_apply_to === 'overseas' ? monthly.overseas :
        (monthly.category[category as Category] ?? 0);
      const r = applyCapLogic(amountHKD, usedForCap, card.monthly_cap_limit, card.monthly_cap_rate, preferentialRate, '本月');
      best = pickWorseResult(amountHKD, best, r);
    }
  }

  // ── ステップ 3h：旧来の季度上限（後方互換）──
  if (card.quarterly_cap_limit !== null && card.quarterly_cap_rate !== null && card.quarterly_cap_apply_to !== null) {
    const isSubject =
      card.quarterly_cap_apply_to === 'all' ||
      (card.quarterly_cap_apply_to === 'overseas' && isOverseas) ||
      (card.quarterly_cap_apply_to === 'category' && catRate !== undefined);
    if (isSubject) {
      const usedForCap =
        card.quarterly_cap_apply_to === 'all' ? legacyQuarterly :
        card.quarterly_cap_apply_to === 'overseas' ? quarterly.overseas :
        (quarterly.category[category as Category] ?? 0);
      const r = applyCapLogic(amountHKD, usedForCap, card.quarterly_cap_limit, card.quarterly_cap_rate, preferentialRate, '本季');
      best = pickWorseResult(amountHKD, best, r);
    }
  }

  // ── ステップ 4：最終里数を計算 ──
  effectiveRate = best.effectiveRate;
  isCapped      = best.isCapped;
  cappedNote    = best.cappedNote;
  milesEarned   = best.milesEarned;

  const finalMiles = milesEarned !== undefined ? milesEarned : amountHKD / effectiveRate;

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
// 公開 API：推薦信用卡ランキング
// ============================================================
export async function recommendCards(
  input: TransactionInput
): Promise<CardRecommendation[]> {
  const [cards, monthlyDetailed, quarterlyDetailed, legacyMonthly, legacyQuarterly] = await Promise.all([
    fetchCardRules(),
    buildUsageMap(getMonthStart()),
    buildUsageMap(getQuarterStart()),
    getMonthlyUsageMap(),
    getQuarterlyUsageMap(),
  ]);

  const recommendations = cards.map((card) => {
    const monthly   = monthlyDetailed.get(card.name)   ?? { local: 0, overseas: 0, category: {} };
    const quarterly = quarterlyDetailed.get(card.name) ?? { local: 0, overseas: 0, category: {} };
    const lm = legacyMonthly.get(card.name)   ?? 0;
    const lq = legacyQuarterly.get(card.name) ?? 0;
    return calculateMilesForCard(card, input, monthly, quarterly, lm, lq);
  });

  return recommendations.sort((a, b) => {
    const diff = b.milesEarned - a.milesEarned;
    if (Math.abs(diff) > 0.01) return diff;
    return Number(a.isCapped) - Number(b.isCapped);
  });
}
