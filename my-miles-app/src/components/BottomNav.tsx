'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

const NAV_ITEMS = [
  {
    href: '/',
    label: '記帳',
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke={active ? '#9A7350' : '#CDB99F'}
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    ),
  },
  {
    href: '/dashboard',
    label: '總覽',
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke={active ? '#9A7350' : '#CDB99F'}
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    href: '/history',
    label: '紀錄',
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke={active ? '#9A7350' : '#CDB99F'}
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="13" y2="17" />
      </svg>
    ),
  },
  {
    href: '/admin',
    label: '管理',
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke={active ? '#9A7350' : '#CDB99F'}
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.replace('/login');
  };

  return (
    <>
      {/* ログアウト確認モーダル */}
      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center pb-4 px-4"
          style={{ background: 'rgba(92,74,67,0.3)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowLogoutConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl p-6 shadow-xl"
            style={{ background: '#FFFDF9' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-4">
              <div className="text-3xl mb-2">🐧</div>
              <h3 className="font-semibold text-base" style={{ color: '#5C4A43' }}>確認登出</h3>
              <p className="text-sm mt-1" style={{ color: '#A8948A' }}>您確定要登出記帳本嗎？</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-3 rounded-2xl text-sm font-medium transition-all active:scale-95"
                style={{ background: '#EFE9E1', color: '#9A7350' }}
              >
                取消
              </button>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold transition-all active:scale-95"
                style={{ background: '#C47A7A', color: '#FFFDF9' }}
              >
                {loggingOut ? '登出中...' : '確認登出'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ナビゲーションバー */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50"
        style={{
          background: 'rgba(255, 253, 249, 0.92)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderTop: '1px solid #E0D4C6',
        }}
      >
        <div className="max-w-md mx-auto flex">
          {NAV_ITEMS.map(({ href, label, icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className="flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-all active:scale-95"
              >
                <div
                  className="w-10 h-7 flex items-center justify-center rounded-full transition-all"
                  style={{ background: active ? '#EFE9E1' : 'transparent' }}
                >
                  {icon(active)}
                </div>
                <span
                  className="text-[10px] tracking-wide font-medium transition-colors"
                  style={{ color: active ? '#9A7350' : '#CDB99F' }}
                >
                  {label}
                </span>
              </Link>
            );
          })}

          {/* ログアウトボタン */}
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-all active:scale-95"
          >
            <div className="w-10 h-7 flex items-center justify-center rounded-full">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke="#CDB99F"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </div>
            <span className="text-[10px] tracking-wide font-medium" style={{ color: '#CDB99F' }}>
              登出
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
