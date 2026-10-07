import { afterEach, describe, expect, it, vi } from 'vitest';
import { MENU_LABEL_MAX, menuEntriesOf } from '../../src/app/extensions/menuEntries';
import type { MenuItem } from '../../src/api/types/ui';

afterEach(() => { vi.restoreAllMocks(); });

describe("an extension's menu items", () => {
  it('reads each field once, so a getter cannot answer differently later', () => {
    let reads = 0;
    const item = { get label(): string { reads += 1; return reads === 1 ? 'Share' : (5 as never); }, onClick: vi.fn() };
    const [entry] = menuEntriesOf('ext', [item]);
    expect(entry).toMatchObject({ type: 'item', label: 'Share' });
    expect(reads).toBe(1);
  });

  it('leaves out an item whose reads throw, logs it, and keeps the others', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = { get label(): string { throw new Error('boom'); } };
    const entries = menuEntriesOf('ext', [broken as unknown as MenuItem, { label: 'Kept', onClick: vi.fn() }]);
    expect(entries.map((entry) => (entry as { label: string }).label)).toEqual(['Kept']);
    expect(console.error).toHaveBeenCalled();
  });

  it('cuts a label longer than the menu shows, and leaves out a submenu that is no list', () => {
    const long = 'x'.repeat(MENU_LABEL_MAX + 10);
    const entries = menuEntriesOf('ext', [{ label: long, onClick: vi.fn() }, { label: 'Odd', submenu: 5 as never }]);
    expect(entries).toHaveLength(1);
    const label = (entries[0] as { label: string }).label;
    expect([...label]).toHaveLength(MENU_LABEL_MAX);
    expect(label.endsWith('…')).toBe(true);
  });

  it("runs the click on the extension's item, guarded", () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const item = { label: 'Go', onClick(this: unknown): void { calls.push(this); throw new Error('boom'); } };
    const calls: unknown[] = [];
    const [entry] = menuEntriesOf('ext', [item]);
    expect(() => (entry as { onClick: () => void }).onClick()).not.toThrow();
    expect(calls).toEqual([item]);
  });
});
