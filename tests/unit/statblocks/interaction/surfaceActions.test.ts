import { describe, expect, it } from 'vitest';
import { fitsMenuLimit, rowCount, SEPARATOR, tidy, toMenuEntries, type SurfaceAction } from '../../../../src/app/statblocks/editor/interaction/surfaceActions';

const item = (id: string, extra: Partial<Extract<SurfaceAction, { kind: 'item' }>> = {}): SurfaceAction => ({ kind: 'item', id, label: id, run: () => undefined, ...extra });

describe('menu descriptors (spec §5.1)', () => {
  it('drops separators at the ends and twice in a row, and empty submenus', () => {
    const tidied = tidy([SEPARATOR, item('a'), SEPARATOR, SEPARATOR, { kind: 'submenu', id: 'empty', label: 'Empty', children: [] }, item('b'), SEPARATOR]);
    expect(tidied.map((action) => action.kind === 'separator' ? '—' : action.id)).toEqual(['a', '—', 'b']);
  });

  it('counts rows without separators, and checks every menu of a tree against twelve', () => {
    expect(rowCount([item('a'), SEPARATOR, item('b')])).toBe(2);
    const many = Array.from({ length: 13 }, (_, index) => item(String(index)));
    expect(fitsMenuLimit(many)).toBe(false);
    expect(fitsMenuLimit([{ kind: 'submenu', id: 's', label: 'S', children: many }])).toBe(false);
    expect(fitsMenuLimit(many.slice(1))).toBe(true);
  });

  it('draws as Atlas menu entries: keys as hints, destructive rows marked, separators as rules', () => {
    const entries = toMenuEntries([item('delete', { hint: 'Del', destructive: true }), SEPARATOR, item('copy')]);
    expect(entries[0]).toMatchObject({ type: 'item', label: 'delete', detail: 'Del', destructive: true });
    expect(entries[1]?.type).toBe('custom');
    expect(entries[2]).toMatchObject({ type: 'item', label: 'copy' });
  });

  it('gives every row an icon slot once one row has an icon or a submenu, so every label starts on one edge', () => {
    const plain = toMenuEntries([item('a'), item('b')]);
    expect(plain.every((entry) => entry.type === 'item' && entry.leading === undefined)).toBe(true);
    const mixed = toMenuEntries([item('settings'), item('delete', { icon: 'trash-2' }), { kind: 'submenu', id: 'names', label: 'Names', children: [item('x')] }]);
    const leading = mixed.flatMap((entry) => (entry.type === 'item' ? [entry.leading] : []));
    expect(leading).toHaveLength(2);
    expect(leading.every((node) => node !== undefined)).toBe(true);
  });
});
