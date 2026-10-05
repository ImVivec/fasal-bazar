'use client';
// Once per day per device: tell the server we're here (usage tracking) and re-check that the
// account is still approved. A blocked/rejected user is logged out within a day.
import { useEffect } from 'react';

const KEY = 'fb.ping';

export function ActivityPing() {
  useEffect(() => {
    const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
    try { if (localStorage.getItem(KEY) === today) return; } catch { /* storage blocked: ping anyway */ }
    fetch('/api/me', { method: 'POST' })
      .then((r) => {
        if (r.status === 401 || r.status === 403) window.location.href = '/login';
        else if (r.ok) try { localStorage.setItem(KEY, today); } catch { /* ignore */ }
      })
      .catch(() => { /* offline: try again next load */ });
  }, []);
  return null;
}
