'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Mode = 'login' | 'register' | 'forgot'

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const router = useRouter()

  // 奶茶主題顏色
  const milkTeaBrown = '#C4A482'
  const milkTeaDark = '#9A7350'
  const milkTeaLight = '#EFE9E1'
  const milkTeaBg = 'linear-gradient(160deg, #EFE9E1 0%, #E8DDD4 100%)'
  const textDark = '#5C4A43'
  const textMid = '#A89489'

  const inputStyle = {
    background: milkTeaLight,
    color: textDark,
    border: '1.5px solid transparent',
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    setIsLoading(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError('電郵或密碼錯誤，請重試')
      } else {
        router.push('/')
        router.refresh()
      }
    } catch {
      setError('登入時發生錯誤，請重試')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')

    if (password !== confirmPassword) {
      setError('兩次輸入的密碼不一致')
      return
    }
    if (password.length < 6) {
      setError('密碼至少需要 6 個字元')
      return
    }

    setIsLoading(true)
    try {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) {
        if (error.message.includes('already registered')) {
          setError('此電郵已註冊，請直接登入')
        } else {
          setError('註冊失敗：' + error.message)
        }
      } else {
        setSuccessMsg('✅ 註冊成功！請直接登入。')
        setMode('login')
      }
    } catch {
      setError('註冊時發生錯誤，請重試')
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')

    if (!email) {
      setError('請輸入你的電郵地址')
      return
    }

    setIsLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
      })
      if (error) {
        setError('發送失敗：' + error.message)
      } else {
        setSuccessMsg('✅ 重設密碼郵件已發送！請檢查你的 Gmail。')
      }
    } catch {
      setError('發送時發生錯誤，請重試')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-5 py-10 pb-20"
      style={{ background: milkTeaBg }}
    >
      {/* 企鵝 Logo */}
      <div className="text-center mb-8">
        <div className="text-5xl mb-3 animate-bounce" style={{ animationDuration: '2s' }}>🐧</div>
        <h1 className="text-2xl font-light tracking-widest" style={{ color: textDark }}>
          記帳本
        </h1>
        <p className="text-sm mt-1" style={{ color: textMid }}>
          Asia Miles 里數最佳化
        </p>
      </div>

      {/* 卡片 */}
      <div
        className="w-full max-w-sm rounded-3xl p-7 shadow-lg"
        style={{ background: 'rgb(255, 253, 249)', boxShadow: 'rgba(92,74,67,0.1) 0px 8px 32px' }}
      >
        {/* 忘記密碼模式 */}
        {mode === 'forgot' ? (
          <>
            <div className="text-center mb-5">
              <p className="text-base font-semibold" style={{ color: textDark }}>🔑 重設密碼</p>
              <p className="text-xs mt-1" style={{ color: textMid }}>
                輸入你的電郵，我們會發送重設連結
              </p>
            </div>

            {error && (
              <div className="text-sm px-4 py-3 rounded-xl text-center mb-4"
                style={{ background: 'rgba(220,53,69,0.1)', color: '#dc3545' }}>
                {error}
              </div>
            )}
            {successMsg && (
              <div className="text-sm px-4 py-3 rounded-xl text-center mb-4"
                style={{ background: 'rgba(40,167,69,0.1)', color: '#28a745' }}>
                {successMsg}
              </div>
            )}

            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: textMid }}>
                  📧 電郵地址
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  autoComplete="email"
                  className="w-full rounded-2xl px-4 py-3 text-sm outline-none transition-all"
                  style={inputStyle}
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 rounded-2xl text-sm font-semibold tracking-wide transition-all active:scale-95 mt-2"
                style={{
                  background: `linear-gradient(135deg, ${milkTeaBrown}, ${milkTeaDark})`,
                  color: '#FFFDF9',
                  boxShadow: `0 4px 16px rgba(196,164,130,0.35)`,
                  opacity: isLoading ? 0.7 : 1,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {isLoading ? '發送中…' : '📧 發送重設郵件'}
              </button>
            </form>

            <p className="text-center text-xs mt-5" style={{ color: textMid }}>
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setSuccessMsg('') }}
                className="font-medium underline underline-offset-2"
                style={{ color: milkTeaBrown }}
              >
                ← 返回登入
              </button>
            </p>
          </>
        ) : (
          <>
            {/* 登入 / 註冊 Tab */}
            <div className="flex rounded-2xl p-1 mb-6" style={{ background: milkTeaLight }}>
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setSuccessMsg('') }}
                className="flex-1 py-2 rounded-xl text-sm font-medium transition-all"
                style={
                  mode === 'login'
                    ? { background: milkTeaBrown, color: '#FFFDF9', boxShadow: `0 2px 8px rgba(196,164,130,0.3)` }
                    : { color: textMid }
                }
              >
                🔑 登入
              </button>
              <button
                type="button"
                onClick={() => { setMode('register'); setError(''); setSuccessMsg('') }}
                className="flex-1 py-2 rounded-xl text-sm font-medium transition-all"
                style={
                  mode === 'register'
                    ? { background: milkTeaBrown, color: '#FFFDF9', boxShadow: `0 2px 8px rgba(196,164,130,0.3)` }
                    : { color: textMid }
                }
              >
                ✨ 註冊
              </button>
            </div>

            {error && (
              <div className="text-sm px-4 py-3 rounded-xl text-center mb-4"
                style={{ background: 'rgba(220,53,69,0.1)', color: '#dc3545' }}>
                {error}
              </div>
            )}
            {successMsg && (
              <div className="text-sm px-4 py-3 rounded-xl text-center mb-4"
                style={{ background: 'rgba(40,167,69,0.1)', color: '#28a745' }}>
                {successMsg}
              </div>
            )}

            <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-4">
              {/* 電郵 */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: textMid }}>
                  📧 電郵地址
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  autoComplete="email"
                  className="w-full rounded-2xl px-4 py-3 text-sm outline-none transition-all"
                  style={inputStyle}
                />
              </div>

              {/* 密碼 */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: textMid }}>
                  🔒 密碼
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="w-full rounded-2xl px-4 py-3 text-sm outline-none transition-all"
                  style={inputStyle}
                />
              </div>

              {/* 確認密碼（只在註冊時顯示） */}
              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: textMid }}>
                    🔒 確認密碼
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="再輸入一次密碼"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="w-full rounded-2xl px-4 py-3 text-sm outline-none transition-all"
                    style={inputStyle}
                  />
                </div>
              )}

              {/* 提交按鈕 */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 rounded-2xl text-sm font-semibold tracking-wide transition-all active:scale-95 mt-2"
                style={{
                  background: `linear-gradient(135deg, ${milkTeaBrown}, ${milkTeaDark})`,
                  color: '#FFFDF9',
                  boxShadow: `0 4px 16px rgba(196,164,130,0.35)`,
                  opacity: isLoading ? 0.7 : 1,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {isLoading
                  ? (mode === 'login' ? '登入中…' : '註冊中…')
                  : (mode === 'login' ? '🐧 登入記帳本' : '✨ 立即註冊')}
              </button>
            </form>

            {/* 底部連結 */}
            <div className="text-center text-xs mt-5 space-y-2">
              {mode === 'login' && (
                <p style={{ color: textMid }}>
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setError(''); setSuccessMsg('') }}
                    className="font-medium underline underline-offset-2 transition-colors"
                    style={{ color: milkTeaBrown }}
                  >
                    忘記密碼？
                  </button>
                </p>
              )}
              <p style={{ color: textMid }}>
                {mode === 'login' ? '還沒有帳戶？' : '已有帳戶？'}
                <button
                  type="button"
                  onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setSuccessMsg('') }}
                  className="ml-1 font-medium underline underline-offset-2 transition-colors"
                  style={{ color: milkTeaBrown }}
                >
                  {mode === 'login' ? '立即註冊' : '返回登入'}
                </button>
              </p>
            </div>
          </>
        )}
      </div>

      <p className="text-xs mt-6" style={{ color: 'rgba(196,181,173,1)' }}>
        🐧 記帳本 · 您的資料安全加密儲存
      </p>
    </div>
  )
}
