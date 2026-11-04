import { describe, expect, it } from 'vitest';
import { MENU_SEPARATOR } from '../../../../src/app/react/components/context-menu/AtlasContextMenu';
import { menuEntries, type MenuEntry } from '../../../../src/app/online/gm/dock/dockMenu';

const row = (title: string, apart?: boolean): MenuEntry => ({ title, run: () => undefined, ...(apart !== undefined && { apart }) });
const shape = (entries: readonly MenuEntry[]): string[] => menuEntries(entries).map((entry) => (entry === MENU_SEPARATOR ? 'separator' : entry.type === 'item' ? entry.label : entry.type));

describe('the online control\'s menus', () => {
  it('draw no separator above the first row', () => {
    expect(shape([row('New code', true), row('Require code'), row('Stop table', true)])).toEqual(['New code', 'Require code', 'separator', 'Stop table']);
  });

  it('keep a separator between rows', () => {
    expect(shape([row('Send feedback'), row('New code', true), row('Stop table', true)])).toEqual(['Send feedback', 'separator', 'New code', 'separator', 'Stop table']);
  });

  it('draw none for a lone row that stands apart', () => {
    expect(shape([row('Stop table', true)])).toEqual(['Stop table']);
  });
});
