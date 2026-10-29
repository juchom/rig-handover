import type { Night } from './types.js';

export type NightCounts = { night: string; ok: number; retry: number; fail: number };

// Jobs per final status for one night.
export function nightCounts(n: Night): NightCounts {
  const c: NightCounts = { night: n.night, ok: 0, retry: 0, fail: 0 };
  for (const r of n.rows) c[r.lastStatus]++;
  return c;
}
