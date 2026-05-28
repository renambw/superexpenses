'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { invalidateCardRulesCache } from '@/lib/milesEngine';
import type { CreditCard, Category, MonthlyCapApplyTo } from '@/types';

// ============================================================
// 定数
// ============================================================
const ALL_CATEGORIES: Category[] = [
  '飲食', '購物', '酒店', '交通', '娛樂', '通訊', '手信/禮物', '醫療/保險', '雜項',
];

const CAP_APPLY_TO_OPTIONS: { value: MonthlyCapApplyTo; label: string }[] = [
  { value: 'all',      label: '全部簽賬' },
  { value: 'overseas', label: '海外簽賬' },
  { value: 'category', label: '特定分類' },
];

// ============================================================
// 空のカードフォーム初期値
// ============================================================
const EMPTY_FORM: Omit<CreditCard, 'id'> = {
  name: '',
  base_rate: 6,
  overseas_rate: null,
  category_rates: {},
  min_spend_hkd: null,
  monthly_cap_limit: null,
  monthly_cap_rate: null,
  monthly_cap_apply_to: null,
};

// ============================================================
// カテゴリ利率エディタ（JSONB フィールド用）
// ============================================================
function CategoryRatesEditor({
  value,
  onChange,
}: {
  value: Partial<Record<Category, number>>;
  onChange: (v: Partial<Record<Category, number>>) => void;
}) {
  return (
    <div className="space-y-2">
      {ALL_CATEGORIES.map((cat) => {
        const rate = value[cat];
        const enabled = rate !== undefined;
        return (
          <div key={cat} className="flex items-center gap-3">
            <label className="flex items-center gap-2 w-28 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => {
                  const next = { ...value };
                  if (e.target.checked) {
                    next[cat] = 6;
                  } else {
                    delete next[cat];
                  }
                  onChange(next);
                }}
                className="w-3.5 h-3.5 accent-gray-900"
              />
              <span className="text-sm text-gray-700">{cat}</span>
            </label>
            {enabled && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400">HKD</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={rate}
                  min={0.1}
                  step={0.25}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v) && v > 0) onChange({ ...value, [cat]: v });
                  }}
                  className="w-20 text-sm border-b border-gray-300 focus:border-gray-900 outline-none pb-0.5 text-center bg-transparent"
                />
                <span className="text-xs text-gray-400">/ 里</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// カード編集フォーム（新規作成 & 編集共用）
// ============================================================
function CardForm({
  initial,
  onSave,
  onCancel,
  isSaving,
}: {
  initial: Omit<CreditCard, 'id'> & { id?: string };
  onSave: (data: Omit<CreditCard, 'id'> & { id?: string }) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState(initial);
  const [hasMonthlyCapLimit, setHasMonthlyCapLimit] = useState(
    initial.monthly_cap_limit !== null
  );
  const [hasOverseasRate, setHasOverseasRate] = useState(
    initial.overseas_rate !== null
  );
  const [hasMinSpend, setHasMinSpend] = useState(
    initial.min_spend_hkd !== null
  );

  const set = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      overseas_rate:       hasOverseasRate ? form.overseas_rate : null,
      min_spend_hkd:       hasMinSpend ? form.min_spend_hkd : null,
      monthly_cap_limit:   hasMonthlyCapLimit ? form.monthly_cap_limit : null,
      monthly_cap_rate:    hasMonthlyCapLimit ? form.monthly_cap_rate : null,
      monthly_cap_apply_to: hasMonthlyCapLimit ? form.monthly_cap_apply_to : null,
    };
    await onSave(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* カード名 */}
      <div>
        <label className="field-label">信用卡名稱</label>
        <input
          required
          type="text"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="例：渣打 Cathay 卡"
          className="field-input"
        />
      </div>

      {/* 基本利率 */}
      <div>
        <label className="field-label">基本里數（HKD / 里）</label>
        <div className="flex items-center gap-2">
          <input
            required type="number" inputMode="decimal"
            value={form.base_rate} min={0.1} step={0.25}
            onChange={(e) => set('base_rate', parseFloat(e.target.value))}
            className="field-input w-28"
          />
          <span className="text-sm text-gray-400">HKD / 里</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">每消費此金額可賺取 1 里</p>
      </div>

      {/* 海外利率 */}
      <div>
        <label className="flex items-center gap-2 cursor-pointer select-none mb-2">
          <input
            type="checkbox" checked={hasOverseasRate}
            onChange={(e) => {
              setHasOverseasRate(e.target.checked);
              if (e.target.checked && form.overseas_rate === null)
                set('overseas_rate', form.base_rate);
            }}
            className="w-3.5 h-3.5 accent-gray-900"
          />
          <span className="field-label mb-0">設定海外簽賬利率</span>
        </label>
        {hasOverseasRate && (
          <div className="flex items-center gap-2 pl-5">
            <input
              type="number" inputMode="decimal"
              value={form.overseas_rate ?? ''} min={0.1} step={0.25}
              onChange={(e) => set('overseas_rate', parseFloat(e.target.value))}
              className="field-input w-28"
            />
            <span className="text-sm text-gray-400">HKD / 里（海外）</span>
          </div>
        )}
      </div>

      {/* 最低消費 */}
      <div>
        <label className="flex items-center gap-2 cursor-pointer select-none mb-2">
          <input
            type="checkbox" checked={hasMinSpend}
            onChange={(e) => {
              setHasMinSpend(e.target.checked);
              if (e.target.checked && form.min_spend_hkd === null)
                set('min_spend_hkd', 5000);
            }}
            className="w-3.5 h-3.5 accent-gray-900"
          />
          <span className="field-label mb-0">設定最低消費額</span>
        </label>
        {hasMinSpend && (
          <div className="flex items-center gap-2 pl-5">
            <span className="text-sm text-gray-400">HKD</span>
            <input
              type="number" inputMode="numeric"
              value={form.min_spend_hkd ?? ''} min={1} step={100}
              onChange={(e) => set('min_spend_hkd', parseInt(e.target.value))}
              className="field-input w-28"
            />
            <span className="text-sm text-gray-400">以上才享優惠</span>
          </div>
        )}
      </div>

      {/* 分類別利率 */}
      <div>
        <label className="field-label">分類特別利率（選填）</label>
        <div className="bg-gray-50 rounded-xl p-4 mt-1">
          <CategoryRatesEditor
            value={form.category_rates}
            onChange={(v) => set('category_rates', v)}
          />
        </div>
      </div>

      {/* 月間上限 */}
      <div>
        <label className="flex items-center gap-2 cursor-pointer select-none mb-3">
          <input
            type="checkbox" checked={hasMonthlyCapLimit}
            onChange={(e) => {
              setHasMonthlyCapLimit(e.target.checked);
              if (e.target.checked) {
                if (form.monthly_cap_limit === null) set('monthly_cap_limit', 25000);
                if (form.monthly_cap_rate === null)  set('monthly_cap_rate', form.base_rate);
                if (form.monthly_cap_apply_to === null) set('monthly_cap_apply_to', 'all');
              }
            }}
            className="w-3.5 h-3.5 accent-gray-900"
          />
          <span className="field-label mb-0">設定每月回贈上限</span>
        </label>

        {hasMonthlyCapLimit && (
          <div className="pl-5 space-y-4 border-l-2 border-gray-200">
            <div>
              <label className="field-label">每月上限（HKD）</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">HKD</span>
                <input
                  type="number" inputMode="numeric"
                  value={form.monthly_cap_limit ?? ''} min={1} step={1000}
                  onChange={(e) => set('monthly_cap_limit', parseInt(e.target.value))}
                  className="field-input w-32"
                />
                <span className="text-xs text-gray-400">累積簽賬後降級</span>
              </div>
            </div>

            <div>
              <label className="field-label">超出上限後的利率（HKD / 里）</label>
              <div className="flex items-center gap-2">
                <input
                  type="number" inputMode="decimal"
                  value={form.monthly_cap_rate ?? ''} min={0.1} step={0.25}
                  onChange={(e) => set('monthly_cap_rate', parseFloat(e.target.value))}
                  className="field-input w-28"
                />
                <span className="text-sm text-gray-400">HKD / 里</span>
              </div>
            </div>

            <div>
              <label className="field-label">上限適用範圍</label>
              <div className="flex gap-3 mt-1 flex-wrap">
                {CAP_APPLY_TO_OPTIONS.map(({ value, label }) => (
                  <label key={value} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="cap_apply_to"
                      value={value}
                      checked={form.monthly_cap_apply_to === value}
                      onChange={() => set('monthly_cap_apply_to', value)}
                      className="accent-gray-900"
                    />
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ボタン */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit" disabled={isSaving}
          className="flex-1 py-3 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {isSaving ? '儲存中…' : '儲存'}
        </button>
        <button
          type="button" onClick={onCancel} disabled={isSaving}
          className="px-6 py-3 border border-gray-200 text-sm text-gray-600 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors"
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
  const [cards, setCards]         = useState<CreditCard[]>([]);
  const [loading, setLoading]     = useState(true);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [isSaving, setIsSaving]   = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast]         = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadCards = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('credit_cards')
      .select('*')
      .order('name');
    if (!error && data) setCards(data as CreditCard[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadCards(); }, [loadCards]);

  // ── 保存（新規作成 or 更新）──────────────────────────────
  const handleSave = async (
    data: Omit<CreditCard, 'id'> & { id?: string }
  ) => {
    setIsSaving(true);
    let error;

    if (data.id) {
      // 更新
      const { id, ...rest } = data;
      ({ error } = await supabase
        .from('credit_cards')
        .update(rest)
        .eq('id', id));
    } else {
      // 新規作成
      ({ error } = await supabase
        .from('credit_cards')
        .insert([data]));
    }

    setIsSaving(false);

    if (error) {
      showToast('儲存失敗：' + error.message, 'err');
    } else {
      invalidateCardRulesCache();
      showToast(data.id ? '信用卡規則已更新！' : '新信用卡已新增！');
      setEditingId(null);
      await loadCards();
    }
  };

  // ── 削除 ────────────────────────────────────────────────
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`確定要刪除「${name}」嗎？此操作無法復原。`)) return;
    setDeletingId(id);
    const { error } = await supabase
      .from('credit_cards')
      .delete()
      .eq('id', id);
    setDeletingId(null);

    if (error) {
      showToast('刪除失敗：' + error.message, 'err');
    } else {
      invalidateCardRulesCache();
      showToast(`「${name}」已刪除`);
      setCards((prev) => prev.filter((c) => c.id !== id));
    }
  };

  // ── 編集中のカードを取得 ─────────────────────────────────
  const editingCard =
    editingId === 'new'
      ? { ...EMPTY_FORM }
      : cards.find((c) => c.id === editingId);

  return (
    <div className="min-h-screen text-gray-900">
      {/* トースト通知 */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-lg transition-all ${
            toast.type === 'ok'
              ? 'bg-gray-900 text-white'
              : 'bg-red-500 text-white'
          }`}
        >
          {toast.msg}
        </div>
      )}

      <div className="max-w-md mx-auto px-5 pt-12 pb-6 space-y-6">

        {/* ヘッダー */}
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-light tracking-tight">信用卡管理</h1>
            <p className="text-[10px] text-gray-400 mt-0.5 tracking-widest uppercase">Admin Panel</p>
          </div>
          {editingId === null && (
            <button
              onClick={() => setEditingId('new')}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm rounded-xl hover:bg-gray-800 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              新增信用卡
            </button>
          )}
        </header>

        {/* 新規作成フォーム */}
        {editingId === 'new' && (
          <div className="bg-white rounded-2xl border border-gray-900 shadow-sm p-6 space-y-2">
            <h2 className="text-sm font-medium text-gray-900 mb-4">新增信用卡</h2>
            <CardForm
              initial={{ ...EMPTY_FORM }}
              onSave={handleSave}
              onCancel={() => setEditingId(null)}
              isSaving={isSaving}
            />
          </div>
        )}

        {/* カードリスト */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : cards.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
            <p className="text-sm text-gray-400">尚未設定任何信用卡</p>
            <p className="text-xs text-gray-300 mt-1">點擊上方「新增信用卡」開始設定</p>
          </div>
        ) : (
          <div className="space-y-3">
            {cards.map((card) => {
              const isEditing = editingId === card.id;
              return (
                <div
                  key={card.id}
                  className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
                    isEditing ? 'border-gray-900' : 'border-gray-100'
                  }`}
                >
                  {/* カードヘッダー */}
                  <div className="flex items-start justify-between p-5">
                    <div className="space-y-2 flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900">{card.name}</h3>

                      {/* 利率バッジ */}
                      <div className="flex flex-wrap gap-1.5">
                        <span className="badge-gray">
                          基本 HKD {card.base_rate}/里
                        </span>
                        {card.overseas_rate !== null && (
                          <span className="badge-blue">
                            海外 HKD {card.overseas_rate}/里
                          </span>
                        )}
                        {card.min_spend_hkd !== null && (
                          <span className="badge-amber">
                            最低 HKD {card.min_spend_hkd.toLocaleString()}
                          </span>
                        )}
                        {card.monthly_cap_limit !== null && (
                          <span className="badge-rose">
                            上限 HKD {card.monthly_cap_limit.toLocaleString()}
                          </span>
                        )}
                      </div>

                      {/* 分類利率 */}
                      {Object.keys(card.category_rates).length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(card.category_rates).map(([cat, rate]) => (
                            <span key={cat} className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                              {cat} {rate}/里
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 操作ボタン */}
                    {!isEditing && (
                      <div className="flex gap-2 ml-3 shrink-0">
                        <button
                          onClick={() => setEditingId(card.id)}
                          className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
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
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                          title="刪除"
                        >
                          {deletingId === card.id ? (
                            <div className="w-3.5 h-3.5 border border-gray-400 border-t-transparent rounded-full animate-spin" />
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
                    <div className="border-t border-gray-100 p-5">
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
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-xs text-amber-700 space-y-1">
          <p className="font-medium">⚠ 注意事項</p>
          <p>修改信用卡規則後，推薦引擎將在 60 秒內自動更新。</p>
          <p>刪除信用卡不會影響已記錄的歷史交易紀錄。</p>
        </div>

      </div>

      {/* TailwindCSS 動的クラス用スタイル */}
      <style jsx global>{`
        .field-label {
          display: block;
          font-size: 10px;
          color: #9ca3af;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 6px;
        }
        .field-input {
          width: 100%;
          background: transparent;
          border-bottom: 1px solid #e5e7eb;
          outline: none;
          padding-bottom: 4px;
          font-size: 0.875rem;
          color: #111;
          transition: border-color 0.15s;
        }
        .field-input:focus {
          border-color: #111;
        }
        .badge-gray {
          font-size: 10px;
          background: #f3f4f6;
          color: #374151;
          padding: 2px 8px;
          border-radius: 9999px;
        }
        .badge-blue {
          font-size: 10px;
          background: #eff6ff;
          color: #3b82f6;
          padding: 2px 8px;
          border-radius: 9999px;
        }
        .badge-amber {
          font-size: 10px;
          background: #fffbeb;
          color: #d97706;
          padding: 2px 8px;
          border-radius: 9999px;
        }
        .badge-rose {
          font-size: 10px;
          background: #fff1f2;
          color: #e11d48;
          padding: 2px 8px;
          border-radius: 9999px;
        }
      `}</style>
    </div>
  );
}
