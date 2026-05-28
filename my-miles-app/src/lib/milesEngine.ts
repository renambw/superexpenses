// src/lib/milesEngine.ts
//
// 設計方針：
//   - 信用卡規則は全て Supabase の credit_cards テーブルから読み込む
//   - ハードコードされた CARD_RULES 配列を廃止し、DB 駆動型に移行
//   - カードルールは 60 秒間キャッシュして API 呼び出しを最小化
//   - 計分ロジック（上限追蹤・加重平均）は変更なし

import { supabase } from './supabase';
import type {
  Category,
  CreditCard,
  CardRecommendation,
  TransactionInput,
  MonthlyCardUsage,
} from '@/types';

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
    // キャッシュが残っていれば古いデータを返す（フォールバック）
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
// 1 枚のカードに対する里数計算
// ============================================================
function calculateMilesForCard(
  card: CreditCard,
  input: TransactionInput,
  currentMonthlyUsage: number
): CardRecommendation {
  const { amountHKD, currency, category } = input;
  const isOverseas = currency !== 'HKD';

  let effectiveRate = card.base_rate;
  let isCapped = false;
  let cappedNote: string | undefined;
  let isOverseasBonus = false;
  let isBelowMinSpend = false;
  let minSpendNote: string | undefined;

  // ── ステップ 1：最低消費額チェック ──────────────────────────
  if (card.min_spend_hkd !== null && amountHKD < card.min_spend_hkd) {
    isBelowMinSpend = true;
    minSpendNote = `需達 HKD ${card.min_spend_hkd.toLocaleString()} 最低消費`;
    // 最低消費未達でも計算は続行（ユーザーに情報を提示するため）
  }

  // ── ステップ 2：適用利率を決定（優先順位：分類 > 海外 > 基本）──
  const catRate = card.category_rates?.[category as Category];
  if (catRate !== undefined) {
    effectiveRate = catRate;
  } else if (isOverseas && card.overseas_rate !== null) {
    effectiveRate = card.overseas_rate;
    isOverseasBonus = true;
  }

  // ── ステップ 3：月間上限チェックと加重平均計算 ──────────────
  if (
    card.monthly_cap_limit !== null &&
    card.monthly_cap_rate !== null &&
    card.monthly_cap_apply_to !== null
  ) {
    const { monthly_cap_limit, monthly_cap_rate, monthly_cap_apply_to } = card;

    const isSubjectToCap =
      monthly_cap_apply_to === 'all' ||
      (monthly_cap_apply_to === 'overseas' && isOverseas) ||
      (monthly_cap_apply_to === 'category' && catRate !== undefined);

    if (isSubjectToCap) {
      const remainingCap = monthly_cap_limit - currentMonthlyUsage;

      if (remainingCap <= 0) {
        // 上限を完全に超過：優遇レートなし
        effectiveRate = monthly_cap_rate;
        isCapped = true;
        cappedNote = `本月優惠額度已用盡（上限 HKD ${monthly_cap_limit.toLocaleString()}）`;
      } else if (remainingCap < amountHKD) {
        // 部分超過：加重平均で計算
        const preferentialRate =
          catRate ??
          (isOverseas && card.overseas_rate !== null ? card.overseas_rate : null) ??
          card.base_rate;

        const milesInCap   = remainingCap / preferentialRate;
        const milesOverCap = (amountHKD - remainingCap) / monthly_cap_rate;
        const totalMiles   = milesInCap + milesOverCap;
        const weightedRate = amountHKD / totalMiles;

        return {
          cardId: card.id,
          cardName: card.name,
          milesEarned: parseFloat(totalMiles.toFixed(2)),
          effectiveRate: parseFloat(weightedRate.toFixed(2)),
          baseRate: card.base_rate,
          isCapped: true,
          cappedNote: `部分金額（HKD ${remainingCap.toLocaleString()}）享優惠，超出部分套用基本里數`,
          isOverseasBonus,
          isBelowMinSpend,
          minSpendNote,
        };
      }
    }
  }

  const milesEarned = amountHKD / effectiveRate;

  return {
    cardId: card.id,
    cardName: card.name,
    milesEarned: parseFloat(milesEarned.toFixed(2)),
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
  const [cards, usageMap] = await Promise.all([
    fetchCardRules(),
    getMonthlyUsageMap(),
  ]);

  const recommendations = cards.map((card) => {
    const currentUsage = usageMap.get(card.name) ?? 0;
    return calculateMilesForCard(card, input, currentUsage);
  });

  // 里数の多い順にソート。同点の場合は上限未達を優先
  return recommendations.sort((a, b) => {
    const diff = b.milesEarned - a.milesEarned;
    if (Math.abs(diff) > 0.01) return diff;
    return Number(a.isCapped) - Number(b.isCapped);
  });
}
