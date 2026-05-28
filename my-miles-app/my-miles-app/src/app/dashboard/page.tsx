'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Category, CardName } from '@/types';

interface DashboardData {
  totalSpentHKD: number;
  totalMiles: number;
  categoryBreakdown: { category: Category; total: number }[];
  cardBreakdown: { card: CardName; total: number; miles: number }[];
}

const MILES_GOAL = 10000;

const CATEGORY_META: Record<string, { emoji: string; color: string; bg: string }> = {
  '飲食':     { emoji: '🍜', color: '#C07A4A', bg: '#FDF3E8' },
  '購物':     { emoji: '🛍', color: '#9A7350', bg: '#F5EDE3' },
  '酒店':     { emoji: '🏨', color: '#7D8FAB', bg: '#EEF2F8' },
  '交通':     { emoji: '🚇', color: '#7DAB8A', bg: '#EEF5F0' },
  '娛樂':     { emoji: '🎬', color: '#AB7D9A', bg: '#F5EEF3' },
  '通訊':     { emoji: '📱', color: '#7A9AAB', bg: '#EEF3F5' },
  '手信/禮物': { emoji: '🎁', color: '#C47A7A', bg: '#FDF0F0' },
  '醫療/保險': { emoji: '💊', color: '#7DAB8A', bg: '#EEF5F0' },
  '雜項':     { emoji: '📋', color: '#A8948A', bg: '#EFE9E1' },
};

// カード背景グラデーション（インデックス順）
const CARD_GRADIENTS = [
  'linear-gradient(135deg, #9A7350 0%, #C4A482 100%)',
  'linear-gradient(135deg, #C4A482 0%, #E0D4C6 100%)',
  'linear-gradient(135deg, #7D5C3E 0%, #9A7350 100%)',
  'linear-gradient(135deg, #CDB99F 0%, #EFE9E1 100%)',
  'linear-gradient(135deg, #B08B65 0%, #CDB99F 100%)',
];

export default function DashboardPage() {
  const [data, setData]       = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const firstDay = new Date(
        new Date().getFullYear(), new Date().getMonth(), 1
      ).toISOString();

      const { data: txs, error } = await supabase
        .from('transactions')
        .select('amount_hkd, miles_earned, category, card_used')
        .gte('created_at', firstDay);

      if (error || !txs) { setLoading(false); return; }

      const totalSpentHKD = txs.reduce((s, t) => s + Number(t.amount_hkd), 0);
      const totalMiles    = txs.reduce((s, t) => s + Number(t.miles_earned), 0);

      const catMap = new Map<string, number>();
      txs.forEach((t) => catMap.set(t.category, (catMap.get(t.category) ?? 0) + Number(t.amount_hkd)));
      const categoryBreakdown = Array.from(catMap.entries())
        .map(([category, total]) => ({ category: category as Category, total }))
        .sort((a, b) => b.total - a.total);

      const cardMap = new Map<string, { total: number; miles: number }>();
      txs.forEach((t) => {
        const p = cardMap.get(t.card_used) ?? { total: 0, miles: 0 };
        cardMap.set(t.card_used, { total: p.total + Number(t.amount_hkd), miles: p.miles + Number(t.miles_earned) });
      });
      const cardBreakdown = Array.from(cardMap.entries())
        .map(([card, v]) => ({ card: card as CardName, ...v }))
        .sort((a, b) => b.total - a.total);

      setData({ totalSpentHKD, totalMiles, categoryBreakdown, cardBreakdown });
      setLoading(false);
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#EFE9E1' }}>
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: '#C4A482', borderTopColor: 'transparent' }}
          />
          <p className="text-sm" style={{ color: '#A8948A' }}>載入中 ☕</p>
        </div>
      </div>
    );
  }

  const milesProgress = Math.min(((data?.totalMiles ?? 0) / MILES_GOAL) * 100, 100);
  const monthLabel = new Date().toLocaleDateString('zh-HK', { year: 'numeric', month: 'long' });

  return (
    <div className="min-h-screen" style={{ background: '#EFE9E1' }}>
      <div className="max-w-md mx-auto px-5 pt-12 pb-6 space-y-5">

        {/* ── Header ── */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: '#5C4A43' }}>
              總覽 ☕
            </h1>
            <p className="text-[10px] mt-0.5 tracking-widest uppercase" style={{ color: '#A8948A' }}>
              {monthLabel}
            </p>
          </div>
          <div
            className="px-3 py-1.5 rounded-full text-xs font-medium"
            style={{ background: '#FFFDF9', color: '#9A7350', boxShadow: '0 2px 8px rgba(92,74,67,0.10)' }}
          >
            本月報告
          </div>
        </header>

        {/* ── 本月總支出 ── */}
        <div
          className="rounded-3xl p-8 text-center space-y-2"
          style={{
            background: 'linear-gradient(135deg, #9A7350 0%, #C4A482 100%)',
            boxShadow: '0 8px 32px rgba(154,115,80,0.30)',
          }}
        >
          <p className="text-[10px] tracking-widest uppercase" style={{ color: 'rgba(255,253,249,0.7)' }}>
            本月總支出
          </p>
          <p className="text-5xl font-extralight tracking-tight" style={{ color: '#FFFDF9' }}>
            ${(data?.totalSpentHKD ?? 0).toLocaleString('zh-HK', { maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs" style={{ color: 'rgba(255,253,249,0.6)' }}>HKD</p>
        </div>

        {/* ── Asia Miles 進度 ── */}
        <div
          className="rounded-3xl p-6 space-y-4"
          style={{
            background: '#FFFDF9',
            boxShadow: '0 4px 20px rgba(92,74,67,0.08)',
            border: '1px solid #EFE9E1',
          }}
        >
          <div className="flex justify-between items-end">
            <div>
              <p className="text-[10px] tracking-widest uppercase mb-1" style={{ color: '#A8948A' }}>
                🌸 Asia Miles 進度
              </p>
              <p className="text-sm font-medium" style={{ color: '#5C4A43' }}>
                目標 {MILES_GOAL.toLocaleString()} 里
              </p>
            </div>
            <div className="text-right">
              <span className="text-3xl font-light" style={{ color: '#9A7350' }}>
                {Math.floor(data?.totalMiles ?? 0).toLocaleString()}
              </span>
              <span className="text-xs ml-1" style={{ color: '#A8948A' }}>里</span>
            </div>
          </div>

          {/* プログレスバー */}
          <div className="h-2.5 w-full rounded-full overflow-hidden" style={{ background: '#EFE9E1' }}>
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${milesProgress}%`,
                background: 'linear-gradient(90deg, #9A7350, #C4A482)',
              }}
            />
          </div>
          <p className="text-xs text-right" style={{ color: '#A8948A' }}>
            已達成 {milesProgress.toFixed(1)}%
          </p>
        </div>

        {/* ── 支出分類 ── */}
        {data && data.categoryBreakdown.length > 0 ? (
          <div
            className="rounded-3xl p-6 space-y-4"
            style={{
              background: '#FFFDF9',
              boxShadow: '0 4px 20px rgba(92,74,67,0.08)',
              border: '1px solid #EFE9E1',
            }}
          >
            <h2 className="text-sm font-semibold" style={{ color: '#5C4A43' }}>
              支出分類 🍜
            </h2>
            <div className="space-y-3">
              {data.categoryBreakdown.map(({ category, total }) => {
                const pct  = data.totalSpentHKD > 0 ? (total / data.totalSpentHKD) * 100 : 0;
                const meta = CATEGORY_META[category] ?? { emoji: '📋', color: '#A8948A', bg: '#EFE9E1' };
                return (
                  <div key={category} className="space-y-1.5">
                    <div className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-7 h-7 rounded-full flex items-center justify-center text-sm"
                          style={{ background: meta.bg }}
                        >
                          {meta.emoji}
                        </span>
                        <span style={{ color: '#5C4A43' }}>{category}</span>
                      </div>
                      <span style={{ color: '#9A7350' }}>
                        HKD {total.toLocaleString('zh-HK', { maximumFractionDigits: 0 })}
                        <span className="text-xs ml-1" style={{ color: '#A8948A' }}>
                          ({pct.toFixed(0)}%)
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: '#EFE9E1' }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: meta.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div
            className="rounded-3xl p-10 text-center"
            style={{ background: '#FFFDF9', border: '1px solid #EFE9E1' }}
          >
            <p className="text-2xl mb-2">🌸</p>
            <p className="text-sm" style={{ color: '#A8948A' }}>本月尚無消費紀錄</p>
            <p className="text-xs mt-1" style={{ color: '#CDB99F' }}>開始記帳後，分類統計將顯示於此</p>
          </div>
        )}

        {/* ── 信用卡使用 ── */}
        {data && data.cardBreakdown.length > 0 && (
          <div
            className="rounded-3xl p-6 space-y-4"
            style={{
              background: '#FFFDF9',
              boxShadow: '0 4px 20px rgba(92,74,67,0.08)',
              border: '1px solid #EFE9E1',
            }}
          >
            <h2 className="text-sm font-semibold" style={{ color: '#5C4A43' }}>
              信用卡使用 🐦
            </h2>
            <div className="space-y-3">
              {data.cardBreakdown.map(({ card, total, miles }, i) => (
                <div
                  key={card}
                  className="flex items-center gap-3 p-3 rounded-2xl"
                  style={{ background: '#FAF7F3' }}
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{
                      background: CARD_GRADIENTS[i % CARD_GRADIENTS.length],
                      color: '#FFFDF9',
                    }}
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: '#5C4A43' }}>{card}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#A8948A' }}>
                      +{Math.floor(miles).toLocaleString()} Asia Miles
                    </p>
                  </div>
                  <p className="text-sm font-semibold shrink-0" style={{ color: '#9A7350' }}>
                    HKD {total.toLocaleString('zh-HK', { maximumFractionDigits: 0 })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
