import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '製程標準播放系統',
  description: '製程中控、版本確認與產線播放平台',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
