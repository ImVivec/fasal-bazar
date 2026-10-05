// Root layout for the public login/signup screens.
import type { Metadata, Viewport } from 'next';
import '../globals.css';

export const metadata: Metadata = { title: 'Fasal Bazar · फसल बाज़ार', description: 'Mandi prices near you' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#2f6b2f' };

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hi">
      <body>
        <header className="top"><span className="brand" lang="hi">फसल बाज़ार <span lang="en">Fasal Bazar</span></span></header>
        <main className="narrow">{children}</main>
      </body>
    </html>
  );
}
