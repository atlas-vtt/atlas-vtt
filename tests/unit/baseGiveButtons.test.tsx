// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import type { App } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const settings = vi.hoisted(() => ({ lootBases: ['Loot/Items.base'], lootCurrency: 'gp' }));
vi.mock('../../src/app/services/AssetService', () => ({
  AssetService: { getInstance: () => ({ loadedCollections: () => [{ id: 'cairn' }], getCollectionSettings: () => settings }) },
}));
vi.mock('../../src/app/services/mapCollectionRules', () => ({ systemPresetsOf: () => [] }));
vi.mock('../../src/app/ui/notice', () => ({ showNotice: vi.fn() }));

import { baseItemDraw } from '../../src/app/loot/baseItemDraw';
import { BaseDecoration } from '../../src/app/loot/baseGiveButtons';
import { setLootRecipientSource } from '../../src/app/loot/lootRecipients';

const NOTES: Record<string, Record<string, unknown>> = {
  'Loot/Rope.md': { price: 2, rarity: 'Common', weight: '1 slot', tags: ['gear'] },
  'Loot/Lantern.md': { price: 5, rarity: 'Uncommon' },
};

const app = {
  vault: { getFileByPath: (path: string) => (path in NOTES ? { path, basename: path.replace(/^.*\/|\.md$/g, '') } : null) },
  metadataCache: {
    getFileCache: (file: { path: string }) => ({ frontmatter: NOTES[file.path] }),
    getFirstLinkpathDest: (href: string) => (href in NOTES ? { path: href } : null),
  },
} as unknown as App;

const COLUMNS = { order: ['file.name', 'note.price', 'note.rarity', 'note.weight'], displayNames: { 'note.weight': 'Weight' } };

describe('an item of a loot base as the roller draws it', () => {
  it('reads roles and shown properties from the note by the table’s columns', () => {
    const draw = baseItemDraw(app, 'Loot/Items.base', 'Loot/Rope.md', COLUMNS);
    expect(draw).toMatchObject({ name: 'Rope', notePath: 'Loot/Rope.md', source: ['Items'], price: '2 gp', rarity: 'Common', properties: [{ label: 'Weight', value: '1 slot' }] });
  });

  it('is none for a base no collection rolls on, or a note that is gone', () => {
    expect(baseItemDraw(app, 'Creatures.base', 'Loot/Rope.md', COLUMNS)).toBeNull();
    expect(baseItemDraw(app, 'Loot/Items.base', 'Loot/Gone.md', COLUMNS)).toBeNull();
  });
});

/** Obsidian's table as its markup reads: a header, then rows whose name cell links the note. */
function table(paths: string[]): HTMLElement {
  const el = document.body.createDiv();
  const head = el.createDiv({ cls: 'bases-thead' }).createDiv({ cls: 'bases-tr' });
  for (const name of ['file name', 'price']) head.createDiv({ cls: 'bases-td' }).createDiv({ cls: 'bases-table-header-name', text: name });
  const body = el.createDiv({ cls: 'bases-tbody' });
  for (const path of paths) {
    const row = body.createDiv({ cls: 'bases-tr' });
    row.createDiv({ cls: 'bases-td', attr: { 'data-property': 'file.name' } }).createDiv({ cls: 'bases-table-cell' }).createSpan({ cls: 'internal-link', attr: { 'data-href': path } });
    row.createDiv({ cls: 'bases-td', attr: { 'data-property': 'note.price' } });
  }
  return el;
}

const nextFrame = (): Promise<void> => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

describe('give buttons in an open loot base', () => {
  const give = vi.fn(() => true);
  let decoration: BaseDecoration | null = null;

  beforeEach(() => {
    vi.stubGlobal('PointerEvent', MouseEvent);
    vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
    setLootRecipientSource({ recipients: () => [{ id: 'p1', name: 'Ana', character: 'Mira' }], give, subscribe: () => () => undefined });
  });

  afterEach(() => {
    act(() => decoration?.destroy());
    decoration = null;
    setLootRecipientSource(null);
    give.mockClear();
    cleanup();
    document.body.empty();
    vi.unstubAllGlobals();
  });

  async function giveFromRow(index: number): Promise<void> {
    const button = screen.getAllByRole('button', { name: 'Give to player' })[index]!;
    fireEvent.pointerDown(button, { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Ana/ }));
  }

  it('puts one button into each name cell and hands that row’s item', async () => {
    const el = table(['Loot/Rope.md', 'Loot/Lantern.md']);
    act(() => { decoration = new BaseDecoration(app, el, 'Loot/Items.base'); });
    expect(el.querySelectorAll('[data-property="file.name"] .atlas-base-give button')).toHaveLength(2);
    await giveFromRow(1);
    expect(give).toHaveBeenCalledWith('p1', expect.objectContaining({ name: 'Lantern', price: '5 gp' }));
  });

  it('follows a row Obsidian recycles for another note', async () => {
    const el = table(['Loot/Rope.md']);
    act(() => { decoration = new BaseDecoration(app, el, 'Loot/Items.base'); });
    el.querySelector('.internal-link')!.setAttribute('data-href', 'Loot/Lantern.md');
    await nextFrame();
    await giveFromRow(0);
    expect(give).toHaveBeenCalledWith('p1', expect.objectContaining({ name: 'Lantern' }));
    expect(el.querySelectorAll('.atlas-base-give')).toHaveLength(1);
  });

  it('takes its buttons back out when it ends', () => {
    const el = table(['Loot/Rope.md']);
    act(() => { decoration = new BaseDecoration(app, el, 'Loot/Items.base'); });
    act(() => decoration!.destroy());
    decoration = null;
    expect(el.querySelector('.atlas-base-give')).toBeNull();
    expect(el.querySelector('.atlas-base-give-cell')).toBeNull();
  });
});
