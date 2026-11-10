import { describe, expect, it } from 'vitest';
import type { ChatEntry, RollEntry, SecretEntry } from '../../../../src/app/online/protocol/index.ts';
import type { ShownEntry } from '../../../../src/app/online/tableLog/LogState.ts';
import { repliesLabel, threadOf, threadRoot, threadRoots, threadStats } from '../../../../src/app/online/tableLog/logThreads.ts';

const KARA = 'kkkkkkkkkkkkkkkkkkkk';
const MIRA = 'mmmmmmmmmmmmmmmmmmmm';
const BEN = 'bbbbbbbbbbbbbbbbbbbb';
const NAMES: Readonly<Record<string, string>> = { [KARA]: 'Kara', [MIRA]: 'Mira', [BEN]: 'Ben', gm: 'GM' };
const id = (n: number): string => n.toString(16).padStart(24, '0');
const chat = (n: number, who: string, answers?: number, extra: Partial<ChatEntry> = {}): ChatEntry => ({
  id: id(n), at: n, who, name: NAMES[who] ?? 'Someone', kind: 'chat', text: `message ${n}`,
  ...(answers !== undefined && { reply: { id: id(answers), who: KARA, name: 'Kara', preview: 'quoted' } }),
  ...extra,
});
const roll = (n: number, who: string): RollEntry => ({
  id: id(n), at: n, who, name: NAMES[who] ?? 'Someone', kind: 'roll', token: null,
  roll: { id: `r${n}`, timestamp: n, formula: '1d20', rolls: [{ die: 'd20', value: 12, max: 20 }], modifiers: 0, total: 12 },
});
const ids = (entries: readonly ShownEntry[]): string[] => entries.map((entry) => entry.id);

describe('threads of the log', () => {
  // 1 ← 2 ← 4, 1 ← 5; 3 stands alone; 6 answers a roll (7 answers 6).
  const log: ShownEntry[] = [chat(1, KARA), chat(2, MIRA, 1), chat(3, BEN), chat(4, KARA, 2), chat(5, 'gm', 1), roll(10, BEN), chat(11, MIRA, 10), chat(12, BEN, 11)];

  it('root every answer at its topmost ancestor the viewer holds', () => {
    const roots = threadRoots(log);
    expect([1, 2, 4, 5].map((n) => roots.get(id(n)))).toEqual([id(1), id(1), id(1), id(1)]);
    expect([roots.get(id(3)), roots.get(id(10)), roots.get(id(11)), roots.get(id(12))]).toEqual([id(3), id(10), id(10), id(10)]);
    expect(threadRoot(log, id(4))).toBe(id(1));
    expect(threadRoot(log, id(99))).toBeNull();
  });

  it('give a thread in the log\'s order, its root first, from any of its entries', () => {
    expect(ids(threadOf(log, id(4)))).toEqual([id(1), id(2), id(4), id(5)]);
    expect(ids(threadOf(log, id(1)))).toEqual(ids(threadOf(log, id(5))));
    expect(ids(threadOf(log, id(3)))).toEqual([id(3)]);
    expect(threadOf(log, id(99))).toEqual([]);
  });

  it('count the answers of every thread that has some, with the first three who gave them', () => {
    const many: ShownEntry[] = [chat(1, KARA), chat(2, MIRA, 1), chat(3, MIRA, 2), chat(4, 'gm', 1), chat(5, BEN, 3), chat(6, KARA, 1), chat(7, BEN)];
    const stats = threadStats(many);
    expect([...stats.keys()]).toEqual([id(1)]);
    expect(stats.get(id(1))).toEqual({ count: 5, repliers: [{ who: MIRA, name: 'Mira' }, { who: 'gm', name: 'GM' }, { who: BEN, name: 'Ben' }] });
    expect(threadStats(log).get(id(10))?.count).toBe(2);
  });

  it('make an answer to something the viewer does not hold a thread of its own, so nothing it answers shows', () => {
    // 21 answers a whisper the viewer was not sent; 22 a message since deleted; 24 a private roll the viewer holds as a line.
    const secret: SecretEntry = { id: id(23), at: 23, who: KARA, name: 'Kara', kind: 'secret', mode: 'gm' };
    const deleted = chat(22, MIRA, 1, { reply: { id: id(1), who: KARA, name: 'Kara', preview: '', gone: true } });
    const seen: ShownEntry[] = [chat(21, MIRA, 20), deleted, secret, chat(24, 'gm', 23), chat(25, BEN, 21)];
    const roots = threadRoots(seen);
    expect([roots.get(id(21)), roots.get(id(22)), roots.get(id(23)), roots.get(id(24)), roots.get(id(25))]).toEqual([id(21), id(22), undefined, id(24), id(21)]);
    expect([...threadStats(seen)]).toEqual([[id(21), { count: 1, repliers: [{ who: BEN, name: 'Ben' }] }]]);
  });

  it('end a chain that comes back to itself instead of following it forever', () => {
    const loop: ShownEntry[] = [chat(1, KARA, 2), chat(2, MIRA, 1)];
    const roots = threadRoots(loop);
    expect(roots.get(id(1))).toBe(roots.get(id(2)));
    expect(threadOf(loop, id(1))).toHaveLength(2);
  });

  it('say how many replies there are', () => {
    expect([repliesLabel(1), repliesLabel(3)]).toEqual(['1 reply', '3 replies']);
  });
});
