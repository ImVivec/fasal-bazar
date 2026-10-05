'use client';
// Top bar (brand only; navigation lives in the bottom menu). Also exports the UI-cookie reader.
import Link from 'next/link';

export function readUiCookie(): { u?: string; r?: string; d?: string } {
  try {
    const raw = document.cookie.split('; ').find((c) => c.startsWith('fb_ui='))?.slice(6);
    return raw ? JSON.parse(decodeURIComponent(raw)) : {};
  } catch {
    return {};
  }
}

export function Header({ appName, appNameHi }: { appName: string; appNameHi: string }) {
  return (
    <header className="top">
      <Link href="/" className="brand">{appName} <span lang="hi">{appNameHi}</span></Link>
    </header>
  );
}
