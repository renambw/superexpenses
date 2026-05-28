// src/lib/frankfurter.ts
//
// 匯率取得ロジック
//   プライマリ  : open.er-api.com（無料・登録不要・CORS 対応）
//   フォールバック: Frankfurter API（オープンソース・登録不要）
//
// 設計方針：
//   - HKD 入力の場合は API を呼ばずに即時返却
//   - プライマリ API が失敗した場合、自動的にフォールバック API を使用

const FRANKFURTER_BASE = 'https://api.frankfurter.app';

export async function convertToHKD(
  amount: number,
  from: string
): Promise<{ amountHKD: number; rate: number; date: string }> {
  if (from === 'HKD') {
    return {
      amountHKD: amount,
      rate: 1.0,
      date: new Date().toISOString().split('T')[0],
    };
  }

  // ── プライマリ：open.er-api.com ──────────────────────────
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${from}`);
    if (!res.ok) throw new Error('API 1 failed');
    const data = await res.json();
    const rate = data.rates['HKD'];
    if (!rate) throw new Error('HKD rate not found');
    return {
      amountHKD: amount * rate,
      rate,
      date: new Date().toISOString().split('T')[0],
    };
  } catch (err) {
    // ── フォールバック：Frankfurter API ──────────────────────
    const url = `${FRANKFURTER_BASE}/latest?amount=${amount}&from=${from}&to=HKD`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Exchange API error`);
    const data = await response.json();
    const amountHKD = data.rates['HKD'];
    return {
      amountHKD,
      rate: amountHKD / amount,
      date: data.date,
    };
  }
}
