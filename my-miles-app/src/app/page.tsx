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
];

const CURRENCIES = ['HKD', 'JPY', 'USD', 'EUR', 'GBP', 'CNY', 'TWD', 'AUD', 'SGD'];

// 現金支払いを表す特別な定数
const CASH_CARD_NAME = '現金';

// ── スタイル定数 ──────────────────────────────────────────────
const CARD_BASE =
  'w-full p-4 rounded-3xl border text-left transition-all duration-200 active:scale-[0.97]';

// 根據結單日計算本期開始日期
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

// 信用卡月度上限資訊
interface CardLimitInfo {
  cardName: string;
  userMonthlyLimit: number | null;
  statementDate: number;
  usedHKD: number;
}

// ── OCR：從圖片文字中提取金額和幣種 ──────────────────────────
function extractAmountFromText(text: string): { amount: string; currency: string } | null {
  // 幣種對應表
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

  // 清理文字
  const cleanText = text.replace(/\s+/g, ' ').trim();

  // 1. 優先尋找 Total/合計/小計 後面的金額
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

  // 2. 嘗試找最大的金額數字（排除掉找零/預收等字眼附近的數字）
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

      // 簡單的上下文檢查，排除找零
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

    if (maxAmountStr) {
      return { amount: maxAmountStr, currency: maxCurrency };
    }
  }

  return null;
}

export default function HomePage() {
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
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

  // 信用卡月度上限資訊
  const [cardLimitInfos, setCardLimitInfos] = useState<CardLimitInfo[]>([]);

  // OCR 相關狀態
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult]   = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 載入所有信用卡的月度上限和本期使用量
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
      if (!user) { return; }

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
        const cycleStart = getCycleStart(statDate);
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
  }, []);

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
  }, [hkdAmount, category, useCash]);

  // 取得某張卡的月度上限警告訊息
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

  // ── OCR：處理圖片掃描 ──────────────────────────────────────
  const handleOcrScan = useCallback(async (file: File) => {
    setOcrLoading(true);
    setOcrResult(null);
    setError(null);

    try {
      const compressedDataUrl = await new Promise<string>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxSize = 1200;
          let { width, height } = img;
          if (width > maxSize || height > maxSize) {
            if (width > height) {
              height = Math.round((height * maxSize) / width);
              width = maxSize;
            } else {
              width = Math.round((width * maxSize) / height);
              height = maxSize;
            }
          }
          canvas.width = width;
          canvas.height = height;
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
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Tesseract.js'));
        document.head.appendChild(script);
      });

      const TesseractLib = (window as any).Tesseract;
      const result = await TesseractLib.recognize(compressedDataUrl, 'eng', {
        logger: () => {},
      });

      const recognizedText = result.data.text;
      const extracted = extractAmountFromText(recognizedText);

      if (extracted) {
        setAmount(extracted.amount);
        setCurrency(extracted.currency);
        setOcrResult(`✅ 識別成功：${extracted.currency} ${extracted.amount}`);
      } else {
        setOcrResult('⚠️ 未能識別金額，請手動輸入');
      }
    } catch (err) {
      console.error('OCR error:', err);
      setOcrResult('❌ 掃描失敗，請手動輸入');
    } finally {
      setOcrLoading(false);
    }
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleOcrScan(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [handleOcrScan]);

  // 保存処理
  const handleSaveTransaction = async (cardName: string, milesEarned: number) => {
    if (saving || hkdAmount <= 0) return;
    setSaving(true); setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("儲存失敗：用戶未登錄。");
      setSaving(false);
      return;
    }

    const { error: dbErr } = await supabase.from("transactions").insert([{
      user_id: user.id,
      amount_original: parseFloat(amount), currency,
      exchange_rate: exchangeRate, amount_hkd: hkdAmount,
      category, card_used: cardName,
      miles_earned: milesEarned,
      is_overseas: currency !== 'HKD',
      description: description || null,
    }]);
    setSaving(false);
    if (dbErr) {
      setError('儲存失敗：' + dbErr.message);
    } else {
      setSavedCard(cardName);
      if (cardName !== CASH_CARD_NAME) {
        setCardLimitInfos(prev => prev.map(info => 
          info.cardName === cardName ? { ...info, usedHKD: info.usedHKD + hkdAmount } : info
        ));
      }
      setTimeout(() => {
        setAmount(''); setDescription('');
        setSavedCard(null); setRecommendations([]); setHkdAmount(0);
        setUseCash(false); setOcrResult(null);
      }, 2000);
    }
  };

  return (
    <div className="min-h-screen pb-20" style={{ background: '#F7F3F0' }}>
      <div className="max-w-md mx-auto px-5 pt-12 space-y-8">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#5C4A43' }}>
              Super Expenses 🐧
            </h1>
            <p className="text-xs font-medium opacity-60" style={{ color: '#9A7350' }}>
              優雅地追蹤每一筆消費與里數
            </p>
          </div>
          <button
            onClick={() => window.location.href = '/dashboard'}
            className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-sm transition-all active:scale-90"
            style={{ background: '#FFFDF9', color: '#C4A482', border: '1px solid #EFE9E1' }}
          >
            📊
          </button>
        </header>

        {/* Input Card */}
        <div className="rounded-[2.5rem] p-8 space-y-8 shadow-xl shadow-brown-100/20" style={{ background: '#FFFDF9', border: '1px solid #EFE9E1' }}>
          {/* Amount Input */}
          <div className="space-y-3">
            <div className="flex justify-between items-end">
              <label className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-40" style={{ color: '#5C4A43' }}>
                輸入金額
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={ocrLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold transition-all active:scale-95 disabled:opacity-50"
                  style={{ background: '#EFE9E1', color: '#9A7350' }}
                >
                  {ocrLoading ? '⌛ 掃描中...' : '📸 掃描收據'}
                </button>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
              </div>
            </div>
            <div className="flex items-center gap-4 border-b-2 pb-2 transition-colors focus-within:border-brown-400" style={{ borderColor: '#E0D4C6' }}>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="bg-transparent text-lg font-bold outline-none cursor-pointer"
                style={{ color: '#9A7350' }}
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full text-4xl font-light bg-transparent outline-none placeholder:opacity-20"
                style={{ color: '#5C4A43' }}
              />
            </div>
          </div>

          {/* OCR Result Tip */}
          {ocrResult && (
            <div className="flex items-center gap-2 text-xs rounded-2xl px-3 py-2 animate-fade-in-up"
              style={{
                background: ocrResult.startsWith('✅') ? '#F0F7F2' : '#FFF8EF',
                color: ocrResult.startsWith('✅') ? '#7DAB8A' : '#C4A482',
                border: `1px solid ${ocrResult.startsWith('✅') ? '#C5DFD0' : '#E8D8C4'}`
              }}>
              {ocrResult}
              <button onClick={() => setOcrResult(null)} className="ml-auto opacity-50">✕</button>
            </div>
          )}

          {/* Category Selector */}
          <div className="space-y-4">
            <label className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-40" style={{ color: '#5C4A43' }}>
              選擇分類
            </label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(({ label, emoji }) => (
                <button
                  key={label}
                  onClick={() => setCategory(label)}
                  className="px-4 py-2 rounded-full text-xs font-medium transition-all active:scale-95"
                  style={{
                    background: category === label ? '#C4A482' : '#EFE9E1',
                    color: category === label ? '#FFFDF9' : '#9A7350',
                    boxShadow: category === label ? '0 4px 12px rgba(196,164,130,0.3)' : 'none'
                  }}
                >
                  {emoji} {label}
                </button>
              ))}
            </div>
          </div>

          {/* Description & Cash Toggle */}
          <div className="grid grid-cols-1 gap-6">
            <div className="space-y-3">
              <label className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-40" style={{ color: '#5C4A43' }}>
                備注（選填）
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="例如：新宿拉麵 🍜"
                className="w-full text-sm bg-transparent border-b pb-2 outline-none placeholder:opacity-30"
                style={{ color: '#5C4A43', borderColor: '#E0D4C6' }}
              />
            </div>
            <div className="flex items-center justify-between p-4 rounded-3xl" style={{ background: '#FAF7F3' }}>
              <div className="flex items-center gap-3">
                <span className="text-xl">💵</span>
                <div>
                  <p className="text-sm font-bold" style={{ color: '#5C4A43' }}>現金支付</p>
                  <p className="text-[10px] opacity-50">不計算里數回贈</p>
                </div>
              </div>
              <button
                onClick={() => setUseCash(!useCash)}
                className="w-12 h-6 rounded-full transition-all relative"
                style={{ background: useCash ? '#C4A482' : '#E0D4C6' }}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${useCash ? 'left-7' : 'left-1'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-4 rounded-2xl text-sm text-center animate-shake" style={{ background: '#FDF0F0', color: '#C47A7A', border: '1px solid #F5D5D5' }}>
            {error}
          </div>
        )}

        {/* Recommendations or Save Button */}
        <section className="space-y-4">
          {useCash ? (
            <button
              onClick={() => handleSaveTransaction(CASH_CARD_NAME, 0)}
              disabled={saving || hkdAmount <= 0}
              className={`${CARD_BASE} text-center py-5 font-bold text-lg shadow-lg`}
              style={{
                background: savedCard === CASH_CARD_NAME ? '#7DAB8A' : 'linear-gradient(135deg, #7A6A5A 0%, #9A8A7A 100%)',
                color: '#FFFDF9',
                border: 'none'
              }}
            >
              {savedCard === CASH_CARD_NAME ? '✅ 已成功記錄' : saving ? '⌛ 儲存中...' : '確認記錄現金支出'}
            </button>
          ) : (
            <>
              <h2 className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-40 px-2" style={{ color: '#5C4A43' }}>
                推薦使用的信用卡
              </h2>
              <div className="space-y-3">
                {recLoading ? (
                  <div className="p-12 text-center space-y-3">
                    <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: '#C4A482' }} />
                    <p className="text-xs opacity-50">正在計算最優里數回贈...</p>
                  </div>
                ) : recommendations.length > 0 ? (
                  recommendations.map((rec, i) => {
                    const warning = getMonthlyLimitWarning(rec.cardName, hkdAmount);
                    return (
                      <button
                        key={rec.cardId}
                        onClick={() => handleSaveTransaction(rec.cardName, rec.milesEarned)}
                        disabled={saving}
                        className={`${CARD_BASE} relative overflow-hidden group`}
                        style={{
                          background: savedCard === rec.cardName ? '#F0F7F2' : '#FFFDF9',
                          borderColor: savedCard === rec.cardName ? '#7DAB8A' : '#EFE9E1'
                        }}
                      >
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold px-2 py-0.5 rounded-md" style={{ background: i === 0 ? '#C4A482' : '#EFE9E1', color: i === 0 ? '#FFF' : '#9A7350' }}>
                                {i === 0 ? '最佳' : `#${i + 1}`}
                              </span>
                              <span className="font-bold" style={{ color: '#5C4A43' }}>{rec.cardName}</span>
                            </div>
                            <p className="text-2xl font-light" style={{ color: '#9A7350' }}>
                              +{Math.floor(rec.milesEarned).toLocaleString()} <span className="text-xs font-medium">里</span>
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-bold opacity-30 uppercase">預估回贈率</p>
                            <p className="text-lg font-medium" style={{ color: '#C4A482' }}>{rec.effectiveRate.toFixed(2)}%</p>
                          </div>
                        </div>
                        {warning && <p className="mt-2 text-[10px] font-bold p-2 rounded-lg" style={{ background: '#FFF0F0', color: '#C47A7A' }}>{warning}</p>}
                        {savedCard === rec.cardName && (
                          <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-[2px] font-bold" style={{ color: '#7DAB8A' }}>
                            ✅ 記錄成功
                          </div>
                        )}
                      </button>
                    );
                  })
                ) : (
                  <div className="p-12 text-center rounded-[2rem] border-2 border-dashed" style={{ borderColor: '#EFE9E1' }}>
                    <p className="text-xs opacity-30">輸入金額後即可查看推薦卡片</p>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
