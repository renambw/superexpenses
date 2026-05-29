'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const router = useRouter()
  const supabase = createClientComponentClient()

  useEffect(() => {
    // 監聽 Supabase Auth 狀態，等待 PASSWORD_RECOVERY 事件
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true)
      } else if (event === 'SIGNED_IN' && session) {
        // 如果已登入（從 recovery link 過來），也允許重設
        setSessionReady(true)
      }
    })

    // 同時檢查現有 session（有時 event 已經觸發過）
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSessionReady(true)
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('密碼至少需要 6 個字元')
      return
    }

    if (password !== confirmPassword) {
      setError('兩次輸入的密碼不一致')
      return
    }

    setIsLoading(true)

    try {
      const { error } = await supabase.auth.updateUser({ password })

      if (error) {
        setError('更新密碼失敗：' + error.message)
      } else {
        setSuccess(true)
        // 3 秒後跳去登入頁
        setTimeout(() => {
          router.push('/login')
        }, 3000)
      }
    } catch (err) {
      setError('發生錯誤，請重試')
    } finally {
      setIsLoading(false)
    }
  }

  // 奶茶主題顏色
  const milkTeaBrown = '#C4A482'
  const milkTeaDark = '#9A7350'
  const milkTeaLight = '#F5EFE8'
  const milkTeaBg = '#EFE9E1'
  const textDark = '#5C4A43'
  const textMid = '#8B7B74'

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 pb-20"
      style={{ background: milkTeaBg }}
    >
      <div className="w-full max-w-sm">
        {/* 企鵝 Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="text-5xl mb-3">🐧</div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: textDark }}>
            重設密碼
          </h1>
          <p className="text-sm mt-1" style={{ color: textMid }}>
            請輸入你的新密碼
          </p>
        </div>

        {/* 卡片 */}
        <div
          className="rounded-3xl p-6 shadow-lg"
          style={{ background: 'rgba(255,253,249,0.92)', border: '1.5px solid rgba(196,164,130,0.2)' }}
        >
          {success ? (
            // 成功畫面
            <div className="text-center py-4">
              <div className="text-4xl mb-4">✅</div>
              <p className="font-semibold text-base mb-2" style={{ color: textDark }}>
                密碼已成功更新！
              </p>
              <p className="text-sm" style={{ color: textMid }}>
                3 秒後自動跳去登入頁面…
              </p>
            </div>
          ) : !sessionReady ? (
            // 等待 session 準備好
            <div className="text-center py-8">
              <div className="text-4xl mb-4 animate-bounce">🐧</div>
              <p className="text-sm" style={{ color: textMid }}>
                正在驗證重設連結…
              </p>
              <p className="text-xs mt-2" style={{ color: textMid }}>
                如果等待超過 10 秒，請重新申請重設密碼
              </p>
            </div>
          ) : (
            // 重設密碼表單
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div
                  className="text-sm px-4 py-3 rounded-xl text-center"
                  style={{ background: 'rgba(220,53,69,0.1)', color: '#dc3545' }}
                >
                  {error}
                </div>
              )}

              {/* 新密碼 */}
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
                  className="w-full px-4 py-3 rounded-2xl text-sm outline-none transition-all"
                  style={{
                    background: milkTeaLight,
                    border: '1.5px solid transparent',
                    color: textDark,
                  }}
                  onFocus={(e) => (e.target.style.border = `1.5px solid ${milkTeaBrown}`)}
                  onBlur={(e) => (e.target.style.border = '1.5px solid transparent')}
                />
              </div>

              {/* 確認密碼 */}
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
                  className="w-full px-4 py-3 rounded-2xl text-sm outline-none transition-all"
                  style={{
                    background: milkTeaLight,
                    border: '1.5px solid transparent',
                    color: textDark,
                  }}
                  onFocus={(e) => (e.target.style.border = `1.5px solid ${milkTeaBrown}`)}
                  onBlur={(e) => (e.target.style.border = '1.5px solid transparent')}
                />
              </div>

              {/* 提交按鈕 */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 rounded-2xl text-sm font-semibold tracking-wide transition-all active:scale-95 mt-2"
                style={{
                  background: isLoading
                    ? milkTeaBrown
                    : `linear-gradient(135deg, ${milkTeaBrown}, ${milkTeaDark})`,
                  color: '#FFFDF9',
                  boxShadow: `0 4px 16px rgba(196,164,130,0.35)`,
                  opacity: isLoading ? 0.7 : 1,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {isLoading ? '更新中…' : '🐧 確認更新密碼'}
              </button>
            </form>
          )}
        </div>

        <p className="text-xs text-center mt-6" style={{ color: 'rgba(196,181,173,1)' }}>
          🐧 記帳本 · 您的資料安全加密儲存
        </p>
      </div>
    </div>
  )
}
