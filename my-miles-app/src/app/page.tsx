'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { convertToHKD } from '@/lib/frankfurter';
import { recommendCards } from '@/lib/milesEngine';
import type { Category, CardName, CardRecommendation } from '@/types';

const CATEGORIES: Category[] = [
  '飲食', '購物', '酒店', '交通', '娛樂', '通訊', '手信/禮物', '醫療/保險', '雜項',
];

const CURRENCIES = ['HKD', 'JPY', 'USD', 'EUR', 'GBP', 'CNY', 'TWD', 'AUD', 'SGD'];

export default function HomePage() {
  const [amount, setAmount]           = useState('');
  const [currency, setCurrency]       = useState('HKD');
  const [category, setCategory]       = useState<Category>('飲食');
  const [description, setDescription] = useState('');

  const [hkdAmount, setHkdAmount]       = useState<number>(0);
  const [exchangeRate, setExchangeRate] = useState<number>(1);
  const [rateDate, setRateDate]         = useState<string>('');
  const [rateLoading, setRateLoading]   = useState(false);

  const [recommendations, setRecommendations] = useState<CardRecommendation[]>([]);
  const [recLoading, setRecLoading]           = useState(false);

  const [saving, setSaving]       = useState(false);
  const [savedCard, setSavedCard] = useState<CardName | null>(null);
  const [error, setError]         = useState<string | null>(null);

  // 金額・幣種変更時に匯率を取得
  useEffect(() => {
    const numericAmount = parseFloat(amount);
    if (!amount || isNaN(numericAmount) || numericAmount <= 0) {
      setHkdAmount(0);
      setRecommendations([]);
      return;
    }
    const timer = setTimeout(async () => {
      setRateLoading(true);
      setError(null);
      try {
        const { amountHKD, rate, date } = await convertToHKD(numericAmount, currency);
        setHkdAmount(amountHKD);
        setExchangeRate(rate);
        setRateDate(date);
      } catch {
        setError('無法取得匯率，請稍後再試。');
      } finally {
        setRateLoading(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [amount, currency]);

  // HKD 金額・分類変更時に推薦を計算
  useEffect(() => {
    if (hkdAmount <= 0) { setRecommendations([]); return; }
    const fetchRecs = async () => {
      setRecLoading(true);
      try {
        const recs = await recommendCards({
          amountOriginal: parseFloat(amount),
          currency,
          exchangeRate,
          amountHKD: hkdAmount,
          category,
        });
        setRecommendations(recs);
      } catch { /* silent */ }
      finally { setRecLoading(false); }
    };
    fetchRecs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hkdAmount, category]);

  // Supabase に保存
  const handleSave = useCallback(async (rec: CardRecommendation) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    const { error: dbError } = await supabase.from('transactions').insert([{
      amount_original: parseFloat(amount),
      currency,
      exchange_rate: exchangeRate,
      amount_hkd: hkdAmount,
      category,
      card_used: rec.cardName,
      miles_earned: rec.milesEarned,
      is_overseas: currency !== 'HKD',
      description: description || null,
    }]);
    setSaving(false);
    if (dbError) {
      setError('儲存失敗：' + dbError.message);
    } else {
      setSavedCard(rec.cardName);
      setTimeout(() => {
        setAmount(''); setDescription('');
        setSavedCard(null); setRecommendations([]); setHkdAmount(0);
      }, 2000);
    }
  }, [amount, currency, exchangeRate, hkdAmount, category, description, saving]);

  return (
    <div className="min-h-screen text-gray-900">
      <div className="max-w-md mx-auto px-5 pt-12 pb-6 space-y-8">

        {/* Header */}
        <header>
          <h1 className="text-2xl font-light tracking-tight">記帳</h1>
          <p className="text-[10px] text-gray-400 mt-0.5 tracking-widest uppercase">Miles Tracker</p>
        </header>

        {/* 入力フォーム */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
          {/* 金額 + 幣種 */}
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-[10px] text-gray-400 uppercase tracking-widest mb-2">金額</label>
              <input
                type="number" inputMode="decimal"
                value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full text-4xl font-light bg-transparent border-b border-gray-200 focus:border-gray-900 outline-none pb-2 transition-colors placeholder:text-gray-200"
              />
            </div>
            <div className="w-20 pb-2">
              <label className="block text-[10px] text-gray-400 uppercase tracking-widest mb-2">幣種</label>
              <select
                value={currency} onChange={(e) => setCurrency(e.target.value)}
                className="w-full text-xl font-light bg-transparent border-b border-gray-200 focus:border-gray-900 outline-none pb-2 cursor-pointer appearance-none"
              >
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* 匯率表示 */}
          {currency !== 'HKD' && hkdAmount > 0 && !rateLoading && (
            <div className="flex justify-between text-xs text-gray-400">
              <span>1 {currency} = {exchangeRate.toFixed(4)} HKD（{rateDate}）</span>
              <span className="font-medium text-gray-600">≈ HKD {hkdAmount.toFixed(2)}</span>
            </div>
          )}
          {rateLoading && <p className="text-xs text-gray-400 animate-pulse">正在取得匯率…</p>}

          {/* 分類 */}
          <div>
            <label className="block text-[10px] text-gray-400 uppercase tracking-widest mb-3">分類</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button key={cat} onClick={() => setCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    category === cat ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >{cat}</button>
              ))}
            </div>
          </div>

          {/* 備注 */}
          <div>
            <label className="block text-[10px] text-gray-400 uppercase tracking-widest mb-2">備注（選填）</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="例：新宿拉麵"
              className="w-full text-sm bg-transparent border-b border-gray-200 focus:border-gray-900 outline-none pb-2 transition-colors placeholder:text-gray-300"
            />
          </div>
        </section>

        {/* エラー */}
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {/* 推薦リスト */}
        {(recLoading || recommendations.length > 0) && (
          <section className="space-y-3">
            <h2 className="text-[10px] text-gray-400 uppercase tracking-widest">最佳支付方式</h2>

            {recLoading ? (
              <div className="space-y-3">
                {[1,2,3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
              </div>
            ) : (
              recommendations.map((rec, index) => {
                const isSaved = savedCard === rec.cardName;
                const isBest  = index === 0;
                return (
                  <button key={rec.cardName} onClick={() => handleSave(rec)}
                    disabled={saving || !!savedCard}
                    className={`w-full p-4 rounded-xl border text-left transition-all active:scale-[0.98] disabled:cursor-default ${
                      isSaved ? 'border-emerald-400 bg-emerald-50'
                      : isBest ? 'border-gray-900 bg-gray-900 text-white shadow-lg'
                      : 'border-gray-100 bg-white hover:border-gray-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-sm">{rec.cardName}</span>
                          {isBest && !isSaved && (
                            <span className="text-[9px] bg-white text-gray-900 px-1.5 py-0.5 rounded-full font-semibold">最佳</span>
                          )}
                          {rec.isOverseasBonus && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${isBest ? 'bg-gray-700 text-gray-300' : 'bg-blue-50 text-blue-500'}`}>
                              海外加成
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">
                          HKD {rec.effectiveRate}/里
                          {rec.isCapped && <span className="ml-1 text-amber-500">⚠ 已達上限</span>}
                        </p>
                        {rec.isCapped && rec.cappedNote && (
                          <p className="text-[10px] text-amber-500 leading-tight">{rec.cappedNote}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        {isSaved ? (
                          <span className="text-emerald-600 font-semibold text-sm">已記錄 ✓</span>
                        ) : (
                          <>
                            <p className="text-xl font-light">+{Math.floor(rec.milesEarned).toLocaleString()}</p>
                            <p className={`text-[10px] ${isBest ? 'text-gray-400' : 'text-gray-400'}`}>Asia Miles</p>
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
            <p className="text-[10px] text-center text-gray-300 pt-1">點擊卡片即可記錄此筆消費</p>
          </section>
        )}

      </div>
    </div>
  );
}
