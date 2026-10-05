// Root layout for the logged-in app. Static per language; user-specific bits are client-side.
import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { dict } from '@/lib/strings';
import { LANGS, type Lang } from '@/lib/session';
import { Header } from '@/components/Header';
import { ActivityPing } from '@/components/ActivityPing';
import { BottomNav } from '@/components/BottomNav';
import '../globals.css';

export const dynamicParams = false;
export const generateStaticParams = () => LANGS.map((lang) => ({ lang }));

export const metadata: Metadata = { title: 'Fasal Bazar · फसल बाज़ार', description: 'Mandi prices near you' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#2f6b2f' };

export default async function AppLayout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!LANGS.includes(lang as Lang)) notFound();
  const t = dict(lang as Lang);
  return (
    <html lang={lang}>
      <body>
        <Header appName={t.appName} appNameHi={t.appNameHi} />
        <main className="with-tabs">{children}</main>
        <BottomNav t={{ crops: t.crops, analysis: t.analysis, settings: t.settings, admin: t.admin }} />
        <ActivityPing />
      </body>
    </html>
  );
}
