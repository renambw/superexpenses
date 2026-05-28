'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { Category, CardName } from '@/types';

// ============================================================
// 型定義
// ============================================================
interface DashboardData {
  totalSpentHKD: number;
  totalMiles: number;
  categoryBreakdown: { category: Category; total: number }[];
  cardBreakdown: { card: CardName; total: number; miles: number }[];
}

const MILES_GOAL_KEY = 'milesGoal'; // localStorage キー

// ============================================================
// デザイン定数
// ============================================================
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

// 奶茶風カラーパレット（円グラフ用）
const PIE_COLORS = [
  '#C07A4A', // 深橙茶
  '#9A7350', // 拿鐵棕
  '#7D8FAB', // 灰藍
  '#7DAB8A', // 茶綠
  '#AB7D9A', // 玫瑰紫
  '#7A9AAB', // 天藍灰
  '#C47A7A', // 玫瑰紅
  '#B08B65', // 焦糖
  '#A8948A', // 暖灰
];

const CARD_GRADIENTS = [
  'linear-gradient(135deg, #9A7350 0%, #C4A482 100%)',
  'linear-gradient(135deg, #C4A482 0%, #E0D4C6 100%)',
  'linear-gradient(135deg, #7D5C3E 0%, #9A7350 100%)',
  'linear-gradient(135deg, #CDB99F 0%, #EFE9E1 100%)',
  'linear-gradient(135deg, #B08B65 0%, #CDB99F 100%)',
];

// ============================================================
// SVG 円グラフコンポーネント（ライブラリ不要・純 SVG）
// ============================================================
interface PieSlice {
  category: string;
  total: number;
  pct: number;
  color: string;
  emoji: string;
}

function PieChart({ slices, total }: { slices: PieSlice[]; total: number }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [animated, setAnimated]       = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(t);
  }, []);

  const SIZE   = 200;
  const CX     = SIZE / 2;
  const CY     = SIZE / 2;
  const R      = 72;
  const R_HOLE = 42;

  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const buildPath = (startDeg: number, endDeg: number, r: number, rHole: number): string => {
    const start = toRad(startDeg - 90);
    const end   = toRad(endDeg - 90);
    const large = endDeg - startDeg > 180 ? 1 : 0;

    const x1 = CX + r * Math.cos(start);
    const y1 = CY + r * Math.sin(start);
    const x2 = CX + r * Math.cos(end);
    const y2 = CY + r * Math.sin(end);
    const x3 = CX + rHole * Math.cos(end);
    const y3 = CY + rHole * Math.sin(end);
    const x4 = CX + rHole * Math.cos(start);
    const y4 = CY + rHole * Math.sin(start);

    return [
      `M ${x1} ${y1}`,
      `A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`,
      `L ${x3} ${y3}`,
      `A ${rHole} ${rHole} 0 ${large} 0 ${x4} ${y4}`,
      'Z',
    ].join(' ');
  };

  const sliceAngles: { start: number; end: number }[] = [];
  let cumulative = 0;
  slices.forEach((s) => {
    const deg = animated ? s.pct * 3.6 : 0;
    sliceAngles.push({ start: cumulative, end: cumulative + deg });
    cumulative += deg;
  });

  const activeSlice = activeIndex !== null ? slices[activeIndex] : null;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg
          ref={svgRef}
          width={SIZE} height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="overflow-visible"
        >
          <circle
            cx={CX} cy={CY}
            r={(R + R_HOLE) / 2}
            fill="none"
            stroke="#EFE9E1"
            strokeWidth={R - R_HOLE}
          />
          {slices.map((slice, i) => {
            const { start, end } = sliceAngles[i];
            if (end - start < 0.5) return null;
            const isActive = activeIndex === i;
            const scale    = isActive ? 1.06 : 1;
            return (
              <path
                key={slice.category}
                d={buildPath(start, end, R, R_HOLE)}
                fill={slice.color}
                opacity={activeIndex === null || isActive ? 1 : 0.55}
                style={{
                  transformOrigin: `${CX}px ${CY}px`,
                  transform: `scale(${scale})`,
                  transition: 'transform 0.2s ease, opacity 0.2s ease',
                  cursor: 'pointer',
                  filter: isActive ? 'drop-shadow(0 2px 6px rgba(92,74,67,0.25))' : 'none',
                }}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseLeave={() => setActiveIndex(null)}
                onTouchStart={() => setActiveIndex(i === activeIndex ? null : i)}
              />
            );
          })}
          {activeSlice ? (
            <>
              <text x={CX} y={CY - 10} textAnchor="middle" dominantBaseline="middle"
                fontSize="18" fill="#5C4A43" fontWeight="300">
                {activeSlice.pct.toFixed(1)}%
              </text>
              <text x={CX} y={CY + 10} textAnchor="middle" dominantBaseline="middle"
                fontSize="9" fill="#A8948A" letterSpacing="0.5">
                {activeSlice.emoji} {activeSlice.category}
              </text>
            </>
          ) : (
            <>
              <text x={CX} y={CY - 8} textAnchor="middle" dominantBaseline="middle"
                fontSize="11" fill="#A8948A" letterSpacing="1">
                本月支出
              </text>
              <text x={CX} y={CY + 10} textAnchor="middle" dominantBaseline="middle"
                fontSize="9" fill="#CDB99F">
                HKD {total.toLocaleString('zh-HK', { maximumFractionDigits: 0 })}
              </text>
            </>
          )}
        </svg>
      </div>
      <div className="w-full grid grid-cols-2 gap-x-4 gap-y-2">
        {slices.map((slice, i) => (
          <button
            key={slice.category}
            className="flex items-center gap-2 text-left transition-opacity active:scale-95"
            style={{ opacity: activeIndex === null || activeIndex === i ? 1 : 0.45 }}
            onMouseEnter={() => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(null)}
            onTouchStart={() => setActiveIndex(i === activeIndex ? null : i)}
          >
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: slice.color }} />
            <span className="text-xs truncate" style={{ color: '#5C4A43' }}>
              {slice.emoji} {slice.category}
            </span>
            <span className="text-xs ml-auto shrink-0" style={{ color: '#A8948A' }}>
              {slice.pct.toFixed(0)}%
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Dashboard ページ本体
// ============================================================
export default function DashboardPage() {
  const [data, setData]       = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  // ── 里数目標（localStorage で永続化）──────────────────────
  const [milesGoal, setMilesGoal]         = useState<number>(10000);
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [goalInput, setGoalInput]         = useState('');
  const goalInputRef = useRef<HTMLInputElement>(null);

  // localStorage から初期値を読み込む（SSR 対策で useEffect 内）
  useEffect(() => {
    const stored = localStorage.getItem(MILES_GOAL_KEY);
    if (stored !== null) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed >= 0) setMilesGoal(parsed);
    }
  }, []);

  // 編集モードに入ったとき input にフォーカス
  useEffect(() => {
    if (isEditingGoal && goalInputRef.current) {
      goalInputRef.current.focus();
      goalInputRef.current.select();
    }
  }, [isEditingGoal]);

  const handleGoalSave = () => {
    const val = parseInt(goalInput, 10);
    const newGoal = isNaN(val) || val < 0 ? 0 : val;
    setMilesGoal(newGoal);
    localStorage.setItem(MILES_GOAL_KEY, String(newGoal));
    setIsEditingGoal(false);
  };

  const handleGoalKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleGoalSave();
    if (e.key === 'Escape') setIsEditingGoal(false);
  };

  // ── データ取得 ──────────────────────────────────────────────
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
      txs.forEach((t) =>
        catMap.set(t.category, (catMap.get(t.category) ?? 0) + Number(t.amount_hkd))
      );
      const categoryBreakdown = Array.from(catMap.entries())
        .map(([category, total]) => ({ category: category as Category, total }))
        .sort((a, b) => b.total - a.total);

      const cardMap = new Map<string, { total: number; miles: number }>();
      txs.forEach((t) => {
        const p = cardMap.get(t.card_used) ?? { total: 0, miles: 0 };
        cardMap.set(t.card_used, {
          total: p.total + Number(t.amount_hkd),
          miles: p.miles + Number(t.miles_earned),
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

  // 目標が 0 の場合は進度条を非表示
  const hasGoal       = milesGoal > 0;
  const milesProgress = hasGoal
    ? Math.min(((data?.totalMiles ?? 0) / milesGoal) * 100, 100)
    : 0;
  const monthLabel = new Date().toLocaleDateString('zh-HK', { year: 'numeric', month: 'long' });

  const pieSlices: PieSlice[] = (data?.categoryBreakdown ?? []).map((item, i) => {
    const pct  = data!.totalSpentHKD > 0 ? (item.total / data!.totalSpentHKD) * 100 : 0;
    const meta = CATEGORY_META[item.category] ?? { emoji: '📋', color: '#A8948A', bg: '#EFE9E1' };
    return {
      category: item.category,
      total: item.total,
      pct,
      color: PIE_COLORS[i % PIE_COLORS.length],
      emoji: meta.emoji,
    };
  });

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
            🐧記帳本🐧
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

        {/* ── Asia Miles 進度（里数目標 動的編集対応）── */}
        <div
          className="rounded-3xl p-6 space-y-4"
          style={{
            background: '#FFFDF9',
            boxShadow: '0 4px 20px rgba(92,74,67,0.08)',
            border: '1px solid #EFE9E1',
          }}
        >
          <div className="flex justify-between items-start">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] tracking-widest uppercase mb-1" style={{ color: '#A8948A' }}>
                🌸 Asia Miles 進度
              </p>

              {/* 目標行：表示 or 編集 */}
              {isEditingGoal ? (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    ref={goalInputRef}
                    type="number"
                    inputMode="numeric"
                    value={goalInput}
                    onChange={(e) => setGoalInput(e.target.value)}
                    onKeyDown={handleGoalKeyDown}
                    placeholder="輸入目標里數"
                    className="w-32 text-sm bg-transparent outline-none pb-0.5 font-medium"
                    style={{
                      color: '#5C4A43',
                      borderBottom: '1.5px solid #C4A482',
                      caretColor: '#C4A482',
                    }}
                  />
                  <button
                    onClick={handleGoalSave}
                    className="text-[10px] px-2.5 py-1 rounded-full font-semibold transition-all active:scale-90"
                    style={{ background: '#C4A482', color: '#FFFDF9' }}
                  >
                    確認
                  </button>
                  <button
                    onClick={() => setIsEditingGoal(false)}
                    className="text-[10px] px-2.5 py-1 rounded-full transition-all active:scale-90"
                    style={{ background: '#EFE9E1', color: '#9A7350' }}
                  >
                    取消
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-sm font-medium" style={{ color: '#5C4A43' }}>
                    {hasGoal ? `目標 ${milesGoal.toLocaleString()} 里` : '未設定目標'}
                  </p>
                  {/* ✏️ 編集ボタン */}
                  <button
                    onClick={() => {
                      setGoalInput(milesGoal > 0 ? String(milesGoal) : '');
                      setIsEditingGoal(true);
                    }}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-sm transition-all active:scale-90"
                    style={{ background: '#EFE9E1', color: '#A8948A' }}
                    title="修改里數目標"
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = '#E0D4C6';
                      (e.currentTarget as HTMLButtonElement).style.color = '#9A7350';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = '#EFE9E1';
                      (e.currentTarget as HTMLButtonElement).style.color = '#A8948A';
                    }}
                  >
                    ✏️
                  </button>
                </div>
              )}
            </div>

            {/* 已賺取里數（大字体） */}
            <div className="text-right shrink-0">
              <span className="text-3xl font-light" style={{ color: '#9A7350' }}>
                {Math.floor(data?.totalMiles ?? 0).toLocaleString()}
              </span>
              <span className="text-xs ml-1" style={{ color: '#A8948A' }}>里</span>
            </div>
          </div>

          {/* 進度條：目標が 0 の場合は非表示 */}
          {hasGoal ? (
            <>
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
            </>
          ) : (
            <p className="text-xs" style={{ color: '#CDB99F' }}>
              點擊 ✏️ 設定里數目標，即可顯示進度條
            </p>
          )}
        </div>

        {/* ── 支出分類圓餅圖 ── */}
        {data && data.categoryBreakdown.length > 0 ? (
          <div
            className="rounded-3xl p-6 space-y-5"
            style={{
              background: '#FFFDF9',
              boxShadow: '0 4px 20px rgba(92,74,67,0.08)',
              border: '1px solid #EFE9E1',
            }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold" style={{ color: '#5C4A43' }}>
                支出分類 🍜
              </h2>
              <span
                className="text-[10px] px-2 py-1 rounded-full"
                style={{ background: '#EFE9E1', color: '#A8948A' }}
              >
                點擊扇形查看詳情
              </span>
            </div>

            <PieChart slices={pieSlices} total={data.totalSpentHKD} />

            <div className="space-y-2.5 pt-2" style={{ borderTop: '1px solid #EFE9E1' }}>
              <p className="text-[10px] tracking-widest uppercase" style={{ color: '#A8948A' }}>
                金額明細
              </p>
              {data.categoryBreakdown.map(({ category, total }) => {
                const pct  = data.totalSpentHKD > 0 ? (total / data.totalSpentHKD) * 100 : 0;
                const meta = CATEGORY_META[category] ?? { emoji: '📋', color: '#A8948A', bg: '#EFE9E1' };
                return (
                  <div key={category} className="flex items-center gap-2">
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0"
                      style={{ background: meta.bg }}
                    >
                      {meta.emoji}
                    </span>
                    <div className="flex-1 space-y-0.5">
                      <div className="flex justify-between text-xs">
                        <span style={{ color: '#5C4A43' }}>{category}</span>
                        <span style={{ color: '#9A7350' }}>
                          HKD {total.toLocaleString('zh-HK', { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                      <div className="h-1 w-full rounded-full overflow-hidden" style={{ background: '#EFE9E1' }}>
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, background: meta.color }}
                        />
                      </div>
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
