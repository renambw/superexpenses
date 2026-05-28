const FRANKFURTER_BASE = 'https://api.frankfurter.app';

export async function convertToHKD(
  amount: number,
  from: string
 ): Promise<{ amountHKD: number; rate: number; date: string }> {
  if (from === 'HKD') {
    return { amountHKD: amount, rate: 1.0, date: new Date().toISOString().split('T')[0] };
  }

  try {
    // 首選：使用更穩定嘅 ExchangeRate-API (免費免註冊)
    const res = await fetch(`https://open.er-api.com/v6/latest/${from}` );
    if (!res.ok) throw new Error('API 1 failed');
    const data = await res.json();
    const rate = data.rates['HKD'];
    const amountHKD = amount * rate;
    return { amountHKD, rate, date: new Date().toISOString().split('T')[0] };
  } catch (err) {
    // 後備：如果上面失敗，轉用 Frankfurter
    const url = `${FRANKFURTER_BASE}/latest?amount=${amount}&from=${from}&to=HKD`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Exchange API error`);
    }
    const data = await response.json();
    const amountHKD = data.rates['HKD'];
    const rate = amountHKD / amount;
    return { amountHKD, rate, date: data.date };
  }
}
