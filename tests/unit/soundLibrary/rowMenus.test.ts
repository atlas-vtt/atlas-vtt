import { describe, expect, it, vi } from 'vitest';
import { rowMenu } from '../../../src/app/react/components/dm-screen/sound/library/rowMenus';
import type { LibraryRow } from '../../../src/app/react/components/dm-screen/sound/library/rowModel';
import type { LibraryActions } from '../../../src/app/react/components/dm-screen/sound/library/useLibraryActions';
import type { StoredSound } from '../../../src/app/soundLibrary/soundRecords';
import { tagRowMenu } from '../../../src/app/react/components/dm-screen/sound/library/tagMenus';

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

describe('sharing music in the Armarium from the library', () => {
  const rowOf = (path: string, kind: 'music' | 'ambience' = 'music'): LibraryRow => ({ type: 'file', id: path, name: path, where: '', tagKeys: [], order: path, file: { kind, path, name: path, size: 1, mtime: 1 } }) as LibraryRow;
  const menuFor = (rows: LibraryRow[], share = vi.fn()): ReturnType<typeof rowMenu> => rowMenu(rows[0]!, {
    actions: { edit: vi.fn(), share, tracksWithTag: () => 0 } as unknown as LibraryActions,
    rows,
    entries: [],
    sound: null,
    rootTags: [],
    moveTo: null,
    beginRename: () => undefined,
  });
  const item = (entries: ReturnType<typeof rowMenu>, label: string): { onClick: () => void; disabled?: boolean } | undefined =>
    entries.find((entry): entry is Extract<typeof entry, { type: 'item' }> => entry.type === 'item' && entry.label === label);

  it('offers one track as a track and a selection of several as an album', () => {
    const share = vi.fn();
    item(menuFor([rowOf('a.opus')], share), 'Share in the Armarium…')!.onClick();
    expect(share).toHaveBeenLastCalledWith([expect.objectContaining({ path: 'a.opus' })]);
    item(menuFor([rowOf('a.opus'), rowOf('b.opus')], share), 'Share as an album…')!.onClick();
    expect(share).toHaveBeenLastCalledWith([expect.objectContaining({ path: 'a.opus' }), expect.objectContaining({ path: 'b.opus' })]);
  });

  it('offers nothing for ambience, nor for a selection that holds any', () => {
    expect(item(menuFor([rowOf('rain.ogg', 'ambience')]), 'Share in the Armarium…')).toBeUndefined();
    expect(item(menuFor([rowOf('a.opus'), rowOf('rain.ogg', 'ambience')]), 'Share as an album…')).toBeUndefined();
  });

  it('shares a music tag of two tracks or more as an album, and no ambience tag', () => {
    const shareTag = vi.fn();
    const actions = { tracksWithTag: () => 0, shareTag } as unknown as LibraryActions;
    const labels = (entries: ReturnType<typeof tagRowMenu>): string[] => entries.flatMap((entry) => ('label' in entry ? [entry.label] : []));
    expect(labels(tagRowMenu(actions, 'Rain', 'ambience', 5))).toEqual(['Rename', 'Remove']);
    expect(item(tagRowMenu(actions, 'Tavern', 'music', 1), 'Share as an album…')?.disabled).toBe(true);
    item(tagRowMenu(actions, 'Tavern', 'music', 3), 'Share as an album…')!.onClick();
    expect(shareTag).toHaveBeenCalledWith('Tavern');
  });
});
