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

const CATEGORY_COLORS: Record<string, string> = {
  '飲食': 'bg-rose-400',
  '購物': 'bg-violet-400',
  '酒店': 'bg-blue-400',
  '交通': 'bg-sky-400',
  '娛樂': 'bg-amber-400',
  '通訊': 'bg-teal-400',
  '手信/禮物': 'bg-pink-400',
  '醫療/保險': 'bg-green-400',
  '雜項': 'bg-gray-400',
};

export default function DashboardPage() {
  const [data, setData]       = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const now      = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const { data: txs, error } = await supabase
        .from('transactions')
        .select('amount_hkd, miles_earned, category, card_used')
        .gte('created_at', firstDay);

      if (error || !txs) { setLoading(false); return; }

      const totalSpentHKD = txs.reduce((s, t) => s + Number(t.amount_hkd), 0);
      const totalMiles    = txs.reduce((s, t) => s + Number(t.miles_earned), 0);

      const catMap = new Map<string, number>();
      txs.forEach((t) => {
        catMap.set(t.category, (catMap.get(t.category) ?? 0) + Number(t.amount_hkd));
      });
      const categoryBreakdown = Array.from(catMap.entries())
        .map(([category, total]) => ({ category: category as Category, total }))
        .sort((a, b) => b.total - a.total);

      const cardMap = new Map<string, { total: number; miles: number }>();
      txs.forEach((t) => {
        const prev = cardMap.get(t.card_used) ?? { total: 0, miles: 0 };
        cardMap.set(t.card_used, {
          total: prev.total + Number(t.amount_hkd),
          miles: prev.miles + Number(t.miles_earned),
        });
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const milesProgress = Math.min(((data?.totalMiles ?? 0) / MILES_GOAL) * 100, 100);
  const monthLabel = new Date().toLocaleDateString('zh-HK', { year: 'numeric', month: 'long' });

  return (
    <div className="min-h-screen text-gray-900">
      <div className="max-w-md mx-auto px-5 pt-12 pb-6 space-y-6">

        {/* Header */}
        <header>
          <h1 className="text-2xl font-light tracking-tight">總覽</h1>
          <p className="text-[10px] text-gray-400 mt-0.5 tracking-widest uppercase">{monthLabel}</p>
        </header>

        {/* 本月總支出 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center space-y-2">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest">本月總支出</p>
          <p className="text-5xl font-extralight tracking-tight tabular-nums">
            ${(data?.totalSpentHKD ?? 0).toLocaleString('zh-HK', { maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs text-gray-400">HKD</p>
        </div>

        {/* Asia Miles 進度 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex justify-between items-end">
            <h2 className="text-sm font-medium text-gray-700">Asia Miles 進度</h2>
            <div className="text-right">
              <span className="text-2xl font-light tabular-nums">
                {Math.floor(data?.totalMiles ?? 0).toLocaleString()}
              </span>
              <span className="text-xs text-gray-400 ml-1">/ {MILES_GOAL.toLocaleString()}</span>
            </div>
          </div>
          <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gray-900 rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${milesProgress}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 text-right">已達成 {milesProgress.toFixed(1)}%</p>
        </div>

        {/* 支出分類 */}
        {data && data.categoryBreakdown.length > 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <h2 className="text-sm font-medium text-gray-700">支出分類</h2>
            <div className="space-y-3">
              {data.categoryBreakdown.map(({ category, total }) => {
                const pct = data.totalSpentHKD > 0 ? (total / data.totalSpentHKD) * 100 : 0;
                const color = CATEGORY_COLORS[category] ?? 'bg-gray-400';
                return (
                  <div key={category} className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">{category}</span>
                      <span className="text-gray-900 tabular-nums">
                        HKD {total.toLocaleString('zh-HK', { maximumFractionDigits: 0 })}
                        <span className="text-gray-400 ml-1.5 text-xs">({pct.toFixed(0)}%)</span>
                      </span>
                    </div>
                    <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all duration-700`}
                        style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            <p className="text-sm text-gray-400">本月尚無消費紀錄</p>
            <p className="text-xs text-gray-300 mt-1">開始記帳後，分類統計將顯示於此</p>
          </div>
        )}

        {/* 信用卡使用 */}
        {data && data.cardBreakdown.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <h2 className="text-sm font-medium text-gray-700">信用卡使用</h2>
            <div className="space-y-1">
              {data.cardBreakdown.map(({ card, total, miles }) => (
                <div key={card}
                  className="flex justify-between items-center py-3 border-b border-gray-50 last:border-0"
                >
                  <div>
                    <p className="text-sm text-gray-800">{card}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      +{Math.floor(miles).toLocaleString()} Asia Miles
                    </p>
                  </div>
                  <p className="text-sm font-medium tabular-nums">
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
