import { describe, expect, it, vi } from 'vitest';
import { rowMenu } from '../../../src/app/react/components/dm-screen/sound/library/rowMenus';
import type { LibraryRow } from '../../../src/app/react/components/dm-screen/sound/library/rowModel';
import type { LibraryActions } from '../../../src/app/react/components/dm-screen/sound/library/useLibraryActions';
import type { StoredSound } from '../../../src/app/soundLibrary/soundRecords';

const file = { kind: 'music' as const, path: 'a.ogg', name: 'a.ogg', size: 1, mtime: 1 };
const row = { type: 'file', id: 'a', name: 'a', kind: 'music', file } as unknown as LibraryRow;

function labelsOf(sound: StoredSound): string[] {
  const entries = rowMenu(row, {
    actions: { edit: vi.fn() } as unknown as LibraryActions,
    rows: [row],
    entries: [],
    sound,
    rootTags: [],
    moveTo: null,
    beginRename: () => undefined,
  });
  return entries.flatMap((entry) => ('label' in entry ? [entry.label] : []));
}

describe('a sound\'s menu', () => {
  it('asks nothing about rights to the file: those are the GM\'s to know', () => {
    // A record an earlier build wrote may still hold a credit; the menu offers none of it.
    const labels = labelsOf({ name: 'a', credit: 'Someone', licence: 'cc-by' } as unknown as StoredSound);
    expect(labels).toContain('Loudness');
    expect(labels.filter((label) => /licen|credit/i.test(label))).toEqual([]);
  });
});

describe('a missing track\'s menu', () => {
  const sound = { id: 's1', name: 'Misty Road', kind: 'music', audioPath: 'x', tags: [], createdAt: 1, modifiedAt: 1 } as unknown as StoredSound;
  const waiting = { type: 'waiting', id: 's1', name: 'Misty Road', where: '', tagKeys: [], sound } as LibraryRow;
  const menuOf = (mayRelink: boolean, relink = vi.fn()): ReturnType<typeof rowMenu> => rowMenu(waiting, {
    actions: { relink, mayRelink: () => mayRelink, forget: vi.fn() } as unknown as LibraryActions,
    rows: [waiting],
    entries: [],
    sound,
    rootTags: [],
    moveTo: null,
    beginRename: () => undefined,
  });

  it('offers Relink first and Forget last, and Relink picks the file for that record', () => {
    const relink = vi.fn();
    const entries = menuOf(true, relink);
    expect(entries.flatMap((entry) => ('label' in entry ? [entry.label] : []))).toEqual(['Relink', 'Forget']);
    const first = entries[0];
    if (first?.type === 'item') first.onClick?.();
    expect(relink).toHaveBeenCalledWith(sound);
  });

  it('shows Relink disabled where the root cannot be read here', () => {
    const first = menuOf(false)[0];
    expect(first?.type === 'item' && first.disabled).toBe(true);
  });
});
