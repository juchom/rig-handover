import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

let runsDir = '';

const l = (o: object) => JSON.stringify(o);
const normal =
  [
    l({ at: '2026-10-20T23:00:02+01:00', job: 'lane/sync', status: 'ok', owner: 'rook' }),
    l({ at: '2026-10-20T23:00:03+01:00', job: 'rig/backup', status: 'retry', owner: null, error: 'timeout' }),
    l({ at: '2026-10-20T23:05:03+01:00', job: 'rig/backup', status: 'fail', owner: null, error: 'timeout' }),
    l({ at: '2026-10-20T23:10:00+01:00', job: 'a/first', status: 'ok', owner: 'lane-07' }),
  ].join('\n') + '\n';

beforeAll(() => {
  runsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-digest-'));
  fs.writeFileSync(path.join(runsDir, '2026-10-20.jsonl'), normal);
  fs.writeFileSync(path.join(runsDir, '2026-10-21.jsonl'), '');
  fs.writeFileSync(
    path.join(runsDir, '2026-10-22.jsonl'),
    l({ at: '2026-10-22T23:00:02+01:00', job: 'lane/sync', status: 'ok', owner: 'rook' }) +
      '\nnot json at all\n' +
      l({ at: '2026-10-22T23:01:02+01:00', job: 'a/first', status: 'ok', owner: 'lane-07' }) +
      '\n',
  );
});

afterAll(() => {
  fs.rmSync(runsDir, { recursive: true, force: true });
});

const app = () =>
  createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });

type Body = { night: string; rows: { job: string }[]; badLines: number };

describe('GET /digest/:night', () => {
  it('renders a table for a normal night, sorted, with — and warn rows', async () => {
    const res = await app().request('/digest/2026-10-20');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<table');
    expect(html).toContain('—');
    expect(html).toContain('warn');
    expect(html).not.toContain('could not be read');
    expect(html.indexOf('a/first')).toBeLessThan(html.indexOf('lane/sync'));
    expect(html.indexOf('lane/sync')).toBeLessThan(html.indexOf('rig/backup'));
  });

  it('404 with a message when there is no file', async () => {
    const res = await app().request('/digest/2026-10-19');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('no run log for 2026-10-19');
  });

  it('empty night says nothing ran', async () => {
    const res = await app().request('/digest/2026-10-21');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('bad line is reported and good rows remain', async () => {
    const res = await app().request('/digest/2026-10-22');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('could not be read');
    expect(html).toContain('lane/sync');
    expect(html).toContain('a/first');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns night, rows and badLines for a normal night', async () => {
    const res = await app().request('/api/digest/2026-10-20');
    const body = (await res.json()) as Body;
    expect(res.status).toBe(200);
    expect(body.night).toBe('2026-10-20');
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(['a/first', 'lane/sync', 'rig/backup']);
    expect(body.rows[2]).toEqual({
      job: 'rig/backup',
      owner: null,
      runs: 2,
      retries: 1,
      lastStatus: 'fail',
      lastError: 'timeout',
      firstAt: '2026-10-20T23:00:03+01:00',
      lastAt: '2026-10-20T23:05:03+01:00',
    });
  });

  it('404 with an error body when there is no file', async () => {
    const res = await app().request('/api/digest/2026-10-19');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log', night: '2026-10-19' });
  });

  it('empty night gives no rows', async () => {
    const res = await app().request('/api/digest/2026-10-21');
    const body = (await res.json()) as Body;
    expect(res.status).toBe(200);
    expect(body.rows).toEqual([]);
  });

  it('counts the bad line and keeps the good rows', async () => {
    const res = await app().request('/api/digest/2026-10-22');
    const body = (await res.json()) as Body;
    expect(res.status).toBe(200);
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['a/first', 'lane/sync']);
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order', async () => {
    const html = await (await app().request('/digest/2026-10-20')).text();
    const body = (await (await app().request('/api/digest/2026-10-20')).json()) as Body;
    const positions = body.rows.map((r) => html.indexOf(r.job));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
