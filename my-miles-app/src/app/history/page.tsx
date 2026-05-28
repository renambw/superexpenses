'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Transaction } from '@/types';

const CATEGORY_META: Record<string, { emoji: string; bg: string; color: string }> = {
  '飲食':     { emoji: '🍜', bg: '#FDF3E8', color: '#C07A4A' },
  '購物':     { emoji: '🛍', bg: '#F5EDE3', color: '#9A7350' },
  '酒店':     { emoji: '🏨', bg: '#EEF2F8', color: '#7D8FAB' },
  '交通':     { emoji: '🚇', bg: '#EEF5F0', color: '#7DAB8A' },
  '娛樂':     { emoji: '🎬', bg: '#F5EEF3', color: '#AB7D9A' },
  '通訊':     { emoji: '📱', bg: '#EEF3F5', color: '#7A9AAB' },
  '手信/禮物': { emoji: '🎁', bg: '#FDF0F0', color: '#C47A7A' },
  '醫療/保險': { emoji: '💊', bg: '#EEF5F0', color: '#7DAB8A' },
  '雜項':     { emoji: '📋', bg: '#EFE9E1', color: '#A8948A' },
};

export default function HistoryPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading]           = useState(true);
  const [deleting, setDeleting]         = useState<string | null>(null);

  const fetchTransactions = async () => {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error && data) setTransactions(data as Transaction[]);
    setLoading(false);
  };

  useEffect(() => { fetchTransactions(); }, []);

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
