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
    expect(labels).toContain('Trim');
    expect(labels.filter((label) => /licen|credit/i.test(label))).toEqual([]);
  });
});
