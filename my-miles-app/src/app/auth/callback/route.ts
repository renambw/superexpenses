import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const type = requestUrl.searchParams.get('type')

  if (code) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    await supabase.auth.exchangeCodeForSession(code)
  }

  // 如果係 reset password 類型，跳去重設密碼頁面
  if (type === 'recovery') {
    return NextResponse.redirect(new URL('/reset-password', requestUrl.origin))
  }

  // 其他情況跳去主頁
  return NextResponse.redirect(new URL('/', requestUrl.origin))
}
