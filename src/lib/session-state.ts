'use client';
// UI choices remembered for the browsing session (district filter, chart range, …).
// Backed by sessionStorage: survives page changes and reloads, cleared when the tab/app is closed.
// Components using the same key stay in sync. Storage failures (private mode etc.) just mean no memory.
import { useCallback, useEffect, useState } from 'react';

const PREFIX = 'fb.s.';
const listeners = new Map<string, Set<(v: unknown) => void>>();

function read<T>(key: string): T | undefined {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown) {
  try { sessionStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* ignore */ }
  for (const fn of listeners.get(key) ?? []) fn(value);
}

/** Like useState, but remembered for the session under `key`. First render uses `initial` (static pages). */
export function useSessionState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    const stored = read<T>(key);
    setValue(stored === undefined ? initial : stored);
    const fn = (v: unknown) => setValue(v as T);
    const set = listeners.get(key) ?? new Set();
    set.add(fn);
    listeners.set(key, set);
    return () => { set.delete(fn); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback((next: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      queueMicrotask(() => write(key, v)); // notify after this render
      return v;
    });
  }, [key]);

  return [value, update] as const;
}
