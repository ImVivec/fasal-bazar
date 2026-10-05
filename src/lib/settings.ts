'use client';
// Per-browser settings in localStorage (favourite crops). No login needed to read them.
export type Settings = { district?: string; crops?: string[] };
const KEY = 'fb.settings.v1';

/** "My crops" for anyone who hasn't picked their own yet (the region's main crops). */
export const DEFAULT_CROPS = ['soyabean', 'wheat', 'mustard', 'garlic', 'coriander-seed'];

export function loadSettings(): Settings {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') ?? {}; } catch { return {}; }
}
export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode etc. */ }
}

/** The farmer's crops: their own choice if they ever saved one (even an empty list), else the defaults. */
export function favouriteCrops(): string[] {
  return loadSettings().crops ?? DEFAULT_CROPS;
}
