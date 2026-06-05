'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { convertToHKD } from '@/lib/frankfurter';
import { recommendCards } from '@/lib/milesEngine';
import type { Category, CardName, CardRecommendation, CreditCard } from '@/types';

const CATEGORIES: { label: Category; emoji: string }[] = [
  { label: '飲食',    emoji: '🍜' },
  { label: '購物',    emoji: '🛍' },
  { label: '酒店',    emoji: '🏨' },
  { label: '旅遊',    emoji: '✈️' },
  { label: '交通',    emoji: '🚇' },
  { label: '娛樂',    emoji: '🎬' },
  { label: '通訊',    emoji: '📱' },
  { label: '手信/禮物', emoji: '🎁' },
  { label: '醫療/保險', emoji: '💊' },
  { label: '雜項',    emoji: '📋' },
  { label: '網購',    emoji: '📦' },
];

const CURRENCIES = ['HKD', 'JPY', 'USD', 'EUR', 'GBP', 'CNY', 'TWD', 'AUD', 'SGD'];
const CASH_CARD_NAME = '現金';

const CARD_BASE = 'w-full p-4 rounded-3xl border text-left transition-all duration-200 active:scale-[0.97]';

function getCycleStart(statementDate: number): Date {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const day = today.getDate();
  let cycleStart: Date;
  if (day >= statementDate) {
    cycleStart = new Date(year, month, statementDate);
  } else {
    cycleStart = new Date(year, month - 1, statementDate);
  }
  cycleStart.setHours(0, 0, 0, 0);
  return cycleStart;
}

interface CardLimitInfo {
  cardName: string;
  userMonthlyLimit: number | null;
  statementDate: number;
  usedHKD: number;
}

function extractAmountFromText(text: string): { amount: string; currency: string } | null {
  const currencyMap: Record<string, string> = {
    'HKD': 'HKD', 'HK$': 'HKD', '港幣': 'HKD', '港元': 'HKD',
    'JPY': 'JPY', 'JP¥': 'JPY', '¥': 'JPY', '円': 'JPY',
    'USD': 'USD', 'US$': 'USD', '$': 'USD',
    'EUR': 'EUR', '€': 'EUR',
    'GBP': 'GBP', '£': 'GBP',
    'CNY': 'CNY', 'RMB': 'CNY', '人民幣': 'CNY',
    'TWD': 'TWD', 'NT$': 'TWD',
    'AUD': 'AUD', 'AU$': 'AUD',
    'SGD': 'SGD', 'SG$': 'SGD',
  };
  const cleanText = text.replace(/\s+/g, ' ').trim();
  const totalPatterns = [
    /(?:total|合計|小計|お会計|お支払い|amount due|grand total|subtotal)[:\s]*([A-Z]{3}|HK\$|JP¥|US\$|NT\$|AU\$|SG\$|¥|€|£|\$)?\s*([\d,]+\.?\d*)/gi,
  ];
  for (const pattern of totalPatterns) {
    const matches = [...cleanText.matchAll(pattern)];
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      const currencyStr = (lastMatch[1] || '').trim().toUpperCase();
      const amountStr = (lastMatch[2] || '').replace(/,/g, '');
      const hasYenSymbol = cleanText.includes('¥') || cleanText.includes('円') || cleanText.includes('JPY');
      const detectedCurrency = currencyMap[currencyStr] || (hasYenSymbol ? 'JPY' : 'HKD');
      if (amountStr && parseFloat(amountStr) > 0) {
        return { amount: amountStr, currency: detectedCurrency };
      }
    }
  }
  const amountPattern = /([A-Z]{3}|HK\$|JP¥|US\$|NT\$|AU\$|SG\$|¥|€|£|\$)?\s*([\d,]+\.?\d*)/gi;
  const allMatches = [...cleanText.matchAll(amountPattern)];
  const skipKeywords = ['お預り', 'お釣', 'change', 'cash'];
  if (allMatches.length > 0) {
    let maxAmount = 0;
    let maxCurrency = 'HKD';
    let maxAmountStr = '';
    for (const match of allMatches) {
      const amountStr = match[2].replace(/,/g, '');
      const amount = parseFloat(amountStr);
      if (isNaN(amount)) continue;
      const context = cleanText.substring(Math.max(0, match.index! - 10), Math.min(cleanText.length, match.index! + 10));
      const isBlacklisted = skipKeywords.some(skip => context.includes(skip));
      if (!isBlacklisted && amount > maxAmount && amount < 1000000) {
        maxAmount = amount;
        const currencyStr = (match[1] || '').trim().toUpperCase();
        const hasYenSymbol = cleanText.includes('¥') || cleanText.includes('円') || cleanText.includes('JPY');
        maxCurrency = currencyMap[currencyStr] || (hasYenSymbol ? 'JPY' : 'HKD');
        maxAmountStr = amountStr;
      }
    }
    if (maxAmountStr) return { amount: maxAmountStr, currency: maxCurrency };
  }
  return null;
}

export default function HomePage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
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
  const [cardLimitInfos, setCardLimitInfos] = useState<CardLimitInfo[]>([]);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult]   = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadCardLimits = async () => {
      const { data: cardData, error: cardError } = await supabase
        .from('credit_cards')
        .select('id, name, statement_date, user_monthly_limit')
        .not('user_monthly_limit', 'is', null);
      if (cardError || !cardData || cardData.length === 0) return;
      const cards = cardData as Pick<CreditCard, 'id' | 'name' | 'statement_date' | 'user_monthly_limit'>[];
      const earliestStart = cards.reduce((earliest, card) => {
        const start = getCycleStart(card.statement_date ?? 1);
        return start < earliest ? start : earliest;
      }, new Date());
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .select('card_used, amount_hkd')
        .eq('user_id', user.id)
        .gte('created_at', earliestStart.toISOString())
        .neq('card_used', '現金');
      if (txError) return;
      const allTx = txData as { card_used: string; amount_hkd: number }[];
      const infos: CardLimitInfo[] = cards.map((card) => {
        const statDate = card.statement_date ?? 1;
        const usedHKD = allTx
          .filter((tx) => tx.card_used === card.name)
          .reduce((sum, tx) => sum + Number(tx.amount_hkd), 0);
        return {
          cardName: card.name,
          userMonthlyLimit: card.user_monthly_limit,
          statementDate: statDate,
          usedHKD,
        };
      });
      setCardLimitInfos(infos);
    };
    loadCardLimits();
  }, [supabase]);

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

  useEffect(() => {
    if (hkdAmount <= 0 || useCash) { setRecommendations([]); return; }
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
  }, [hkdAmount, category, useCash, amount, currency, exchangeRate]);

  const getMonthlyLimitWarning = useCallback((cardName: string, thisAmountHKD: number): string | null => {
    const info = cardLimitInfos.find((c) => c.cardName === cardName);
    if (!info || info.userMonthlyLimit === null) return null;
    const totalAfter = info.usedHKD + thisAmountHKD;
    const remaining = info.userMonthlyLimit - totalAfter;
    if (remaining < 0) {
      return `🚨 已超出本月簽帳上限 HKD ${Math.abs(remaining).toLocaleString('zh-HK', { maximumFractionDigits: 0 })}`;
    } else if (remaining < info.userMonthlyLimit * 0.2) {
      return `⚠️ 還有 HKD ${remaining.toLocaleString('zh-HK', { maximumFractionDigits: 0 })} 到達本月簽帳上限`;
    }
    return null;
  }, [cardLimitInfos]);

  const handleOcrScan = useCallback(async (file: File) => {
    setOcrLoading(true); setOcrResult(null); setError(null);
    try {
      const compressedDataUrl = await new Promise<string>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxSize = 1200;
          let { width, height } = img;
          if (width > maxSize || height > maxSize) {
            if (width > height) { height = Math.round((height * maxSize) / width); width = maxSize; }
            else { width = Math.round((width * maxSize) / height); height = maxSize; }
          }
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = URL.createObjectURL(file);
      });
      await new Promise<void>((resolve, reject) => {
        if ((window as any).Tesseract) { resolve(); return; }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        script.onload = ( ) => resolve();
        script.onerror = () => reject(new Error('Failed to load Tesseract.js'));
        document.head.appendChild(script);
      });
      const TesseractLib = (window as any).Tesseract;
      const result = await TesseractLib.recognize(compressedDataUrl, 'eng', { logger: () => {} });
      const recognizedText = result.data.text;
      const extracted = extractAmountFromText(recognizedText);
      if (extracted) {
        setAmount(extracted.amount); setCurrency(extracted.currency);
        setOcrResult(`✅ 識別成功：${extracted.currency} ${extracted.amount}`);
      } else { setOcrResult('⚠️ 未能識別金額，請手動輸入'); }
    } catch (err) { setOcrResult('❌ 掃描失敗，請手動輸入'); }
    finally { setOcrLoading(false); }
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleOcrScan(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [handleOcrScan]);

  const handleSaveTransaction = async (cardName: string, milesEarned: number) => {
    if (saving || hkdAmount <= 0) return;
    setSaving(true); setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("儲存失敗：用戶未登錄。"); setSaving(false); return; }
    const { error: dbErr } = await supabase.from("transactions").insert([{
      user_id: user.id, amount_original: parseFloat(amount), currency,
      exchange_rate: exchangeRate, amount_hkd: hkdAmount,
      category, card_used: cardName, miles_earned: milesEarned,
      is_overseas: currency !== 'HKD', description: description || null,
    }]);
    setSaving(false);
    if (dbErr) { setError('儲存失敗：' + dbErr.message); }
    else {
      setSavedCard(cardName);
      if (cardName !== CASH_CARD_NAME) {
        setCardLimitInfos(prev => prev.map(info => 
          info.cardName === cardName ? { ...info, usedHKD: info.usedHKD + hkdAmount } : info
        ));
      }
      setTimeout(() => {
        setAmount(''); setDescription(''); setSavedCard(null); setRecommendations([]);
        setHkdAmount(0); setUseCash(false); setOcrResult(null);
      }, 2000);
    }
  };

  return (
    <div className="min-h-screen pb-20" style={{ background: '#F7F3F0' }}>
      <div className="max-w-md mx-auto px-5 pt-12 space-y-8">
        <header className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#5C4A43' }}>Super Expenses 🐧</h1>
            <p className="text-xs font-medium tracking-widest uppercase" style={{ color: '#A8948A' }}>Expense Tracker</p>
          </div>
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-sm border border-[#E0D4C6]">
            <span className="text-xl">☕</span>
          </div>
        </header>

        <section className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-[#E0D4C6] space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-[10px] tracking-widest uppercase font-bold" style={{ color: '#A8948A' }}>Transaction Amount</label>
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={ocrLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50"
                style={{ background: '#F7F3F0', color: '#9A7350', border: '1px solid #E0D4C6' }}
              >
                {ocrLoading ? 'Scanning...' : '📷 Scan Receipt'}
              </button>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
            </div>
            
            <div className="flex items-center gap-3">
              <select 
                value={currency} onChange={(e) => setCurrency(e.target.value)}
                className="text-2xl font-bold bg-transparent outline-none cursor-pointer"
                style={{ color: '#5C4A43' }}
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input 
                type="number" inputMode="decimal" placeholder="0.00" value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full text-4xl font-bold bg-transparent outline-none placeholder:text-[#E0D4C6]"
                style={{ color: '#5C4A43' }}
              />
            </div>
            {ocrResult && <p className="text-xs font-medium" style={{ color: ocrResult.includes('✅') ? '#7DAB8A' : '#C47A7A' }}>{ocrResult}</p>}
            
            {hkdAmount > 0 && currency !== 'HKD' && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-2xl" style={{ background: '#F7F3F0' }}>
                <span className="text-xs font-bold" style={{ color: '#9A7350' }}>≈ HKD {hkdAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className="text-[10px]" style={{ color: '#A8948A' }}>Rate: {exchangeRate.toFixed(4)} ({rateDate})</span>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <label className="text-[10px] tracking-widest uppercase font-bold" style={{ color: '#A8948A' }}>Category</label>
            <div className="grid grid-cols-4 gap-2">
              {CATEGORIES.map(cat => (
                <button 
                  key={cat.label} onClick={() => setCategory(cat.label)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all ${category === cat.label ? 'shadow-md scale-105' : 'opacity-60 border-transparent hover:opacity-100'}`}
                  style={{ background: category === cat.label ? '#9A7350' : 'transparent', border: category === cat.label ? '1px solid #9A7350' : 'none' }}
                >
                  <span className="text-xl">{cat.emoji}</span>
                  <span className="text-[10px] font-bold" style={{ color: category === cat.label ? '#FFFFFF' : '#5C4A43' }}>{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] tracking-widest uppercase font-bold" style={{ color: '#A8948A' }}>Description (Optional)</label>
            <input 
              type="text" placeholder="What was this for?" value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full text-sm p-3 rounded-2xl bg-[#F7F3F0] outline-none border border-transparent focus:border-[#E0D4C6] transition-all"
              style={{ color: '#5C4A43' }}
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs font-bold" style={{ color: '#5C4A43' }}>Using Cash?</span>
            <button 
              onClick={() => setUseCash(!useCash)}
              className="w-12 h-6 rounded-full relative transition-colors"
              style={{ background: useCash ? '#9A7350' : '#E0D4C6' }}
            >
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${useCash ? 'left-7' : 'left-1'}`} />
            </button>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-sm font-bold uppercase tracking-widest" style={{ color: '#5C4A43' }}>
              {useCash ? 'Cash Payment' : 'Card Recommendations'}
            </h2>
            {recLoading && <span className="text-[10px] animate-pulse" style={{ color: '#A8948A' }}>Calculating...</span>}
          </div>

          <div className="space-y-3">
            {error && <div className="p-4 rounded-3xl bg-red-50 text-red-600 text-xs font-medium border border-red-100">{error}</div>}
            
            {savedCard && (
              <div className="p-8 rounded-[2.5rem] bg-[#FDF3E8] border border-[#C07A4A] flex flex-col items-center gap-3 animate-in zoom-in duration-300">
                <span className="text-4xl">🐧</span>
                <p className="text-sm font-bold" style={{ color: '#C07A4A' }}>Saved to {savedCard}!</p>
              </div>
            )}

            {!savedCard && useCash && (
              <button 
                onClick={() => handleSaveTransaction(CASH_CARD_NAME, 0)}
                disabled={saving || hkdAmount <= 0}
                className={CARD_BASE}
                style={{ background: '#FFFFFF', borderColor: '#E0D4C6' }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#F7F3F0] flex items-center justify-center text-xl">💵</div>
                    <div>
                      <p className="text-sm font-bold" style={{ color: '#5C4A43' }}>Confirm Cash Payment</p>
                      <p className="text-[10px]" style={{ color: '#A8948A' }}>No miles earned</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold" style={{ color: '#9A7350' }}>{saving ? '...' : 'SAVE'}</span>
                </div>
              </button>
            )}

            {!savedCard && !useCash && recommendations.length > 0 && recommendations.map((rec, i) => {
              const warning = getMonthlyLimitWarning(rec.cardName, hkdAmount);
              return (
                <button 
                  key={rec.cardId}
                  onClick={() => handleSaveTransaction(rec.cardName, rec.milesEarned)}
                  disabled={saving || hkdAmount <= 0}
                  className={CARD_BASE}
                  style={{ 
                    background: i === 0 ? '#9A7350' : '#FFFFFF',
                    borderColor: i === 0 ? '#9A7350' : '#E0D4C6',
                    color: i === 0 ? '#FFFFFF' : '#5C4A43'
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl" style={{ background: i === 0 ? 'rgba(255,255,255,0.2)' : '#F7F3F0' }}>
                        {i === 0 ? '🏆' : '💳'}
                      </div>
                      <div>
                        <p className="text-sm font-bold">{rec.cardName}</p>
                        <p className="text-[10px]" style={{ color: i === 0 ? 'rgba(255,255,255,0.7)' : '#A8948A' }}>
                          {rec.isCapped ? 'Capped Rate' : `Rate: HKD ${rec.effectiveRate.toFixed(1)}/mile`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">+{rec.milesEarned.toLocaleString()} <span className="text-[10px]">里</span></p>
                    </div>
                  </div>
                  {warning && (
                    <div className="mt-2 px-3 py-1.5 rounded-xl text-[10px] font-bold" style={{ background: i === 0 ? 'rgba(0,0,0,0.1)' : '#FFF5F5', color: i === 0 ? '#FFFFFF' : '#C47A7A' }}>
                      {warning}
                    </div>
                  )}
                </button>
              );
            })}

            {!savedCard && !useCash && recommendations.length === 0 && !recLoading && hkdAmount > 0 && (
              <div className="p-8 text-center space-y-2 opacity-60">
                <p className="text-2xl">🌵</p>
                <p className="text-xs font-medium" style={{ color: '#5C4A43' }}>No card recommendations found.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
