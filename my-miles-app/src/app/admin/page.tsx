'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { invalidateCardRulesCache, getCurrentQuarter } from '@/lib/milesEngine';
import type { CreditCard, Category, MonthlyCapApplyTo, QuarterlyCapApplyTo } from '@/types';

// ============================================================
// 定数
// ============================================================
const ALL_CATEGORIES: Category[] = [
  '飲食', '購物', '酒店', '交通', '娛樂', '通訊', '手信/禮物', '醫療/保險', '雜項',
];

const CATEGORY_EMOJI: Record<Category, string> = {
  '飲食': '🍜', '購物': '🛍', '酒店': '🏨', '交通': '🚇',
  '娛樂': '🎬', '通訊': '📱', '手信/禮物': '🎁', '醫療/保險': '💊', '雜項': '📋',
};

const CAP_APPLY_TO_OPTIONS: { value: MonthlyCapApplyTo; label: string }[] = [
  { value: 'all',      label: '全部簽賬' },
  { value: 'overseas', label: '海外簽賬' },
  { value: 'category', label: '特定分類' },
];

const QUARTER_LABELS: Record<number, string> = {
  1: 'Q1（1–3月）',
  2: 'Q2（4–6月）',
  3: 'Q3（7–9月）',
  4: 'Q4（10–12月）',
};

const EMPTY_FORM: Omit<CreditCard, 'id'> = {
  name: '',
  base_rate: 6,
  overseas_rate: null,
  category_rates: {},
  min_spend_hkd: null,
  monthly_cap_limit: null,
  monthly_cap_rate: null,
  monthly_cap_apply_to: null,
  quarterly_cap_limit: null,
  quarterly_cap_rate: null,
  quarterly_cap_apply_to: null,
};

// ============================================================
// トグルスイッチ（共通）
// ============================================================
function Toggle({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
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

// ============================================================
// 数値入力フィールド（共通）
// ============================================================
function NumberField({
  label, value, onChange, unit = 'HKD / 里', min = 0.1, hint,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
  unit?: string;
  min?: number;
  hint?: string;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number" inputMode="decimal" step="any"
          value={value ?? ''} min={min}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v > 0) onChange(v);
          }}
          className="field-input w-32"
          onFocus={(e) => (e.target.style.borderBottomColor = '#C4A482')}
          onBlur={(e) => (e.target.style.borderBottomColor = '#E0D4C6')}
        />
        <span className="text-sm" style={{ color: '#A8948A' }}>{unit}</span>
      </div>
      {hint && <p className="text-xs mt-1" style={{ color: '#CDB99F' }}>{hint}</p>}
    </div>
  );
}

// ============================================================
// カテゴリ利率エディタ
// ============================================================
function CategoryRatesEditor({
  value, onChange,
}: {
  value: Partial<Record<Category, number>>;
  onChange: (v: Partial<Record<Category, number>>) => void;
}) {
  return (
    <div className="space-y-2.5">
      {ALL_CATEGORIES.map((cat) => {
        const rate    = value[cat];
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
                  className="w-20 text-sm text-center outline-none pb-0.5"
                  style={{
                    background: 'transparent',
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
// 上限設定セクション（月間・季度共通コンポーネント）
// ============================================================
function CapSection({
  label,
  emoji,
  hint,
  enabled,
  onToggle,
  capLimit,
  onCapLimit,
  capRate,
  onCapRate,
  applyTo,
  onApplyTo,
}: {
  label: string;
  emoji: string;
  hint: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  capLimit: number | null;
  onCapLimit: (v: number) => void;
  capRate: number | null;
  onCapRate: (v: number) => void;
  applyTo: MonthlyCapApplyTo | QuarterlyCapApplyTo | null;
  onApplyTo: (v: MonthlyCapApplyTo) => void;
}) {
  return (
    <div>
      <Toggle checked={enabled} label={`${emoji} ${label}`} onChange={onToggle} />
      {enabled && (
        <div
          className="pl-4 ml-7 space-y-4 border-l-2 mt-1"
          style={{ borderColor: '#E0D4C6' }}
        >
          <NumberField
            label={`${label}（HKD）`}
            value={capLimit}
            onChange={onCapLimit}
            unit="HKD 累積簽賬後降級"
            min={1}
            hint={hint}
          />
          <NumberField
            label="超出上限後的利率（HKD / 里）"
            value={capRate}
            onChange={onCapRate}
          />
          <div>
            <label className="field-label">上限適用範圍</label>
            <div className="flex gap-3 mt-2 flex-wrap">
              {CAP_APPLY_TO_OPTIONS.map(({ value, label: optLabel }) => (
                <label key={value} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name={`cap_apply_to_${label}`}
                    value={value}
                    checked={applyTo === value}
                    onChange={() => onApplyTo(value)}
                    style={{ accentColor: '#C4A482' }}
                  />
                  <span className="text-sm" style={{ color: '#5C4A43' }}>{optLabel}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// カード編集フォーム
// ============================================================
function CardForm({
  initial, onSave, onCancel, isSaving,
}: {
  initial: Omit<CreditCard, 'id'> & { id?: string };
  onSave: (data: Omit<CreditCard, 'id'> & { id?: string }) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState(initial);
  const [hasOverseasRate,     setHasOverseasRate]     = useState(initial.overseas_rate !== null);
  const [hasMinSpend,         setHasMinSpend]         = useState(initial.min_spend_hkd !== null);
  const [hasMonthlyCapLimit,  setHasMonthlyCapLimit]  = useState(initial.monthly_cap_limit !== null);
  const [hasQuarterlyCapLimit, setHasQuarterlyCapLimit] = useState(initial.quarterly_cap_limit !== null);

  const set = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({
      ...form,
      overseas_rate:           hasOverseasRate ? form.overseas_rate : null,
      min_spend_hkd:           hasMinSpend ? form.min_spend_hkd : null,
      monthly_cap_limit:       hasMonthlyCapLimit ? form.monthly_cap_limit : null,
      monthly_cap_rate:        hasMonthlyCapLimit ? form.monthly_cap_rate : null,
      monthly_cap_apply_to:    hasMonthlyCapLimit ? form.monthly_cap_apply_to : null,
      quarterly_cap_limit:     hasQuarterlyCapLimit ? form.quarterly_cap_limit : null,
      quarterly_cap_rate:      hasQuarterlyCapLimit ? form.quarterly_cap_rate : null,
      quarterly_cap_apply_to:  hasQuarterlyCapLimit ? form.quarterly_cap_apply_to : null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* カード名 */}
      <div>
        <label className="field-label">信用卡名稱</label>
        <input
          required type="text" value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="例：渣打 Cathay 卡"
          className="field-input"
          onFocus={(e) => (e.target.style.borderBottomColor = '#C4A482')}
          onBlur={(e) => (e.target.style.borderBottomColor = '#E0D4C6')}
        />
      </div>

      {/* 基本利率 */}
      <NumberField
        label="基本里數（HKD / 里）"
        value={form.base_rate}
        onChange={(v) => set('base_rate', v)}
        hint="每消費此金額可賺取 1 里"
      />

      {/* 海外利率 */}
      <div>
        <Toggle
          checked={hasOverseasRate} label="設定海外簽賬利率"
          onChange={(v) => {
            setHasOverseasRate(v);
            if (v && form.overseas_rate === null) set('overseas_rate', form.base_rate);
          }}
        />
        {hasOverseasRate && (
          <div className="pl-11">
            <NumberField
              label="海外利率（HKD / 里）"
              value={form.overseas_rate}
              onChange={(v) => set('overseas_rate', v)}
            />
          </div>
        )}
      </div>

      {/* 最低消費 */}
      <div>
        <Toggle
          checked={hasMinSpend} label="設定最低消費額"
          onChange={(v) => {
            setHasMinSpend(v);
            if (v && form.min_spend_hkd === null) set('min_spend_hkd', 5000);
          }}
        />
        {hasMinSpend && (
          <div className="pl-11">
            <NumberField
              label="最低消費額（HKD）"
              value={form.min_spend_hkd}
              onChange={(v) => set('min_spend_hkd', v)}
              unit="HKD 以上才享優惠"
              min={1}
            />
          </div>
        )}
      </div>

      {/* 分類別利率 */}
      <div>
        <label className="field-label">分類特別利率（選填）</label>
        <div
          className="rounded-2xl p-4 mt-1"
          style={{ background: '#FAF7F3', border: '1px solid #EFE9E1' }}
        >
          <CategoryRatesEditor
            value={form.category_rates}
            onChange={(v) => set('category_rates', v)}
          />
        </div>
      </div>

      {/* 月間上限 */}
      <CapSection
        label="每月回贈上限"
        emoji="📅"
        hint="例：渣打 Cathay 卡每月 HKD 25,000 享優惠利率"
        enabled={hasMonthlyCapLimit}
        onToggle={(v) => {
          setHasMonthlyCapLimit(v);
          if (v) {
            if (form.monthly_cap_limit === null)    set('monthly_cap_limit', 25000);
            if (form.monthly_cap_rate === null)     set('monthly_cap_rate', form.base_rate);
            if (form.monthly_cap_apply_to === null) set('monthly_cap_apply_to', 'all');
          }
        }}
        capLimit={form.monthly_cap_limit}
        onCapLimit={(v) => set('monthly_cap_limit', v)}
        capRate={form.monthly_cap_rate}
        onCapRate={(v) => set('monthly_cap_rate', v)}
        applyTo={form.monthly_cap_apply_to}
        onApplyTo={(v) => set('monthly_cap_apply_to', v)}
      />

      {/* 季度上限（新機能） */}
      <CapSection
        label="每季回贈上限"
        emoji="🗓"
        hint="例：AE Explorer 每季 HKD 75,000 享優惠利率（Q1=1-3月，Q2=4-6月…）"
        enabled={hasQuarterlyCapLimit}
        onToggle={(v) => {
          setHasQuarterlyCapLimit(v);
          if (v) {
            if (form.quarterly_cap_limit === null)    set('quarterly_cap_limit', 75000);
            if (form.quarterly_cap_rate === null)     set('quarterly_cap_rate', form.base_rate);
            if (form.quarterly_cap_apply_to === null) set('quarterly_cap_apply_to', 'all');
          }
        }}
        capLimit={form.quarterly_cap_limit}
        onCapLimit={(v) => set('quarterly_cap_limit', v)}
        capRate={form.quarterly_cap_rate}
        onCapRate={(v) => set('quarterly_cap_rate', v)}
        applyTo={form.quarterly_cap_apply_to}
        onApplyTo={(v) => set('quarterly_cap_apply_to', v as MonthlyCapApplyTo)}
      />

      {/* ボタン */}
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
          {isSaving ? '儲存中… ☕' : '儲存'}
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
// メインの Admin ページ
// ============================================================
export default function AdminPage() {
  const [cards, setCards]           = useState<CreditCard[]>([]);
  const [loading, setLoading]       = useState(true);
  const [editingId, setEditingId]   = useState<string | 'new' | null>(null);
  const [isSaving, setIsSaving]     = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast]           = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  const currentQ = getCurrentQuarter();

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadCards = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('credit_cards').select('*').order('name');
    if (!error && data) setCards(data as CreditCard[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadCards(); }, [loadCards]);

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
          className="fixed top-5 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-sm font-medium shadow-lg transition-all animate-fade-in-up"
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
              Admin Panel · 現在 {QUARTER_LABELS[currentQ]}
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
            {[1, 2, 3].map((i) => <div key={i} className="h-24 skeleton" />)}
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
                    <div className="space-y-2 flex-1 min-w-0">
                      <h3 className="font-semibold" style={{ color: '#5C4A43' }}>{card.name}</h3>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="badge-brown">基本 HKD {card.base_rate}/里</span>
                        {card.overseas_rate !== null && (
                          <span className="badge-latte">海外 HKD {card.overseas_rate}/里</span>
                        )}
                        {card.min_spend_hkd !== null && (
                          <span className="badge-caramel">
                            最低 HKD {card.min_spend_hkd.toLocaleString()}
                          </span>
                        )}
                        {card.monthly_cap_limit !== null && (
                          <span className="badge-rose">
                            📅 月上限 HKD {card.monthly_cap_limit.toLocaleString()}
                          </span>
                        )}
                        {card.quarterly_cap_limit !== null && (
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                            style={{ background: '#F0EEF8', color: '#7D6FAB' }}
                          >
                            🗓 季上限 HKD {card.quarterly_cap_limit.toLocaleString()}
                          </span>
                        )}
                      </div>
                      {Object.keys(card.category_rates).length > 0 && (
                        <div className="flex flex-wrap gap-1">
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

        {/* 注意事項 */}
        <div
          className="rounded-2xl p-4 text-xs space-y-1"
          style={{ background: '#FDF3E8', border: '1px solid #E8D5C0', color: '#C07A4A' }}
        >
          <p className="font-semibold">☕ 注意事項</p>
          <p>修改信用卡規則後，推薦引擎將在 60 秒內自動更新。</p>
          <p>每季上限按 Q1（1–3月）、Q2（4–6月）、Q3（7–9月）、Q4（10–12月）計算。</p>
          <p>若同時設定月間及季度上限，系統會自動選取對用戶較不利的上限進行計算。</p>
        </div>

      </div>
    </div>
  );
}
