import type { Metadata, Viewport } from 'next';
import './globals.css';
import BottomNav from '@/components/BottomNav';

export const metadata: Metadata = {
  title: '🐧記帳本🐧',
  description: '極簡奶茶風記帳與 Asia Miles 里數最佳化',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '🐧記帳本🐧',
  },
};

export const viewport: Viewport = {
  themeColor: '#EFE9E1',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-HK">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <body>
        <main className="pb-20">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
