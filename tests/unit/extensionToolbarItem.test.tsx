import { describe, expect, it, vi } from 'vitest';
import { byPriority, DEFAULT_EXTENSION_PRIORITY, extensionToolbarItem, withExtensionToolbarItems } from '../../src/app/extensions/extensionToolbarItems';
import type { ToolbarItem, ViewContext } from '../../src/api/types/ui';

const ctx: ViewContext = { viewId: 'v1', kind: 'map', isPlayerView: false };
const entry = (item: Partial<ToolbarItem> = {}): Parameters<typeof extensionToolbarItem>[0] => ({
  owner: 'ext', item: { id: 'x', icon: 'network', label: 'Quick notes', onClick: vi.fn(), ...item },
});

describe('extensionToolbarItem', () => {
  it('is a plain button with a namespaced id, active and pinned with its isActive', () => {
    expect(DEFAULT_EXTENSION_PRIORITY).toBe(50);
    expect(extensionToolbarItem(entry(), ctx)).toMatchObject({ id: 'ext:ext:x', kind: 'button', active: false, pinned: false });
    expect(extensionToolbarItem(entry({ isActive: () => true }), ctx)).toMatchObject({ active: true, pinned: true });
  });

  it('is pinned exactly while it is active, and a throwing isActive counts as inactive', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(extensionToolbarItem(entry(), ctx).pinned).toBe(false);
    expect(extensionToolbarItem(entry({ isActive: () => true }), ctx)).toMatchObject({ pinned: true, menuEntry: { isActive: true } });
    expect(extensionToolbarItem(entry({ isActive: () => { throw new Error('boom'); } }), ctx).pinned).toBe(false);
    vi.restoreAllMocks();
  });

  it('gives a More tools entry with the label, shortcut and a guarded onSelect that passes the context', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onClick = vi.fn();
    const { menuEntry } = extensionToolbarItem(entry({ onClick, shortcut: 'Ctrl+O' }), ctx);
    expect(menuEntry).toMatchObject({ label: 'Quick notes', shortcut: 'Ctrl+O', isActive: false });
    menuEntry.onSelect();
    expect(onClick).toHaveBeenCalledWith(ctx);
    const throwing = extensionToolbarItem(entry({ onClick: () => { throw new Error('boom'); } }), ctx).menuEntry;
    expect(() => throwing.onSelect()).not.toThrow();
    vi.restoreAllMocks();
  });
});

describe('withExtensionToolbarItems', () => {
  const item = (id: string): Parameters<typeof withExtensionToolbarItems>[0][number] =>
    ({ id, kind: 'button', pinned: false, active: false, element: null, menuEntry: { icon: () => null, label: id, isActive: false, onSelect: vi.fn() } });
  const ids = (items: ReadonlyArray<{ id: string }>): string[] => items.map(({ id }) => id);
  const extension = [item('ext:a:1'), item('ext:b:2')];

  it("places the extensions' items right after the dice, in the order given", () => {
    expect(ids(withExtensionToolbarItems(['move', 'dice', 'loot', 'palette'].map(item), extension)))
      .toEqual(['move', 'dice', 'ext:a:1', 'ext:b:2', 'loot', 'palette']);
  });

  it('places them before the Command palette when the bar has no dice, else at its end', () => {
    expect(ids(withExtensionToolbarItems(['move', 'loot', 'palette'].map(item), extension))).toEqual(['move', 'loot', 'ext:a:1', 'ext:b:2', 'palette']);
    expect(ids(withExtensionToolbarItems(['move', 'measure'].map(item), extension))).toEqual(['move', 'measure', 'ext:a:1', 'ext:b:2']);
  });

  it("leaves Atlas's controls as they are without extension items", () => {
    expect(ids(withExtensionToolbarItems(['move', 'dice'].map(item), []))).toEqual(['move', 'dice']);
  });
});

describe('byPriority', () => {
  it('puts a higher priority first, unset counting as the default, and keeps registration order between equals', () => {
    const items = [entry({ id: 'low', priority: 10 }), entry({ id: 'plain' }), entry({ id: 'high', priority: 90 }), entry({ id: 'also', priority: DEFAULT_EXTENSION_PRIORITY })];
    expect(byPriority(items).map(({ item }) => item.id)).toEqual(['high', 'plain', 'also', 'low']);
  });
});
