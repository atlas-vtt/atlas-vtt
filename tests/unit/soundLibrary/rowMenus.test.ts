import { describe, expect, it, vi } from 'vitest';
import { rowMenu } from '../../../src/app/react/components/dm-screen/sound/library/rowMenus';
import type { LibraryRow } from '../../../src/app/react/components/dm-screen/sound/library/rowModel';
import type { LibraryActions } from '../../../src/app/react/components/dm-screen/sound/library/useLibraryActions';
import type { StoredSound } from '../../../src/app/soundLibrary/soundRecords';

const file = { kind: 'music' as const, path: 'a.ogg', name: 'a.ogg', size: 1, mtime: 1 };
const row = { type: 'file', id: 'a', name: 'a', kind: 'music', file } as unknown as LibraryRow;

function menuFor(credit: string | undefined): { labels: string[]; edit: ReturnType<typeof vi.fn>; press: (label: string) => void } {
  const edit = vi.fn();
  const entries = rowMenu(row, {
    actions: { edit } as unknown as LibraryActions,
    rows: [row],
    entries: [],
    sound: { name: 'a', credit } as StoredSound,
    beginRename: () => undefined,
  });
  const items = entries.flatMap((entry) => ('label' in entry && entry.type === 'item' ? [entry] : []));
  return { labels: items.map((item) => item.label), edit, press: (label) => items.find((item) => item.label === label)?.onClick() };
}

describe('the credit in a sound\'s menu', () => {
  it('can be taken away once there is one', () => {
    const { edit, press } = menuFor('Someone');
    press('Remove credit');
    expect(edit).toHaveBeenCalledWith([file], { credit: undefined });
  });

  it('offers nothing to take away where there is none', () => {
    expect(menuFor(undefined).labels).not.toContain('Remove credit');
  });
});
