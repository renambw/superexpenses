'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

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

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

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
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        setError('更新失敗：' + error.message)
      } else {
        setSuccess(true)
        setTimeout(() => router.push('/login'), 2500)
      }
    } catch {
      setError('發生錯誤，請重試')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-5 py-10 pb-20"
      style={{ background: milkTeaBg }}
    >
      <div className="text-center mb-8">
        <div className="text-5xl mb-3 animate-bounce" style={{ animationDuration: '2s' }}>🐧</div>
        <h1 className="text-2xl font-light tracking-widest" style={{ color: textDark }}>
          記帳本
        </h1>
        <p className="text-sm mt-1" style={{ color: textMid }}>
          設定新密碼
        </p>
      </div>

      <div
        className="w-full max-w-sm rounded-3xl p-7 shadow-lg"
        style={{ background: 'rgb(255, 253, 249)', boxShadow: 'rgba(92,74,67,0.1) 0px 8px 32px' }}
      >
        {success ? (
          <div className="text-center py-4">
            <div className="text-4xl mb-3">✅</div>
            <p className="font-semibold" style={{ color: textDark }}>密碼已成功更新！</p>
            <p className="text-xs mt-2" style={{ color: textMid }}>正在跳轉至登入頁面…</p>
          </div>
        ) : (
          <>
            <div className="text-center mb-5">
              <p className="text-base font-semibold" style={{ color: textDark }}>🔑 設定新密碼</p>
              <p className="text-xs mt-1" style={{ color: textMid }}>請輸入你的新密碼</p>
            </div>

            {error && (
              <div className="text-sm px-4 py-3 rounded-xl text-center mb-4"
                style={{ background: 'rgba(220,53,69,0.1)', color: '#dc3545' }}>
                {error}
              </div>
            )}

            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: textMid }}>
                  🔒 新密碼
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少 6 個字元"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full rounded-2xl px-4 py-3 text-sm outline-none transition-all"
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: textMid }}>
                  🔒 確認新密碼
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再輸入一次新密碼"
                  required
                  minLength={6}
                  autoComplete="new-password"
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
                {isLoading ? '更新中…' : '🐧 確認更新密碼'}
              </button>
            </form>
          </>
        )}
      </div>

      <p className="text-xs mt-6" style={{ color: 'rgba(196,181,173,1)' }}>
        🐧 記帳本 · 您的資料安全加密儲存
      </p>
    </div>
  )
}
