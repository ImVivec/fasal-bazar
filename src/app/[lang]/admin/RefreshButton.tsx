'use client';
import { useState } from 'react';

export function RefreshButton({ label, busyLabel }: { label: string; busyLabel: string }) {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState('');
  async function run() {
    setBusy(true);
    setOut(busyLabel);
    try {
      const res = await fetch('/api/ingest', { method: 'POST' }); // admin session cookie authorizes
      setOut(`${res.status}\n${JSON.stringify(await res.json().catch(() => null), null, 2)}`);
    } catch (e) {
      setOut(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" onClick={run} disabled={busy}>{label}</button>
      {out && <pre>{out}</pre>}
    </>
  );
}
