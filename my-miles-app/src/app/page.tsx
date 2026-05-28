'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { convertToHKD } from '@/lib/frankfurter';
import { recommendCards } from '@/lib/milesEngine';
import type { Category, CardName, CardRecommendation } from '@/types';

const CATEGORIES: { label: Category; emoji: string }[] = [
  { label: '飲食',    emoji: '🍜' },
  { label: '購物',    emoji: '🛍' },
  { label: '酒店',    emoji: '🏨' },
  { label: '交通',    emoji: '🚇' },
  { label: '娛樂',    emoji: '🎬' },
  { label: '通訊',    emoji: '📱' },
  { label: '手信/禮物', emoji: '🎁' },
  { label: '醫療/保險', emoji: '💊' },
  { label: '雜項',    emoji: '📋' },
];

const CURRENCIES = ['HKD', 'JPY', 'USD', 'EUR', 'GBP', 'CNY', 'TWD', 'AUD', 'SGD'];

// 現金支払いを表す特別な定数
const CASH_CARD_NAME = '現金';

// ── スタイル定数 ──────────────────────────────────────────────
const CARD_BASE =
  'w-full p-4 rounded-3xl border text-left transition-all duration-200 active:scale-[0.97]';

export default function HomePage() {
  const [amount, setAmount]           = useState('');
  const [currency, setCurrency]       = useState('HKD');
  const [category, setCategory]       = useState<Category>('飲食');
  const [description, setDescription] = useState('');
  const [useCash, setUseCash]         = useState(false);

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
    const num = parseFloat(amount);
    if (!amount || isNaN(num) || num <= 0) {
      setHkdAmount(0); setRecommendations([]); return;
    }
    const t = setTimeout(async () => {
      setRateLoading(true); setError(null);
      try {
        const { amountHKD, rate, date } = await convertToHKD(num, currency);
        setHkdAmount(amountHKD); setExchangeRate(rate); setRateDate(date);
      } catch { setError('無法取得匯率，請稍後再試 🙏'); }
      finally { setRateLoading(false); }
    }, 600);
    return () => clearTimeout(t);
  }, [amount, currency]);

  // HKD・分類・現金モード変更時に推薦を計算
  useEffect(() => {
    if (hkdAmount <= 0) { setRecommendations([]); return; }
    // 現金モードの場合は推薦不要
    if (useCash) { setRecommendations([]); return; }
    const run = async () => {
      setRecLoading(true);
      try {
        const recs = await recommendCards({
          amountOriginal: parseFloat(amount), currency,
          exchangeRate, amountHKD: hkdAmount, category,
        });
        setRecommendations(recs);
      } catch { /* silent */ }
      finally { setRecLoading(false); }
    };
    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hkdAmount, category, useCash]);

  // 現金で保存
  const handleSaveCash = useCallback(async () => {
    if (saving || hkdAmount <= 0) return;
    setSaving(true); setError(null);
    const { error: dbErr } = await supabase.from('transactions').insert([{
      amount_original: parseFloat(amount), currency,
      exchange_rate: exchangeRate, amount_hkd: hkdAmount,
      category, card_used: CASH_CARD_NAME,
      miles_earned: 0,
      is_overseas: currency !== 'HKD',
      description: description || null,
    }]);
    setSaving(false);
    if (dbErr) {
      setError('儲存失敗：' + dbErr.message);
    } else {
      setSavedCard(CASH_CARD_NAME);
      setTimeout(() => {
        setAmount(''); setDescription('');
        setSavedCard(null); setRecommendations([]); setHkdAmount(0);
        setUseCash(false);
      }, 2000);
    }
  }, [amount, currency, exchangeRate, hkdAmount, category, description, saving]);

  // 信用卡で保存
  const handleSave = useCallback(async (rec: CardRecommendation) => {
    if (saving) return;
    setSaving(true); setError(null);
    const { error: dbErr } = await supabase.from('transactions').insert([{
      amount_original: parseFloat(amount), currency,
      exchange_rate: exchangeRate, amount_hkd: hkdAmount,
      category, card_used: rec.cardName,
      miles_earned: rec.milesEarned,
      is_overseas: currency !== 'HKD',
      description: description || null,
    }]);
    setSaving(false);
    if (dbErr) {
      setError('儲存失敗：' + dbErr.message);
    } else {
      setSavedCard(rec.cardName);
      setTimeout(() => {
        setAmount(''); setDescription('');
        setSavedCard(null); setRecommendations([]); setHkdAmount(0);
      }, 2000);
    }
  }, [amount, currency, exchangeRate, hkdAmount, category, description, saving]);

  return (
    <div className="min-h-screen" style={{ background: '#EFE9E1' }}>
      <div className="max-w-md mx-auto px-5 pt-12 pb-6 space-y-5">

        {/* ── Header ── */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: '#5C4A43' }}>
              記帳 ✏️
            </h1>
            <p className="text-[10px] mt-0.5 tracking-widest uppercase" style={{ color: '#A8948A' }}>
              🐧記帳本🐧
            </p>
          </div>
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
            style={{ background: '#FFFDF9', boxShadow: '0 2px 8px rgba(92,74,67,0.10)' }}
          >
            ☕
          </div>
        </header>

        {/* ── 入力カード ── */}
        <section
          className="rounded-3xl p-6 space-y-5"
          style={{
            background: '#FFFDF9',
            boxShadow: '0 4px 20px rgba(92,74,67,0.10)',
            border: '1px solid #EFE9E1',
          }}
        >
          {/* 金額 + 幣種 */}
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-[10px] tracking-widest uppercase mb-2" style={{ color: '#A8948A' }}>
                金額
              </label>
              <input
                type="number" inputMode="decimal" step="any"
                value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full text-4xl font-light bg-transparent outline-none pb-2 placeholder:opacity-30"
                style={{
                  color: '#5C4A43',
                  borderBottom: '1.5px solid #E0D4C6',
                  caretColor: '#C4A482',
                }}
                onFocus={(e) => (e.target.style.borderBottomColor = '#C4A482')}
                onBlur={(e) => (e.target.style.borderBottomColor = '#E0D4C6')}
              />
            </div>
            <div className="w-20 pb-2">
              <label className="block text-[10px] tracking-widest uppercase mb-2" style={{ color: '#A8948A' }}>
                幣種
              </label>
              <select
                value={currency} onChange={(e) => setCurrency(e.target.value)}
                className="w-full text-xl font-light bg-transparent outline-none pb-2 cursor-pointer appearance-none"
                style={{ color: '#5C4A43', borderBottom: '1.5px solid #E0D4C6' }}
              >
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* 匯率表示 */}
          {currency !== 'HKD' && hkdAmount > 0 && !rateLoading && (
            <div
              className="flex justify-between text-xs rounded-2xl px-3 py-2 animate-fade-in-up"
              style={{ background: '#EFE9E1', color: '#A8948A' }}
            >
              <span>1 {currency} = {exchangeRate.toFixed(4)} HKD（{rateDate}）</span>
              <span className="font-semibold" style={{ color: '#9A7350' }}>
                ≈ HKD {hkdAmount.toFixed(2)}
              </span>
            </div>
          )}
          {rateLoading && (
            <p className="text-xs animate-pulse" style={{ color: '#CDB99F' }}>
              🌸 正在取得匯率…
            </p>
          )}

          {/* 分類タグ */}
          <div>
            <label className="block text-[10px] tracking-widest uppercase mb-3" style={{ color: '#A8948A' }}>
              分類
            </label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(({ label, emoji }) => {
                const active = category === label;
                return (
                  <button
                    key={label}
                    onClick={() => setCategory(label)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95"
                    style={{
                      background: active ? '#C4A482' : '#EFE9E1',
                      color: active ? '#FFFDF9' : '#9A7350',
                      boxShadow: active ? '0 2px 8px rgba(196,164,130,0.35)' : 'none',
                    }}
                  >
                    {emoji} {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 支払い方法：現金トグル */}
          <div>
            <label className="block text-[10px] tracking-widest uppercase mb-3" style={{ color: '#A8948A' }}>
              支付方式
            </label>
            <div className="flex gap-2">
              {/* 信用卡ボタン */}
              <button
                onClick={() => setUseCash(false)}
                className="flex-1 py-2.5 rounded-2xl text-sm font-medium transition-all active:scale-95"
                style={{
                  background: !useCash ? '#C4A482' : '#EFE9E1',
                  color: !useCash ? '#FFFDF9' : '#9A7350',
                  boxShadow: !useCash ? '0 2px 8px rgba(196,164,130,0.35)' : 'none',
                  border: !useCash ? '1.5px solid transparent' : '1.5px solid #E0D4C6',
                }}
              >
                💳 信用卡
              </button>
              {/* 現金ボタン */}
              <button
                onClick={() => setUseCash(true)}
                className="flex-1 py-2.5 rounded-2xl text-sm font-medium transition-all active:scale-95"
                style={{
                  background: useCash ? '#9A7350' : '#EFE9E1',
                  color: useCash ? '#FFFDF9' : '#9A7350',
                  boxShadow: useCash ? '0 2px 8px rgba(154,115,80,0.35)' : 'none',
                  border: useCash ? '1.5px solid transparent' : '1.5px solid #E0D4C6',
                }}
              >
                💵 現金
              </button>
            </div>
          </div>

          {/* 備注 */}
          <div>
            <label className="block text-[10px] tracking-widest uppercase mb-2" style={{ color: '#A8948A' }}>
              備注（選填）
            </label>
            <input
              type="text" value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例：新宿拉麵 🍜"
              className="w-full text-sm bg-transparent outline-none pb-2 placeholder:opacity-40 transition-colors"
              style={{
                color: '#5C4A43',
                borderBottom: '1.5px solid #E0D4C6',
                caretColor: '#C4A482',
              }}
              onFocus={(e) => (e.target.style.borderBottomColor = '#C4A482')}
              onBlur={(e) => (e.target.style.borderBottomColor = '#E0D4C6')}
            />
          </div>
        </section>

        {/* ── エラー ── */}
        {error && (
          <div
            className="rounded-2xl px-4 py-3 text-sm animate-fade-in-up"
            style={{ background: '#FDF0F0', color: '#C47A7A', border: '1px solid #F5D5D5' }}
          >
            {error}
          </div>
        )}

        {/* ── 現金モード：直接記録ボタン ── */}
        {useCash && hkdAmount > 0 && (
          <section className="animate-fade-in-up">
            <h2 className="text-[10px] tracking-widest uppercase px-1 mb-3" style={{ color: '#A8948A' }}>
              💵 現金支付
            </h2>
            <button
              onClick={handleSaveCash}
              disabled={saving || !!savedCard}
              className={`${CARD_BASE} disabled:cursor-default`}
              style={
                savedCard === CASH_CARD_NAME
                  ? { background: '#F0F7F2', border: '1.5px solid #7DAB8A', boxShadow: 'none' }
                  : {
                      background: 'linear-gradient(135deg, #7A6A5A 0%, #9A8A7A 100%)',
                      border: '1.5px solid transparent',
                      boxShadow: '0 6px 20px rgba(122,106,90,0.30)',
                    }
              }
            >
              <div className="flex justify-between items-center">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm" style={{ color: savedCard === CASH_CARD_NAME ? '#7DAB8A' : '#FFFDF9' }}>
                      💵 現金
                    </span>
                    <span
                      className="text-[9px] px-2 py-0.5 rounded-full font-bold"
                      style={{ background: 'rgba(255,253,249,0.20)', color: '#FFFDF9' }}
                    >
                      不賺里數
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: 'rgba(255,253,249,0.70)' }}>
                    HKD {hkdAmount.toFixed(2)} · 里數 0
                  </p>
                </div>
                <div className="text-right">
                  {savedCard === CASH_CARD_NAME ? (
                    <span className="font-semibold text-sm" style={{ color: '#7DAB8A' }}>已記錄 ✓</span>
                  ) : (
                    <>
                      <p className="text-2xl font-light" style={{ color: '#FFFDF9' }}>0</p>
                      <p className="text-[10px]" style={{ color: 'rgba(255,253,249,0.65)' }}>Asia Miles</p>
                    </>
                  )}
                </div>
              </div>
            </button>
            <p className="text-[10px] text-center pt-2" style={{ color: '#CDB99F' }}>
              點擊記錄現金消費（里數為 0）🌸
            </p>
          </section>
        )}

        {/* ── 信用卡推薦リスト ── */}
        {!useCash && (recLoading || recommendations.length > 0) && (
          <section className="space-y-3 animate-fade-in-up">
            <h2 className="text-[10px] tracking-widest uppercase px-1" style={{ color: '#A8948A' }}>
              🌸 最佳信用卡推薦
            </h2>

            {recLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <div key={i} className="h-16 skeleton" />)}
              </div>
            ) : (
              recommendations.map((rec, index) => {
                const isSaved = savedCard === rec.cardName;
                const isBest  = index === 0;

                return (
                  <button
                    key={rec.cardName}
                    onClick={() => handleSave(rec)}
                    disabled={saving || !!savedCard}
                    className={`${CARD_BASE} disabled:cursor-default`}
                    style={
                      isSaved
                        ? { background: '#F0F7F2', border: '1.5px solid #7DAB8A', boxShadow: 'none' }
                        : isBest
                        ? {
                            background: 'linear-gradient(135deg, #9A7350 0%, #C4A482 100%)',
                            border: '1.5px solid transparent',
                            boxShadow: '0 6px 20px rgba(154,115,80,0.30)',
                          }
                        : {
                            background: '#FFFDF9',
                            border: '1.5px solid #E0D4C6',
                            boxShadow: '0 2px 8px rgba(92,74,67,0.06)',
                          }
                    }
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className="font-semibold text-sm"
                            style={{ color: isBest && !isSaved ? '#FFFDF9' : '#5C4A43' }}
                          >
                            {rec.cardName}
                          </span>
                          {isBest && !isSaved && (
                            <span
                              className="text-[9px] px-2 py-0.5 rounded-full font-bold"
                              style={{ background: 'rgba(255,253,249,0.25)', color: '#FFFDF9' }}
                            >
                              最佳 ✨
                            </span>
                          )}
                          {rec.isOverseasBonus && (
                            <span
                              className="text-[9px] px-1.5 py-0.5 rounded-full"
                              style={
                                isBest && !isSaved
                                  ? { background: 'rgba(255,253,249,0.2)', color: '#FFFDF9' }
                                  : { background: '#FFF8EF', color: '#C4A482' }
                              }
                            >
                              海外加成
                            </span>
                          )}
                          {rec.isBelowMinSpend && (
                            <span
                              className="text-[9px] px-1.5 py-0.5 rounded-full"
                              style={{ background: '#FDF3E8', color: '#C07A4A' }}
                            >
                              ⚠ 未達最低消費
                            </span>
                          )}
                        </div>
                        <p
                          className="text-xs"
                          style={{ color: isBest && !isSaved ? 'rgba(255,253,249,0.75)' : '#A8948A' }}
                        >
                          HKD {rec.effectiveRate}/里
                          {rec.isCapped && (
                            <span style={{ color: isBest ? 'rgba(255,253,249,0.85)' : '#D4956A' }}>
                              {' '}⚠ 已達上限
                            </span>
                          )}
                        </p>
                        {rec.isCapped && rec.cappedNote && (
                          <p
                            className="text-[10px] leading-tight"
                            style={{ color: isBest && !isSaved ? 'rgba(255,253,249,0.7)' : '#D4956A' }}
                          >
                            {rec.cappedNote}
                          </p>
                        )}
                        {rec.isBelowMinSpend && rec.minSpendNote && (
                          <p className="text-[10px] leading-tight" style={{ color: '#C07A4A' }}>
                            {rec.minSpendNote}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        {isSaved ? (
                          <span className="font-semibold text-sm" style={{ color: '#7DAB8A' }}>
                            已記錄 ✓
                          </span>
                        ) : (
                          <>
                            <p
                              className="text-2xl font-light"
                              style={{ color: isBest ? '#FFFDF9' : '#5C4A43' }}
                            >
                              +{Math.floor(rec.milesEarned).toLocaleString()}
                            </p>
                            <p
                              className="text-[10px]"
                              style={{ color: isBest ? 'rgba(255,253,249,0.65)' : '#A8948A' }}
                            >
                              Asia Miles
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}

            <p className="text-[10px] text-center pt-1" style={{ color: '#CDB99F' }}>
              點擊卡片即可記錄此筆消費 🌸
            </p>
          </section>
        )}

      </div>
    </div>
  );
}
