'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { Transaction, CreditCard } from '@/types';

const CATEGORY_META: Record<string, { emoji: string; bg: string; color: string }> = {
  '飲食':     { emoji: '🍜', bg: '#FDF3E8', color: '#C07A4A' },
  '購物':     { emoji: '🛍', bg: '#F5EDE3', color: '#9A7350' },
  '酒店':     { emoji: '🏨', bg: '#EEF2F8', color: '#7D8FAB' },
  '旅遊':     { emoji: '✈️', bg: '#EAF2F8', color: '#5D8AAB' },
  '交通':     { emoji: '🚇', bg: '#EEF5F0', color: '#7DAB8A' },
  '娛樂':     { emoji: '🎬', bg: '#F5EEF3', color: '#AB7D9A' },
  '通訊':     { emoji: '📱', bg: '#EEF3F5', color: '#7A9AAB' },
  '手信/禮物': { emoji: '🎁', bg: '#FDF0F0', color: '#C47A7A' },
  '醫療/保險': { emoji: '💊', bg: '#EEF5F0', color: '#7DAB8A' },
  '雜項':     { emoji: '📋', bg: '#EFE9E1', color: '#A8948A' },
};

// 根據結單日計算本期開始日期
function getCycleStart(statementDate: number): Date {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-indexed
  const day = today.getDate();

  let cycleStart: Date;
  if (day >= statementDate) {
    // 本月結單日已過，本期從本月結單日開始
    cycleStart = new Date(year, month, statementDate);
  } else {
    // 本月結單日未到，本期從上月結單日開始
    cycleStart = new Date(year, month - 1, statementDate);
  }
  cycleStart.setHours(0, 0, 0, 0);
  return cycleStart;
}

// 根據結單日計算本期結束日期（下一個結單日前一天）
function getCycleEnd(statementDate: number): Date {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const day = today.getDate();

  let cycleEnd: Date;
  if (day >= statementDate) {
    // 本月結單日已過，本期到下月結單日前一天
    cycleEnd = new Date(year, month + 1, statementDate - 1);
  } else {
    // 本月結單日未到，本期到本月結單日前一天
    cycleEnd = new Date(year, month, statementDate - 1);
  }
  cycleEnd.setHours(23, 59, 59, 999);
  return cycleEnd;
}

// 格式化日期為 M月D號
function formatDate(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}號`;
}

interface CardCycleSummary {
  cardName: string;
  statementDate: number;
  cycleStart: Date;
  cycleEnd: Date;
  totalHKD: number;
  txCount: number;
  userMonthlyLimit: number | null;
}

export default function HistoryPage() {
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading]           = useState(true);
  const [deleting, setDeleting]         = useState<string | null>(null);
  const [cycleSummaries, setCycleSummaries] = useState<CardCycleSummary[]>([]);
  const [cycleExpanded, setCycleExpanded] = useState(false);

  const fetchData = async () => {
    // 取得最近 50 筆交易
    const { data: txData, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (!txError && txData) setTransactions(txData as Transaction[]);

    // 取得所有信用卡（含結單日和月度上限）
    const { data: cardData, error: cardError } = await supabase
      .from('credit_cards')
      .select('id, name, statement_date, user_monthly_limit')
      .order('name');

    if (!cardError && cardData && cardData.length > 0) {
      // 計算每張卡的本期開始日期
      const cards = cardData as Pick<CreditCard, 'id' | 'name' | 'statement_date' | 'user_monthly_limit'>[];

      // 找出最早的本期開始日期，一次性查詢所有交易
      const earliestStart = cards.reduce((earliest, card) => {
        const start = getCycleStart(card.statement_date ?? 1);
        return start < earliest ? start : earliest;
      }, new Date());

      const { data: cycleData, error: cycleError } = await supabase
        .from('transactions')
        .select('*')
        .gte('created_at', earliestStart.toISOString())
        .neq('card_used', '現金');

      if (!cycleError && cycleData) {
        const allTx = cycleData as Transaction[];

        const summaries: CardCycleSummary[] = cards.map((card) => {
          const statDate = card.statement_date ?? 1;
          const cycleStart = getCycleStart(statDate);
          const cycleEnd = getCycleEnd(statDate);

          // 篩選本期內使用此卡的交易
          const cardTx = allTx.filter((tx) => {
            if (tx.card_used !== card.name) return false;
            const txDate = new Date(tx.created_at);
            return txDate >= cycleStart && txDate <= cycleEnd;
          });

          return {
            cardName: card.name,
            statementDate: statDate,
            cycleStart,
            cycleEnd,
            totalHKD: cardTx.reduce((sum, tx) => sum + Number(tx.amount_hkd), 0),
            txCount: cardTx.length,
            userMonthlyLimit: card.user_monthly_limit,
          };
        });

        // 只顯示有使用記錄的卡，或所有卡（按字母排序）
        setCycleSummaries(summaries);
      }
    }

    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    await supabase.from('transactions').delete().eq('id', id);
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    setDeleting(null);
  };

  // 日付でグループ化
  const grouped = transactions.reduce((acc, tx) => {
    const date = new Date(tx.created_at).toLocaleDateString('zh-HK', {
      month: 'long', day: 'numeric', weekday: 'short',
    });
    if (!acc[date]) acc[date] = [];
    acc[date].push(tx);
    return acc;
  }, {} as Record<string, Transaction[]>);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#EFE9E1' }}>
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: '#C4A482', borderTopColor: 'transparent' }}
          />
          <p className="text-sm" style={{ color: '#A8948A' }}>載入中 🌸</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#EFE9E1' }}>
      <div className="max-w-md mx-auto px-5 pt-12 pb-6 space-y-5">

        {/* ── Header ── */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: '#5C4A43' }}>
              紀錄 🌸
            </h1>
            <p className="text-[10px] mt-0.5 tracking-widest uppercase" style={{ color: '#A8948A' }}>
              Transaction History
            </p>
          </div>
          <div
            className="px-3 py-1.5 rounded-full text-xs font-medium"
            style={{ background: '#FFFDF9', color: '#9A7350', boxShadow: '0 2px 8px rgba(92,74,67,0.10)' }}
          >
            最近 50 筆
          </div>
        </header>

        {/* ── 本期信用卡消費統計 ── */}
        {cycleSummaries.length > 0 && (
          <section>
            <button
              onClick={() => setCycleExpanded((v) => !v)}
              className="flex items-center gap-2 px-1 mb-3 w-full text-left"
            >
              <span className="text-[10px] tracking-widest uppercase" style={{ color: '#A8948A' }}>
                📅 本期信用卡消費（結單日計算）
              </span>
              <span
                className="ml-auto text-xs transition-transform duration-200"
                style={{
                  color: '#A8948A',
                  display: 'inline-block',
                  transform: cycleExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              >
                ▼
              </span>
            </button>
            {cycleExpanded && (
            <div
              className="rounded-3xl overflow-hidden"
              style={{
                background: '#FFFDF9',
                boxShadow: '0 4px 16px rgba(92,74,67,0.08)',
                border: '1px solid #EFE9E1',
              }}
            >
              {cycleSummaries.map((summary, i) => {
                const usagePercent = summary.userMonthlyLimit
                  ? Math.min((summary.totalHKD / summary.userMonthlyLimit) * 100, 100)
                  : null;
                const remaining = summary.userMonthlyLimit
                  ? summary.userMonthlyLimit - summary.totalHKD
                  : null;
                const isOverLimit = remaining !== null && remaining < 0;
                const isNearLimit = remaining !== null && remaining >= 0 && remaining < (summary.userMonthlyLimit! * 0.2);

                return (
                  <div
                    key={summary.cardName}
                    className="px-4 py-3.5"
                    style={{
                      borderBottom: i < cycleSummaries.length - 1 ? '1px solid #F5EDE3' : 'none',
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{ color: '#5C4A43' }}>
                          {summary.cardName}
                        </p>
                        <p className="text-[10px] mt-0.5" style={{ color: '#A8948A' }}>
                          📅 {formatDate(summary.cycleStart)} – {formatDate(summary.cycleEnd)}
                          （{summary.statementDate}號結單）
                        </p>
                        {/* 進度條（有設月度上限時顯示） */}
                        {summary.userMonthlyLimit !== null && usagePercent !== null && (
                          <div className="mt-2">
                            <div
                              className="w-full h-1.5 rounded-full overflow-hidden"
                              style={{ background: '#EFE9E1' }}
                            >
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${usagePercent}%`,
                                  background: isOverLimit
                                    ? '#C47A7A'
                                    : isNearLimit
                                    ? '#D4956A'
                                    : '#C4A482',
                                }}
                              />
                            </div>
                            <p className="text-[10px] mt-1" style={{
                              color: isOverLimit ? '#C47A7A' : isNearLimit ? '#D4956A' : '#A8948A'
                            }}>
                              {isOverLimit
                                ? `🚨 已超出月限 HKD ${Math.abs(remaining!).toLocaleString('zh-HK', { maximumFractionDigits: 0 })}`
                                : isNearLimit
                                ? `⚠️ 還有 HKD ${remaining!.toLocaleString('zh-HK', { maximumFractionDigits: 0 })} 到達月限`
                                : `月限餘額 HKD ${remaining!.toLocaleString('zh-HK', { maximumFractionDigits: 0 })}`
                              }
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-base font-semibold" style={{ color: '#9A7350' }}>
                          HKD {summary.totalHKD.toLocaleString('zh-HK', { maximumFractionDigits: 0 })}
                        </p>
                        <p className="text-[10px]" style={{ color: '#CDB99F' }}>
                          {summary.txCount} 筆
                        </p>
                        {summary.userMonthlyLimit !== null && (
                          <p className="text-[10px]" style={{ color: '#CDB99F' }}>
                            / HKD {summary.userMonthlyLimit.toLocaleString('zh-HK', { maximumFractionDigits: 0 })}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </section>
        )}

        {/* ── 交易記錄 ── */}
        {transactions.length === 0 ? (
          <div
            className="rounded-3xl p-12 text-center"
            style={{ background: '#FFFDF9', border: '1px solid #EFE9E1' }}
          >
            <p className="text-3xl mb-3">🌸</p>
            <p className="text-sm" style={{ color: '#A8948A' }}>尚無消費紀錄</p>
            <p className="text-xs mt-1" style={{ color: '#CDB99F' }}>前往記帳頁面開始記錄</p>
          </div>
        ) : (
          Object.entries(grouped).map(([date, txs]) => (
            <div key={date} className="space-y-2">
              {/* 日付ラベル */}
              <div className="flex items-center gap-2 px-1">
                <p className="text-xs font-medium" style={{ color: '#A8948A' }}>{date}</p>
                <div className="flex-1 h-px" style={{ background: '#E0D4C6' }} />
                <p className="text-xs" style={{ color: '#CDB99F' }}>
                  HKD {txs.reduce((s, t) => s + Number(t.amount_hkd), 0)
                    .toLocaleString('zh-HK', { maximumFractionDigits: 0 })}
                </p>
              </div>

              {/* トランザクションカード */}
              <div
                className="rounded-3xl overflow-hidden"
                style={{
                  background: '#FFFDF9',
                  boxShadow: '0 4px 16px rgba(92,74,67,0.08)',
                  border: '1px solid #EFE9E1',
                }}
              >
                {txs.map((tx, i) => {
                  const meta = CATEGORY_META[tx.category] ?? { emoji: '📋', bg: '#EFE9E1', color: '#A8948A' };
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center gap-3 px-4 py-3.5"
                      style={{
                        borderBottom: i < txs.length - 1 ? '1px solid #F5EDE3' : 'none',
                      }}
                    >
                      {/* カテゴリアイコン */}
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-base shrink-0"
                        style={{ background: meta.bg }}
                      >
                        {meta.emoji}
                      </div>

                      {/* 詳細 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-medium truncate" style={{ color: '#5C4A43' }}>
                            {tx.description || tx.category}
                          </p>
                          {tx.is_overseas && (
                            <span
                              className="text-[9px] px-1.5 py-0.5 rounded-full shrink-0"
                              style={{ background: '#FFF8EF', color: '#C4A482' }}
                            >
                              海外
                            </span>
                          )}
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: '#A8948A' }}>
                          {tx.card_used}
                          <span
                            className="ml-1.5 font-medium"
                            style={{ color: '#C4A482' }}
                          >
                            +{Math.floor(tx.miles_earned).toLocaleString()} 里 ✨
                          </span>
                        </p>
                      </div>

                      {/* 金額 */}
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold" style={{ color: '#9A7350' }}>
                          {tx.currency !== 'HKD'
                            ? `${tx.currency} ${Number(tx.amount_original).toLocaleString()}`
                            : `HKD ${Number(tx.amount_hkd).toLocaleString('zh-HK', { maximumFractionDigits: 0 })}`
                          }
                        </p>
                        {tx.currency !== 'HKD' && (
                          <p className="text-[10px]" style={{ color: '#A8948A' }}>
                            ≈ HKD {Number(tx.amount_hkd).toLocaleString('zh-HK', { maximumFractionDigits: 0 })}
                          </p>
                        )}
                      </div>

                      {/* 削除ボタン */}
                      <button
                        onClick={() => handleDelete(tx.id)}
                        disabled={deleting === tx.id}
                        className="ml-1 w-7 h-7 flex items-center justify-center rounded-full transition-all active:scale-90 disabled:opacity-40 shrink-0"
                        style={{ color: '#CDB99F' }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = '#FDF0F0';
                          (e.currentTarget as HTMLButtonElement).style.color = '#C47A7A';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                          (e.currentTarget as HTMLButtonElement).style.color = '#CDB99F';
                        }}
                      >
                        {deleting === tx.id ? (
                          <div
                            className="w-3 h-3 rounded-full border border-t-transparent animate-spin"
                            style={{ borderColor: '#C4A482', borderTopColor: 'transparent' }}
                          />
                        ) : (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14H6L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4h6v2" />
                          </svg>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}

      </div>
    </div>
  );
}
