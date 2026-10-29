import { describe, expect, it } from 'vitest';
import { digest, readNight } from '../src/digest/read.js';

describe('readNight', () => {
  it('reads 2026-10-28: 5 jobs, 1 bad line', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night).not.toBeNull();
    expect(night!.badLines).toBe(1);
    expect(night!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    const refresh = night!.rows.find((r) => r.job === 'fixtures/refresh')!;
    expect(refresh).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503', owner: 'rook' });
    expect(refresh.firstAt).toBe('2026-10-29T01:30:00+01:00');
    expect(refresh.lastAt).toBe('2026-10-29T01:37:00+01:00');
    expect(night!.rows.find((r) => r.job === 'notes/backup')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
    expect(night!.rows.find((r) => r.job === 'digest/render')!.owner).toBeNull();
    expect(night!.rows.find((r) => r.job === 'lane/sync')).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok' });
  });

  it('returns null for a night with no file', () => {
    expect(readNight('runs', '2026-01-01')).toBeNull();
    expect(readNight('runs', '../etc')).toBeNull();
  });

  it('gives no rows for an empty file', () => {
    expect(digest('2026-10-30', '')).toEqual({ night: '2026-10-30', rows: [], badLines: 0 });
  });

  it('counts lines with a bad shape as bad', () => {
    const n = digest('x', '{"at":"a","job":"j","status":"weird","owner":null}\n[1]\nnot json\n');
    expect(n).toEqual({ night: 'x', rows: [], badLines: 3 });
  });
});
