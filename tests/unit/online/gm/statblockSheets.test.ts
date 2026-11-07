import { describe, expect, it } from 'vitest';
import { StatblockSheets, WRITTEN_MS } from '../../../../src/app/online/gm/book/statblockSheets.ts';
import type { ResolvedStatblock } from '../../../../src/app/statblocks/model/resolvedTypes';
import { templateOf } from './statblockNotes.ts';

const TEMPLATE = templateOf([{ key: 'name', label: 'Name', type: 'text' }, { key: 'speed', label: 'Speed', type: 'text' }], [{ id: 'speed001', type: 'stat', field: 'speed', look: 'run-in' }]);
const PATH = 'Characters/Ana.md';
const SPEED = { key: 'speed' };

const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function sheets(): { sheets: StatblockSheets; note: { speed: string }; clock: { now: number }; reads: () => number } {
  const note = { speed: '30 ft.' };
  const clock = { now: 0 };
  let reads = 0;
  const resolved = (): ResolvedStatblock => ({ path: PATH, source: { kind: 'atlas', templateId: TEMPLATE.id }, fields: { name: 'Ana', ...note }, template: TEMPLATE, templateStatus: 'ok', lookName: null, meanings: {} });
  const held = new StatblockSheets({ read: () => (reads++, Promise.resolve(resolved())), now: () => clock.now, changed: () => undefined });
  return { sheets: held, note, clock, reads: () => reads };
}

describe('the statblocks of the characters\' notes', () => {
  it('reads a note once, and again only once it may read otherwise', async () => {
    const { sheets: held, reads } = sheets();
    expect(held.drawn(PATH, [], undefined)).toBeUndefined();
    await settled();
    // Read now; drawn once it is asked for again.
    expect(held.drawn(PATH, [], undefined)).toBeUndefined();
    await settled();
    const drawn = held.drawn(PATH, [], undefined);
    expect(drawn?.statblock?.displayName).toBe('Ana');
    expect(held.drawn(PATH, [], undefined)).toBe(drawn);
    for (let poll = 0; poll < 5; poll += 1) held.drawn(PATH, [], undefined);
    expect(reads()).toBe(1);
    held.forget(PATH);
    held.drawn(PATH, [], undefined);
    expect(reads()).toBe(2);
  });

  it('checks against what was written until the note reads it back, its write is refused, or it has counted long enough', async () => {
    const { sheets: held, note, clock } = sheets();
    held.drawn(PATH, [], undefined);
    await settled();
    const written = [{ key: 'speed', cleared: [], value: '40 ft.' }];
    held.hold(PATH, written);
    expect(held.read(PATH, SPEED)?.value).toBe('40 ft.');
    held.drop(PATH);
    expect(held.read(PATH, SPEED)?.value).toBe('30 ft.');

    held.hold(PATH, written);
    held.settle(PATH, written);
    expect(held.resolved(PATH)?.fields.speed).toBe('40 ft.');
    clock.now = WRITTEN_MS - 1;
    expect(held.read(PATH, SPEED)?.value).toBe('40 ft.');
    clock.now = WRITTEN_MS;
    expect(held.read(PATH, SPEED)?.value).toBe('30 ft.');

    // Read back: the note holds it now, and someone's later change of it counts at once.
    clock.now = 0;
    held.hold(PATH, written);
    held.settle(PATH, written);
    note.speed = '40 ft.';
    held.forget(PATH);
    held.drawn(PATH, [], undefined);
    await settled();
    note.speed = '45 ft.';
    held.forget(PATH);
    held.drawn(PATH, [], undefined);
    await settled();
    expect(held.read(PATH, SPEED)?.value).toBe('45 ft.');
  });
  it('checks no edit against a note changed from outside until it is read again, but takes its own write coming back as no such change', async () => {
    const { sheets: held } = sheets();
    expect(held.checkable(PATH)).toBe(false);
    held.drawn(PATH, [], undefined);
    await settled();
    expect(held.checkable(PATH)).toBe(true);
    held.forget(PATH);
    expect(held.checkable(PATH)).toBe(false);
    held.drawn(PATH, [], undefined);
    expect(held.checkable(PATH)).toBe(false);
    await settled();
    expect(held.checkable(PATH)).toBe(true);

    held.hold(PATH, [{ key: 'speed', cleared: [], value: '40 ft.' }]);
    held.forget(PATH);
    expect(held.checkable(PATH)).toBe(true);
    held.forget(null);
    expect(held.checkable(PATH)).toBe(false);
  });
});
