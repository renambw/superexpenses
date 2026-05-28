'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Transaction } from '@/types';

const CATEGORY_EMOJI: Record<string, string> = {
  '飲食': '🍜',
  '購物': '🛍',
  '酒店': '🏨',
  '交通': '🚇',
  '娛樂': '🎬',
  '通訊': '📱',
  '手信/禮物': '🎁',
  '醫療/保險': '💊',
  '雜項': '📋',
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen text-gray-900">
      <div className="max-w-md mx-auto px-5 pt-12 pb-6 space-y-6">

        <header>
          <h1 className="text-2xl font-light tracking-tight">紀錄</h1>
          <p className="text-[10px] text-gray-400 mt-0.5 tracking-widest uppercase">Transaction History</p>
        </header>

        {transactions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
            <p className="text-sm text-gray-400">尚無消費紀錄</p>
            <p className="text-xs text-gray-300 mt-1">前往記帳頁面開始記錄</p>
          </div>
        ) : (
          Object.entries(grouped).map(([date, txs]) => (
            <div key={date} className="space-y-2">
              <p className="text-xs text-gray-400 px-1">{date}</p>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {txs.map((tx, i) => (
                  <div
                    key={tx.id}
                    className={`flex items-center gap-3 px-4 py-3.5 ${
                      i < txs.length - 1 ? 'border-b border-gray-50' : ''
                    }`}
                  >
                    {/* カテゴリアイコン */}
                    <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-base shrink-0">
                      {CATEGORY_EMOJI[tx.category] ?? '📋'}
                    </div>

                    {/* 詳細 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {tx.description || tx.category}
                        </p>
                        {tx.is_overseas && (
                          <span className="text-[9px] bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded-full shrink-0">
                            海外
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {tx.card_used} · +{Math.floor(tx.miles_earned).toLocaleString()} 里
                      </p>
                    </div>

                    {/* 金額 */}
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium tabular-nums">
                        {tx.currency !== 'HKD'
                          ? `${tx.currency} ${tx.amount_original.toLocaleString()}`
                          : `HKD ${Number(tx.amount_hkd).toLocaleString('zh-HK', { maximumFractionDigits: 0 })}`
                        }
                      </p>
                      {tx.currency !== 'HKD' && (
                        <p className="text-[10px] text-gray-400 tabular-nums">
                          ≈ HKD {Number(tx.amount_hkd).toLocaleString('zh-HK', { maximumFractionDigits: 0 })}
                        </p>
                      )}
                    </div>

                    {/* 削除ボタン */}
                    <button
                      onClick={() => handleDelete(tx.id)}
                      disabled={deleting === tx.id}
                      className="ml-1 w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-400 transition-colors shrink-0"
                    >
                      {deleting === tx.id ? (
                        <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14H6L5 6" />
                          <path d="M10 11v6M14 11v6" />
                          <path d="M9 6V4h6v2" />
                        </svg>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

      </div>
    </div>
  );
}
