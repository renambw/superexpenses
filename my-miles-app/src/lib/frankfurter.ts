// src/lib/frankfurter.ts

const FRANKFURTER_BASE = 'https://api.frankfurter.app';

export interface ExchangeResult {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

/**
 * 將指定金額從來源幣種轉換為 HKD
 */
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

  const url = `${FRANKFURTER_BASE}/latest?amount=${amount}&from=${from}&to=HKD`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Frankfurter API 錯誤：${response.status} ${response.statusText}`);
  }

  const data: ExchangeResult = await response.json();
  const amountHKD = data.rates['HKD'];
  const rate = amountHKD / amount;

  return { amountHKD, rate, date: data.date };
}
