'use client';

import { useState, useEffect, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { invalidateCardRulesCache, getCurrentQuarter } from '@/lib/milesEngine';
import type { CreditCard, Category } from '@/types';

// ============================================================
// 定数
// ============================================================
const ALL_CATEGORIES: Category[] = [
  '飲食', '購物', '酒店', '旅遊', '交通', '娛樂', '通訊', '手信/禮物', '醫療/保險', '雜項',
];

const CATEGORY_EMOJI: Record<Category, string> = {
  '飲食': '🍜', '購物': '🛘', '酒店': '🏨', '旅遊': '✈️', '交通': '🚇',
  '娛樂': '🎦', '通訊': '📱', '手信/禮物': '🎁', '醫療/保險': '💊', '雜項': '📋', '網購': '📦',
};

const QUARTER_LABELS: Record<number, string> = {
  1: 'Q1（1–3月）', 2: 'Q2（4–6月）', 3: 'Q3（7–9月）', 4: 'Q4（10–12月）',
};

const EMPTY_FORM: Omit<CreditCard, 'id'> = {
  name: '',
  base_rate: 6,
  overseas_rate: null,
  category_rates: {},
  min_spend_hkd: null,
  min_spend_apply_to: null,
  // 旧来フィールド（後方互換性）
  monthly_cap_limit: null,
  monthly_cap_rate: null,
  monthly_cap_apply_to: null,
  quarterly_cap_limit: null,
  quarterly_cap_rate: null,
  quarterly_cap_apply_to: null,
  // 独立上限フィールド
  local_monthly_cap: null,
  local_quarterly_cap: null,
  overseas_monthly_cap: null,
  overseas_quarterly_cap: null,
  category_monthly_caps: null,
  category_quarterly_caps: null,
  capped_base_rate: null,
  // 新增欄位
  statement_date: 1,
  user_monthly_limit: null,
};

// ============================================================
// 共通 UI コンポーネント
// ============================================================

function Toggle({ checked, onChange, label }: {
  checked: boolean; onChange: (v: boolean) => void; label: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none mb-2">
      <div
        className="w-9 h-5 rounded-full relative transition-colors"
        style={{ background: checked ? '#C4A482' : '#E0D4C6' }}
        onClick={() => onChange(!checked)}
      >
        <div
          className="absolute top-0.5 w-4 h-4 rounded-full transition-transform"
          style={{
            background: '#FFFDF9',
            boxShadow: '0 1px 3px rgba(92,74,67,0.2)',
            transform: checked ? 'translateX(18px)' : 'translateX(2px)',
          }}
        />
      </div>
      <span className="text-sm font-medium" style={{ color: '#5C4A43' }}>{label}</span>
    </label>
  );
}

function NumberField({ label, value, onChange, unit = 'HKD', min = 0.1, hint, placeholder }: {
  label: string; value: number | null; onChange: (v: number | null) => void;
  unit?: string; min?: number; hint?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] tracking-widest uppercase mb-1" style={{ color: '#A8948A' }}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="number" inputMode="decimal" step="any"
          value={value ?? ''} min={min}
          placeholder={placeholder ?? ''}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            onChange(isNaN(v) || v <= 0 ? null : v);
          }}
          className="w-32 text-sm outline-none pb-0.5 bg-transparent"
          style={{
            color: '#5C4A43',
            borderBottom: '1.5px solid #E0D4C6',
            caretColor: '#C4A482',
          }}
          onFocus={(e) => (e.target.style.borderBottomColor = '#C4A482')}
          onBlur={(e) => (e.target.style.borderBottomColor = '#E0D4C6')}
        />
        <span className="text-xs" style={{ color: '#A8948A' }}>{unit}</span>
      </div>
      {hint && <p className="text-[10px] mt-1" style={{ color: '#CDB99F' }}>{hint}</p>}
    </div>
  );
}

// ============================================================
// 分類別利率エディタ
// ============================================================
function CategoryRatesEditor({ value, onChange }: {
  value: Partial<Record<Category, number>>;
  onChange: (v: Partial<Record<Category, number>>) => void;
}) {
  return (
    <div className="space-y-2.5">
      {ALL_CATEGORIES.map((cat) => {
        const rate = value[cat];
        const enabled = rate !== undefined;
        return (
          <div key={cat} className="flex items-center gap-3">
            <label className="flex items-center gap-2 w-32 cursor-pointer select-none">
              <input
                type="checkbox" checked={enabled}
                onChange={(e) => {
                  const next = { ...value };
                  if (e.target.checked) { next[cat] = 6; } else { delete next[cat]; }
                  onChange(next);
                }}
                className="w-3.5 h-3.5 rounded"
                style={{ accentColor: '#C4A482' }}
              />
              <span className="text-sm" style={{ color: '#5C4A43' }}>
                {CATEGORY_EMOJI[cat]} {cat}
              </span>
            </label>
            {enabled && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs" style={{ color: '#A8948A' }}>HKD</span>
                <input
                  type="number" inputMode="decimal" step="any"
                  value={rate} min={0.1}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v) && v > 0) onChange({ ...value, [cat]: v });
                  }}
                  className="w-20 text-sm text-center outline-none pb-0.5 bg-transparent"
                  style={{
                    borderBottom: '1.5px solid #E0D4C6',
                    color: '#5C4A43',
                    caretColor: '#C4A482',
                  }}
                  onFocus={(e) => (e.target.style.borderBottomColor = '#C4A482')}
                  onBlur={(e) => (e.target.style.borderBottomColor = '#E0D4C6')}
                />
                <span className="text-xs" style={{ color: '#A8948A' }}>/ 里</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// 分類別上限エディタ（月間 or 季度）
// ============================================================
function CategoryCapsEditor({ label, value, onChange }: {
  label: string;
  value: Partial<Record<Category, number>> | null;
  onChange: (v: Partial<Record<Category, number>> | null) => void;
}) {
  const caps = value ?? {};
  return (
    <div className="space-y-2.5">
      <p className="text-[10px] tracking-widest uppercase" style={{ color: '#A8948A' }}>
        {label}（各分類獨立上限 HKD）
      </p>
      {ALL_CATEGORIES.map((cat) => {
        const capVal = caps[cat];
        const enabled = capVal !== undefined;
        return (
          <div key={cat} className="flex items-center gap-3">
            <label className="flex items-center gap-2 w-32 cursor-pointer select-none">
              <input
                type="checkbox" checked={enabled}
                onChange={(e) => {
                  const next = { ...caps };
                  if (e.target.checked) { next[cat] = 10000; } else { delete next[cat]; }
                  onChange(Object.keys(next).length > 0 ? next : null);
                }}
                className="w-3.5 h-3.5 rounded"
                style={{ accentColor: '#C4A482' }}
              />
              <span className="text-sm" style={{ color: '#5C4A43' }}>
                {CATEGORY_EMOJI[cat]} {cat}
              </span>
            </label>
            {enabled && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs" style={{ color: '#A8948A' }}>HKD</span>
                <input
                  type="number" inputMode="decimal" step="any"
                  value={capVal} min={1}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v) && v > 0) {
                      const next = { ...caps, [cat]: v };
                      onChange(next);
                    }
                  }}
                  className="w-24 text-sm text-center outline-none pb-0.5 bg-transparent"
                  style={{
                    borderBottom: '1.5px solid #E0D4C6',
                    color: '#5C4A43',
                    caretColor: '#C4A482',
                  }}
                  onFocus={(e) => (e.target.style.borderBottomColor = '#C4A482')}
                  onBlur={(e) => (e.target.style.borderBottomColor = '#E0D4C6')}
                />
                <span className="text-xs" style={{ color: '#A8948A' }}>上限</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// セクションカード（折りたたみ可能）
// ============================================================
function SectionCard({ title, emoji, color, children, defaultOpen = false }: {
  title: string; emoji: string; color: string;
  children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${color}20` }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors"
        style={{ background: `${color}10` }}
      >
        <span className="text-sm font-semibold" style={{ color }}>
          {emoji} {title}
        </span>
        <span className="text-xs transition-transform" style={{
          color, transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          display: 'inline-block',
        }}>
          ▼
        </span>
      </button>
      {open && (
        <div className="px-4 py-4 space-y-4" style={{ background: '#FFFDF9' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ============================================================
// カード編集フォーム（全フィールド対応）
// ============================================================
function CardForm({ initial, onSave, onCancel, isSaving }: {
  initial: Omit<CreditCard, 'id'> & { id?: string };
  onSave: (data: Omit<CreditCard, 'id'> & { id?: string }) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState(initial);
  const [hasOverseasRate,       setHasOverseasRate]       = useState(initial.overseas_rate !== null);
  const [hasMinSpend,           setHasMinSpend]           = useState(initial.min_spend_hkd !== null);
  const [hasCappedRate,         setHasCappedRate]         = useState(initial.capped_base_rate !== null);
  const [hasLocalMonthly,       setHasLocalMonthly]       = useState(initial.local_monthly_cap !== null);
  const [hasLocalQuarterly,     setHasLocalQuarterly]     = useState(initial.local_quarterly_cap !== null);
  const [hasOverseasMonthly,    setHasOverseasMonthly]    = useState(initial.overseas_monthly_cap !== null);
  const [hasOverseasQuarterly,  setHasOverseasQuarterly]  = useState(initial.overseas_quarterly_cap !== null);
  const [hasCatMonthly,         setHasCatMonthly]         = useState(
    initial.category_monthly_caps !== null && Object.keys(initial.category_monthly_caps ?? {}).length > 0
  );
  const [hasCatQuarterly,       setHasCatQuarterly]       = useState(
    initial.category_quarterly_caps !== null && Object.keys(initial.category_quarterly_caps ?? {}).length > 0
  );
  const [hasUserMonthlyLimit,   setHasUserMonthlyLimit]   = useState(initial.user_monthly_limit !== null);

  const set = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({
      ...form,
      overseas_rate:           hasOverseasRate ? form.overseas_rate : null,
      min_spend_hkd:           hasMinSpend ? form.min_spend_hkd : null,
      min_spend_apply_to:      hasMinSpend ? (form.min_spend_apply_to ?? 'all') : null,
      capped_base_rate:        hasCappedRate ? form.capped_base_rate : null,
      local_monthly_cap:       hasLocalMonthly ? form.local_monthly_cap : null,
      local_quarterly_cap:     hasLocalQuarterly ? form.local_quarterly_cap : null,
      overseas_monthly_cap:    hasOverseasMonthly ? form.overseas_monthly_cap : null,
      overseas_quarterly_cap:  hasOverseasQuarterly ? form.overseas_quarterly_cap : null,
      category_monthly_caps:   hasCatMonthly ? form.category_monthly_caps : null,
      category_quarterly_caps: hasCatQuarterly ? form.category_quarterly_caps : null,
      user_monthly_limit:      hasUserMonthlyLimit ? form.user_monthly_limit : null,
      // 旧来フィールドはクリア（独立上限に移行）
      monthly_cap_limit: null, monthly_cap_rate: null, monthly_cap_apply_to: null,
      quarterly_cap_limit: null, quarterly_cap_rate: null, quarterly_cap_apply_to: null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* ── 基本情報 ── */}
      <SectionCard title="基本資料" emoji="💳" color="#9A7350" defaultOpen>
        <div>
          <label className="block text-[10px] tracking-widest uppercase mb-1" style={{ color: '#A8948A' }}>
            信用卡名稱
          </label>
          <input
            required type="text" value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="例：渣打 Cathay 卡"
            className="w-full text-sm outline-none pb-1 bg-transparent"
            style={{ color: '#5C4A43', borderBottom: '1.5px solid #E0D4C6', caretColor: '#C4A482' }}
            onFocus={(e) => (e.target.style.borderBottomColor = '#C4A482')}
            onBlur={(e) => (e.target.style.borderBottomColor = '#E0D4C6')}
          />
        </div>
        <NumberField
          label="基本里數（HKD / 里）"
          value={form.base_rate}
          onChange={(v) => set('base_rate', v ?? 6)}
          unit="HKD / 里"
          hint="每消費此金額可賺取 1 里"
        />
        <div>
          <Toggle
            checked={hasOverseasRate} label="設定海外簽賬利率"
            onChange={(v) => {
              setHasOverseasRate(v);
              if (v && form.overseas_rate === null) set('overseas_rate', form.base_rate);
            }}
          />
          {hasOverseasRate && (
            <div className="pl-11 mt-1">
              <NumberField
                label="海外利率（HKD / 里）"
                value={form.overseas_rate}
                onChange={(v) => set('overseas_rate', v)}
                unit="HKD / 里"
              />
            </div>
          )}
        </div>
        <div>
          <Toggle
            checked={hasMinSpend} label="設定最低消費額"
            onChange={(v) => {
              setHasMinSpend(v);
              if (v && form.min_spend_hkd === null) set('min_spend_hkd', 5000);
            }}
          />
          {hasMinSpend && (
            <div className="pl-11 mt-1 space-y-3">
              <NumberField
                label="最低消費額（HKD）"
                value={form.min_spend_hkd}
                onChange={(v) => set('min_spend_hkd', v)}
                unit="HKD 以上才享優惠"
                min={1}
              />
              <div>
                <label className="block text-[10px] tracking-widest uppercase mb-1.5" style={{ color: '#A8948A' }}>
                  最低消費計算範圍
                </label>
                <select
                  value={form.min_spend_apply_to ?? 'all'}
                  onChange={(e) => set('min_spend_apply_to', e.target.value as 'all' | 'local' | 'overseas' | 'category')}
                  className="w-full rounded-xl px-3 py-2 text-sm outline-none cursor-pointer"
                  style={{
                    background: '#EFE9E1',
                    color: '#5C4A43',
                    border: '1.5px solid #E0D4C6',
                  }}
                >
                  <option value="all">📊 全部簽費（本地 + 海外）</option>
                  <option value="local">🏠 僅本地簽費（HKD）</option>
                  <option value="overseas">✈️ 僅海外簽費（外幣）</option>
                  <option value="category">🏷️ 特定分類簽費</option>
                </select>
                <p className="text-[10px] mt-1" style={{ color: '#CDB99F' }}>
                  {
                    (form.min_spend_apply_to ?? 'all') === 'all' ? '累計本地 + 海外簽費總額達標才享優惠利率' :
                    (form.min_spend_apply_to ?? 'all') === 'local' ? '僅累計本地（HKD）簽費達標才享優惠利率' :
                    (form.min_spend_apply_to ?? 'all') === 'overseas' ? '僅累計海外（外幣）簽費達標才享優惠利率' :
                    '僅累計特定分類簽費達標才享優惠利率'
                  }
                </p>
              </div>
            </div>
          )}
        </div>
        <div>
          <Toggle
            checked={hasCappedRate} label="設定超限後降級利率"
            onChange={(v) => {
              setHasCappedRate(v);
              if (v && form.capped_base_rate === null) set('capped_base_rate', form.base_rate);
            }}
          />
          {hasCappedRate && (
            <div className="pl-11 mt-1">
              <NumberField
                label="超限後降級利率（HKD / 里）"
                value={form.capped_base_rate}
                onChange={(v) => set('capped_base_rate', v)}
                unit="HKD / 里"
                hint="超過任何上限後套用此利率（預設使用基本利率）"
              />
            </div>
          )}
        </div>

        {/* ── 結單日設定（新增）── */}
        <div>
          <label className="block text-[10px] tracking-widest uppercase mb-1.5" style={{ color: '#A8948A' }}>
            📅 每月結單日（Cut-off Day）
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={31}
              value={form.statement_date ?? 1}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                if (!isNaN(v) && v >= 1 && v <= 31) set('statement_date', v);
              }}
              className="w-20 text-sm outline-none pb-0.5 bg-transparent text-center"
              style={{
                color: '#5C4A43',
                borderBottom: '1.5px solid #E0D4C6',
                caretColor: '#C4A482',
              }}
              onFocus={(e) => (e.target.style.borderBottomColor = '#C4A482')}
              onBlur={(e) => (e.target.style.borderBottomColor = '#E0D4C6')}
            />
            <span className="text-sm" style={{ color: '#A8948A' }}>號</span>
          </div>
          <p className="text-[10px] mt-1" style={{ color: '#CDB99F' }}>
            每月此日為結單日，系統會計算上一個結單日至今的消費（AE: 23號 / HSBC: 8號 / BOC: 15號 / SC: 11號）
          </p>
        </div>

        {/* ── 月度簽帳警告上限（新增，可選）── */}
        <div>
          <Toggle
            checked={hasUserMonthlyLimit} label="設定月度簽帳警告上限（可選）"
            onChange={(v) => {
              setHasUserMonthlyLimit(v);
              if (v && form.user_monthly_limit === null) set('user_monthly_limit', 20000);
            }}
          />
          {hasUserMonthlyLimit && (
            <div className="pl-11 mt-1">
              <NumberField
                label="月度簽帳警告上限（HKD）"
                value={form.user_monthly_limit}
                onChange={(v) => set('user_monthly_limit', v)}
                unit="HKD"
                min={1}
                hint="接近此上限時，記帳頁面會顯示警告提示（如 HKD 20,000）"
              />
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── 分類特別利率 ── */}
      <SectionCard title="分類特別利率" emoji="🏷" color="#7D8FAB">
        <CategoryRatesEditor
          value={form.category_rates}
          onChange={(v) => set('category_rates', v)}
        />
      </SectionCard>

      {/* ── 本地上限（HKD 簽賬）── */}
      <SectionCard title="本地簽賬上限（HKD）" emoji="🏠" color="#7DAB8A">
        <p className="text-xs" style={{ color: '#A8948A' }}>
          僅計算本地（HKD）簽賬的累積金額。適用於設有本地消費上限的信用卡。
        </p>
        <div>
          <Toggle
            checked={hasLocalMonthly} label="每月本地上限"
            onChange={(v) => {
              setHasLocalMonthly(v);
              if (v && form.local_monthly_cap === null) set('local_monthly_cap', 25000);
            }}
          />
          {hasLocalMonthly && (
            <div className="pl-11 mt-1">
              <NumberField
                label="每月本地上限（HKD）"
                value={form.local_monthly_cap}
                onChange={(v) => set('local_monthly_cap', v)}
                unit="HKD 後降級"
                min={1}
                hint="每月本地簽賬累積超過此金額後，套用降級利率"
              />
            </div>
          )}
        </div>
        <div>
          <Toggle
            checked={hasLocalQuarterly} label="每季本地上限"
            onChange={(v) => {
              setHasLocalQuarterly(v);
              if (v && form.local_quarterly_cap === null) set('local_quarterly_cap', 75000);
            }}
          />
          {hasLocalQuarterly && (
            <div className="pl-11 mt-1">
              <NumberField
                label="每季本地上限（HKD）"
                value={form.local_quarterly_cap}
                onChange={(v) => set('local_quarterly_cap', v)}
                unit="HKD 後降級"
                min={1}
                hint="每季（Q1=1-3月）本地簽賬累積超過此金額後，套用降級利率"
              />
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── 海外上限（外幣簽賬）── */}
      <SectionCard title="海外簽賬上限（外幣）" emoji="✈️" color="#AB7D9A">
        <p className="text-xs" style={{ color: '#A8948A' }}>
          僅計算海外（非 HKD）簽賬的累積金額。適用於 HSBC EveryMile、BOC Cheers 等設有海外消費上限的信用卡。
        </p>
        <div>
          <Toggle
            checked={hasOverseasMonthly} label="每月海外上限"
            onChange={(v) => {
              setHasOverseasMonthly(v);
              if (v && form.overseas_monthly_cap === null) set('overseas_monthly_cap', 15000);
            }}
          />
          {hasOverseasMonthly && (
            <div className="pl-11 mt-1">
              <NumberField
                label="每月海外上限（HKD 等值）"
                value={form.overseas_monthly_cap}
                onChange={(v) => set('overseas_monthly_cap', v)}
                unit="HKD 後降級"
                min={1}
                hint="例：HSBC EveryMile 每月海外 HKD 15,000 後降至基本利率"
              />
            </div>
          )}
        </div>
        <div>
          <Toggle
            checked={hasOverseasQuarterly} label="每季海外上限"
            onChange={(v) => {
              setHasOverseasQuarterly(v);
              if (v && form.overseas_quarterly_cap === null) set('overseas_quarterly_cap', 45000);
            }}
          />
          {hasOverseasQuarterly && (
            <div className="pl-11 mt-1">
              <NumberField
                label="每季海外上限（HKD 等值）"
                value={form.overseas_quarterly_cap}
                onChange={(v) => set('overseas_quarterly_cap', v)}
                unit="HKD 後降級"
                min={1}
              />
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── 分類上限 ── */}
      <SectionCard title="特定分類上限" emoji="🏷" color="#C07A4A">
        <p className="text-xs" style={{ color: '#A8948A' }}>
          針對特定消費分類設定獨立上限。例如：AE Explorer 飲食分類每季 HKD 10,000 享優惠利率。
        </p>
        <div>
          <Toggle
            checked={hasCatMonthly} label="設定每月分類上限"
            onChange={(v) => {
              setHasCatMonthly(v);
              if (!v) set('category_monthly_caps', null);
            }}
          />
          {hasCatMonthly && (
            <div className="pl-4 mt-2">
              <CategoryCapsEditor
                label="每月分類上限"
                value={form.category_monthly_caps}
                onChange={(v) => set('category_monthly_caps', v)}
              />
            </div>
          )}
        </div>
        <div>
          <Toggle
            checked={hasCatQuarterly} label="設定每季分類上限"
            onChange={(v) => {
              setHasCatQuarterly(v);
              if (!v) set('category_quarterly_caps', null);
            }}
          />
          {hasCatQuarterly && (
            <div className="pl-4 mt-2">
              <CategoryCapsEditor
                label="每季分類上限"
                value={form.category_quarterly_caps}
                onChange={(v) => set('category_quarterly_caps', v)}
              />
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── ボタン ── */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit" disabled={isSaving}
          className="flex-1 py-3 rounded-2xl text-sm font-semibold transition-all active:scale-[0.97] disabled:opacity-50"
          style={{
            background: 'linear-gradient(135deg, #9A7350 0%, #C4A482 100%)',
            color: '#FFFDF9',
            boxShadow: '0 4px 12px rgba(154,115,80,0.30)',
          }}
        >
          {isSaving ? '儲存中… ☕' : '儲存規則'}
        </button>
        <button
          type="button" onClick={onCancel} disabled={isSaving}
          className="px-6 py-3 rounded-2xl text-sm transition-all active:scale-[0.97] disabled:opacity-50"
          style={{ background: '#EFE9E1', color: '#9A7350' }}
        >
          取消
        </button>
      </div>
    </form>
  );
}

// ============================================================
// カードサマリーバッジ
// ============================================================
function CardBadges({ card }: { card: CreditCard }) {
  const badges: { label: string; bg: string; color: string }[] = [
    { label: `基本 HKD ${card.base_rate}/里`, bg: '#F5EDE3', color: '#9A7350' },
  ];
  if (card.overseas_rate !== null)
    badges.push({ label: `海外 HKD ${card.overseas_rate}/里`, bg: '#FDF3E8', color: '#C07A4A' });
  if (card.min_spend_hkd !== null) {
    const applyToIcon: Record<string, string> = { all: '📊', local: '🏠', overseas: '✈️', category: '🏷️' };
    const icon = applyToIcon[card.min_spend_apply_to ?? 'all'] ?? '📊';
    badges.push({ label: `${icon}最低 HKD ${card.min_spend_hkd.toLocaleString()}`, bg: '#EEF5F0', color: '#7DAB8A' });
  }
  if (card.local_monthly_cap !== null)
    badges.push({ label: `🏠月 HKD ${card.local_monthly_cap.toLocaleString()}`, bg: '#EEF5F0', color: '#7DAB8A' });
  if (card.local_quarterly_cap !== null)
    badges.push({ label: `🏠季 HKD ${card.local_quarterly_cap.toLocaleString()}`, bg: '#EEF5F0', color: '#5D8A6A' });
  if (card.overseas_monthly_cap !== null)
    badges.push({ label: `✈️月 HKD ${card.overseas_monthly_cap.toLocaleString()}`, bg: '#F5EEF3', color: '#AB7D9A' });
  if (card.overseas_quarterly_cap !== null)
    badges.push({ label: `✈️季 HKD ${card.overseas_quarterly_cap.toLocaleString()}`, bg: '#F5EEF3', color: '#8B5D7A' });
  if (card.category_monthly_caps && Object.keys(card.category_monthly_caps).length > 0)
    badges.push({ label: `分類月上限 ×${Object.keys(card.category_monthly_caps).length}`, bg: '#FDF3E8', color: '#C07A4A' });
  if (card.category_quarterly_caps && Object.keys(card.category_quarterly_caps).length > 0)
    badges.push({ label: `分類季上限 ×${Object.keys(card.category_quarterly_caps).length}`, bg: '#FDF3E8', color: '#A05A2A' });
  if (card.capped_base_rate !== null)
    badges.push({ label: `降級 HKD ${card.capped_base_rate}/里`, bg: '#EFE9E1', color: '#A8948A' });
  // 新增：結單日和月度上限 badge
  badges.push({ label: `📅 ${card.statement_date ?? 1}號結單`, bg: '#EEF2F8', color: '#7D8FAB' });
  if (card.user_monthly_limit !== null)
    badges.push({ label: `⚠️ 月限 HKD ${card.user_monthly_limit.toLocaleString()}`, bg: '#FDF3E8', color: '#C07A4A' });

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {badges.map((b) => (
        <span
          key={b.label}
          className="text-[10px] px-2 py-0.5 rounded-full font-medium"
          style={{ background: b.bg, color: b.color }}
        >
          {b.label}
        </span>
      ))}
    </div>
  );
}

// ============================================================
// メインの Admin ページ
// ============================================================
export default function AdminPage() {
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const [cards, setCards]           = useState<CreditCard[]>([]);
  const [loading, setLoading]       = useState(true);
  const [editingId, setEditingId]   = useState<string | 'new' | null>(null);
  const [isSaving, setIsSaving]     = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast]           = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);

  const currentQ = getCurrentQuarter();

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadCards = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('credit_cards').select('*').order('name');
    if (!error && data) setCards(data as CreditCard[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setIsAuthorized(true);
      } else {
        setIsAuthorized(false);
      }
      setAuthChecked(true);
    });
  }, []);

  useEffect(() => { if (isAuthorized) loadCards(); }, [loadCards, isAuthorized]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#EFE9E1' }}>
        <div className="text-4xl animate-bounce">🐧</div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-5" style={{ background: '#EFE9E1' }}>
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="text-lg font-semibold mb-2" style={{ color: '#5C4A43' }}>需要登入</h2>
        <p className="text-sm text-center" style={{ color: '#A8948A' }}>請先登入才能進入管理頁面</p>
      </div>
    );
  }

  const handleSave = async (data: Omit<CreditCard, 'id'> & { id?: string }) => {
    setIsSaving(true);
    let error;
    if (data.id) {
      const { id, ...rest } = data;
      ({ error } = await supabase.from('credit_cards').update(rest).eq('id', id));
    } else {
      ({ error } = await supabase.from('credit_cards').insert([data]));
    }
    setIsSaving(false);
    if (error) {
      showToast('儲存失敗：' + error.message, 'err');
    } else {
      invalidateCardRulesCache();
      showToast(data.id ? '✅ 信用卡規則已更新！' : '✅ 新信用卡已新增！');
      setEditingId(null);
      await loadCards();
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`確定要刪除「${name}」嗎？此操作無法復原。`)) return;
    setDeletingId(id);
    const { error } = await supabase.from('credit_cards').delete().eq('id', id);
    setDeletingId(null);
    if (error) {
      showToast('刪除失敗：' + error.message, 'err');
    } else {
      invalidateCardRulesCache();
      showToast(`「${name}」已刪除`);
      setCards((prev) => prev.filter((c) => c.id !== id));
    }
  };

  return (
    <div className="min-h-screen" style={{ background: '#EFE9E1' }}>

      {/* ── トースト通知 ── */}
      {toast && (
        <div
          className="fixed top-5 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-sm font-medium shadow-lg animate-fade-in-up"
          style={
            toast.type === 'ok'
              ? { background: 'linear-gradient(135deg, #9A7350, #C4A482)', color: '#FFFDF9' }
              : { background: '#C47A7A', color: '#FFFDF9' }
          }
        >
          {toast.msg}
        </div>
      )}

      <div className="max-w-md mx-auto px-5 pt-12 pb-6 space-y-5">

        {/* ── Header ── */}
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: '#5C4A43' }}>
              信用卡管理 🐦
            </h1>
            <p className="text-[10px] mt-0.5 tracking-widest uppercase" style={{ color: '#A8948A' }}>
              🐧記帳本🐧 · 現在 {QUARTER_LABELS[currentQ]}
            </p>
          </div>
          {editingId === null && (
            <button
              onClick={() => setEditingId('new')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-2xl text-sm font-semibold transition-all active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #9A7350 0%, #C4A482 100%)',
                color: '#FFFDF9',
                boxShadow: '0 4px 12px rgba(154,115,80,0.30)',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              新增信用卡
            </button>
          )}
        </header>

        {/* ── 上限設計說明 ── */}
        <div
          className="rounded-2xl p-4 text-xs space-y-1.5"
          style={{ background: '#FDF3E8', border: '1px solid #E8D5C0', color: '#C07A4A' }}
        >
          <p className="font-semibold">☕ 上限設計說明</p>
          <p>
            <span className="font-medium">🏠 本地上限：</span>
            只計算 HKD 簽賬（如渣打 Cathay 卡本地每月 HKD 25,000 享優惠）
          </p>
          <p>
            <span className="font-medium">✈️ 海外上限：</span>
            只計算非 HKD 簽賬（如 HSBC EveryMile 每月海外 HKD 15,000）
          </p>
          <p>
            <span className="font-medium">🏷 分類上限：</span>
            針對特定分類獨立計算（如 AE Explorer 飲食每季 HKD 10,000）
          </p>
          <p>若同時設定多個上限，系統自動選取對用戶最不利的計算結果。</p>
        </div>

        {/* ── 新規作成フォーム ── */}
        {editingId === 'new' && (
          <div
            className="rounded-3xl p-6"
            style={{
              background: '#FFFDF9',
              border: '2px solid #C4A482',
              boxShadow: '0 8px 32px rgba(196,164,130,0.20)',
            }}
          >
            <div className="flex items-center gap-2 mb-5">
              <span className="text-lg">✨</span>
              <h2 className="text-sm font-semibold" style={{ color: '#9A7350' }}>新增信用卡</h2>
            </div>
            <CardForm
              initial={{ ...EMPTY_FORM }}
              onSave={handleSave}
              onCancel={() => setEditingId(null)}
              isSaving={isSaving}
            />
          </div>
        )}

        {/* ── カードリスト ── */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-3xl animate-pulse" style={{ background: '#E0D4C6' }} />
            ))}
          </div>
        ) : cards.length === 0 ? (
          <div
            className="rounded-3xl p-10 text-center"
            style={{ background: '#FFFDF9', border: '1px solid #EFE9E1' }}
          >
            <p className="text-2xl mb-2">🐦</p>
            <p className="text-sm" style={{ color: '#A8948A' }}>尚未設定任何信用卡</p>
            <p className="text-xs mt-1" style={{ color: '#CDB99F' }}>點擊上方「新增信用卡」開始設定</p>
          </div>
        ) : (
          <div className="space-y-3">
            {cards.map((card) => {
              const isEditing = editingId === card.id;
              return (
                <div
                  key={card.id}
                  className="rounded-3xl overflow-hidden transition-all"
                  style={{
                    background: '#FFFDF9',
                    border: isEditing ? '2px solid #C4A482' : '1px solid #EFE9E1',
                    boxShadow: isEditing
                      ? '0 8px 32px rgba(196,164,130,0.20)'
                      : '0 4px 16px rgba(92,74,67,0.08)',
                  }}
                >
                  {/* カードヘッダー */}
                  <div className="flex items-start justify-between p-5">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold" style={{ color: '#5C4A43' }}>{card.name}</h3>
                      <CardBadges card={card} />
                      {Object.keys(card.category_rates ?? {}).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {Object.entries(card.category_rates).map(([cat, rate]) => (
                            <span
                              key={cat}
                              className="text-[10px] px-2 py-0.5 rounded-full"
                              style={{ background: '#EFE9E1', color: '#9A7350' }}
                            >
                              {CATEGORY_EMOJI[cat as Category]} {cat} {rate}/里
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 操作ボタン */}
                    {!isEditing && (
                      <div className="flex gap-1.5 ml-3 shrink-0">
                        <button
                          onClick={() => setEditingId(card.id)}
                          className="p-2 rounded-xl transition-all active:scale-90"
                          style={{ color: '#A8948A' }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = '#EFE9E1';
                            (e.currentTarget as HTMLButtonElement).style.color = '#9A7350';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                            (e.currentTarget as HTMLButtonElement).style.color = '#A8948A';
                          }}
                          title="編輯"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(card.id, card.name)}
                          disabled={deletingId === card.id}
                          className="p-2 rounded-xl transition-all active:scale-90 disabled:opacity-40"
                          style={{ color: '#A8948A' }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = '#FDF0F0';
                            (e.currentTarget as HTMLButtonElement).style.color = '#C47A7A';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                            (e.currentTarget as HTMLButtonElement).style.color = '#A8948A';
                          }}
                          title="刪除"
                        >
                          {deletingId === card.id ? (
                            <div
                              className="w-3.5 h-3.5 rounded-full border border-t-transparent animate-spin"
                              style={{ borderColor: '#C4A482', borderTopColor: 'transparent' }}
                            />
                          ) : (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14H6L5 6" />
                              <path d="M10 11v6M14 11v6" />
                              <path d="M9 6V4h6v2" />
                            </svg>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 編集フォーム（展開） */}
                  {isEditing && (
                    <div className="p-5" style={{ borderTop: '1px solid #EFE9E1' }}>
                      <CardForm
                        initial={{ ...card }}
                        onSave={handleSave}
                        onCancel={() => setEditingId(null)}
                        isSaving={isSaving}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
