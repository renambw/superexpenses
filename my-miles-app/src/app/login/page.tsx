'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type Mode = 'login' | 'signup';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  // 既にログイン済みならホームへリダイレクト
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data, error }) => {
      if (cancelled) return;
      if (!error && data.session) {
        router.replace('/');
      } else {
        setCheckingSession(false);
      }
    });
    return () => { cancelled = true; };
  }, []); // router を依存配列から外す（無限ループ防止）

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (!email.trim() || !password.trim()) {
      setMessage({ type: 'error', text: '請輸入電郵和密碼' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        setMessage({
          type: 'success',
          text: '✅ 註冊成功！請查收確認電郵，驗證後即可登入。',
        });
        setMode('login');
        setPassword('');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        if (data.session) {
          // 少し待ってから遷移（Cookie が確実に設定されるまで）
          await new Promise((r) => setTimeout(r, 300));
          router.replace('/');
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '發生錯誤，請稍後再試';
      const friendlyMsg =
        msg.includes('Invalid login credentials')
          ? '❌ 電郵或密碼錯誤，請重試'
          : msg.includes('Email not confirmed')
          ? '📧 請先確認您的電郵地址（查收確認信）'
          : msg.includes('User already registered')
          ? '⚠️ 此電郵已被註冊，請直接登入'
          : msg.includes('Password should be at least')
          ? '🔒 密碼至少需要 6 個字元'
          : msg.includes('Unable to validate email address')
          ? '📧 請輸入有效的電郵地址'
          : msg.includes('signup is disabled')
          ? '⚠️ 目前暫停開放註冊'
          : `❌ ${msg}`;
      setMessage({ type: 'error', text: friendlyMsg });
    } finally {
      setLoading(false);
    }
  };

  // セッション確認中はローディング表示
  if (checkingSession) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center"
        style={{ background: 'linear-gradient(160deg, #EFE9E1 0%, #E8DDD4 100%)' }}
      >
        <div className="text-5xl animate-bounce" style={{ animationDuration: '1.5s' }}>
          🐧
        </div>
        <p className="mt-4 text-sm" style={{ color: '#A8948A' }}>載入中…</p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-5 py-10"
      style={{ background: 'linear-gradient(160deg, #EFE9E1 0%, #E8DDD4 100%)' }}
    >
      {/* ヘッダーロゴ */}
      <div className="text-center mb-8">
        <div
          className="text-5xl mb-3"
          style={{ animation: 'bounce 2s infinite' }}
        >
          🐧
        </div>
        <h1
          className="text-2xl font-light tracking-widest"
          style={{ color: '#5C4A43' }}
        >
          記帳本
        </h1>
        <p className="text-sm mt-1" style={{ color: '#A8948A' }}>
          Asia Miles 里數最佳化
        </p>
      </div>

      {/* カード */}
      <div
        className="w-full max-w-sm rounded-3xl p-7"
        style={{
          background: '#FFFDF9',
          boxShadow: '0 8px 32px rgba(92,74,67,0.12)',
        }}
      >
        {/* タブ切り替え */}
        <div
          className="flex rounded-2xl p-1 mb-6"
          style={{ background: '#EFE9E1' }}
        >
          {(['login', 'signup'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setMessage(null);
              }}
              className="flex-1 py-2 rounded-xl text-sm font-medium transition-all"
              style={
                mode === m
                  ? {
                      background: '#C4A482',
                      color: '#FFFDF9',
                      boxShadow: '0 2px 8px rgba(196,164,130,0.3)',
                    }
                  : { color: '#A8948A' }
              }
            >
              {m === 'login' ? '🔑 登入' : '✨ 註冊'}
            </button>
          ))}
        </div>

        {/* メッセージ */}
        {message && (
          <div
            className="rounded-2xl px-4 py-3 mb-4 text-sm leading-relaxed"
            style={
              message.type === 'error'
                ? { background: '#FDF0F0', color: '#C47A7A' }
                : { background: '#EEF5F0', color: '#7DAB8A' }
            }
          >
            {message.text}
          </div>
        )}

        {/* フォーム */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-medium mb-1.5"
              style={{ color: '#A8948A' }}
            >
              📧 電郵地址
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full rounded-2xl px-4 py-3 text-sm outline-none transition-all"
              style={{
                background: '#EFE9E1',
                color: '#5C4A43',
                border: '1.5px solid transparent',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#C4A482')}
              onBlur={(e) => (e.target.style.borderColor = 'transparent')}
            />
          </div>

          {/* パスワード */}
          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium mb-1.5"
              style={{ color: '#A8948A' }}
            >
              🔒 密碼{mode === 'signup' && ' （至少 6 個字元）'}
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-2xl px-4 py-3 text-sm outline-none transition-all"
              style={{
                background: '#EFE9E1',
                color: '#5C4A43',
                border: '1.5px solid transparent',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#C4A482')}
              onBlur={(e) => (e.target.style.borderColor = 'transparent')}
            />
          </div>

          {/* 送信ボタン */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-2xl text-sm font-semibold tracking-wide transition-all active:scale-95 mt-2"
            style={{
              background: loading
                ? '#D4C4B0'
                : 'linear-gradient(135deg, #C4A482, #9A7350)',
              color: '#FFFDF9',
              boxShadow: loading
                ? 'none'
                : '0 4px 16px rgba(196,164,130,0.35)',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span
                  className="inline-block"
                  style={{ animation: 'spin 1s linear infinite' }}
                >
                  ⏳
                </span>
                {mode === 'login' ? '登入中…' : '註冊中…'}
              </span>
            ) : mode === 'login' ? (
              '🐧 登入記帳本'
            ) : (
              '✨ 建立帳戶'
            )}
          </button>
        </form>

        {/* 切り替えリンク */}
        <p className="text-center text-xs mt-5" style={{ color: '#A8948A' }}>
          {mode === 'login' ? '還沒有帳戶？' : '已有帳戶？'}
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setMessage(null);
            }}
            className="ml-1 font-medium underline underline-offset-2 transition-colors"
            style={{ color: '#C4A482' }}
          >
            {mode === 'login' ? '立即註冊' : '返回登入'}
          </button>
        </p>
      </div>

      {/* フッター */}
      <p className="text-xs mt-6" style={{ color: '#C4B5AD' }}>
        🐧 記帳本 · 您的資料安全加密儲存
      </p>
    </div>
  );
}
