// @vitest-environment jsdom
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { AssetCard } from '../../src/app/packages/components/asset-manager/components/AssetCard';
import { AssetTagMenuContext, type AssetTagMenuActions } from '../../src/app/packages/components/asset-manager/components/assetTagMenuContext';
import type { AssetCardHandlers } from '../../src/app/packages/components/asset-manager/hooks/useAssetCardHandlers';
import type { AnyAsset, Tag } from '../../src/app/packages/components/asset-manager/types';

// jsdom has no layout; the picker scrolls its active row into view.
beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });
afterEach(cleanup);

const handlers = (): AssetCardHandlers => ({
  onSelect: vi.fn(), onContextMenu: vi.fn(), onOpen: vi.fn(), onDelete: vi.fn(), onDragStart: vi.fn(),
  onDragEnd: vi.fn(), onSpawnCountChange: vi.fn(), onOpenStatblock: vi.fn(), onArtNeeded: vi.fn(),
});

// The tag button lies in the card's art well, hidden from assistive tech: the card is the grid's one control.
const tagButton = (): HTMLElement => document.querySelector<HTMLElement>('.atlas-asset-card-tags')!;
const menu = (): HTMLElement => screen.getByRole('dialog');

function Harness({ cardHandlers, createTag }: { cardHandlers: AssetCardHandlers; createTag: AssetTagMenuActions['createTag'] }): React.JSX.Element {
  const [asset, setAsset] = useState<AnyAsset>({ id: 'glade', name: 'Glade', type: 'maps', imageUrl: '', mapFilePath: 'glade.webp', tags: ['forest'], modifiedAt: 0 });
  const [tags, setTags] = useState<Tag[]>([{ id: 'forest', name: 'Forest' }, { id: 'night', name: 'Night' }]);
  const actions: AssetTagMenuActions = {
    tags,
    setAssetTags: async (_asset, next) => { setAsset((current) => ({ ...current, tags: next })); },
    createTag: async (name) => {
      const tag = await createTag(name);
      if (tag) setTags((current) => [...current, tag]);
      return tag;
    },
  };
  return (
    <TooltipProvider>
      <AssetTagMenuContext.Provider value={actions}>
        <AssetCard asset={asset} isSelected={false} isDragging={false} spawnCount={1} {...cardHandlers} />
      </AssetTagMenuContext.Provider>
    </TooltipProvider>
  );
}

function openMenu(): HTMLElement {
  expect(tagButton().querySelector('[data-count]')?.getAttribute('data-count')).toBe('1');
  fireEvent.keyDown(tagButton(), { key: 'Enter' });
  return screen.getByRole('combobox', { name: 'Search or create tags' });
}

const option = (name: string): HTMLElement => within(menu()).getByRole('option', { name });

it('shows the assigned tags first and toggles tags without selecting or opening the asset', async () => {
  const cardHandlers = handlers();
  render(<Harness cardHandlers={cardHandlers} createTag={vi.fn()} />);
  const search = openMenu();

  expect(document.activeElement).toBe(search);
  expect(within(menu()).getAllByRole('option').map((element) => element.textContent)).toEqual(['Forest', 'Night']);
  expect(option('Forest').getAttribute('aria-selected')).toBe('true');

  fireEvent.click(option('Night'));
  fireEvent.doubleClick(option('Night'));
  expect(option('Night').getAttribute('aria-selected')).toBe('true');
  expect(tagButton().querySelector('[data-count]')?.getAttribute('data-count')).toBe('2');

  fireEvent.keyDown(search, { key: 'Enter' });
  expect(option('Forest').getAttribute('aria-selected')).toBe('false');
  expect(cardHandlers.onSelect).not.toHaveBeenCalled();
  expect(cardHandlers.onOpen).not.toHaveBeenCalled();
});

it('filters by the search and creates a missing tag on the asset', async () => {
  const createTag = vi.fn(async (name: string): Promise<Tag> => ({ id: name.toLowerCase(), name }));
  render(<Harness cardHandlers={handlers()} createTag={createTag} />);
  const search = openMenu();

  fireEvent.change(search, { target: { value: 'nig' } });
  expect(within(menu()).getAllByRole('option').map((element) => element.textContent)).toEqual(['Night', 'Create “nig”']);

  fireEvent.change(search, { target: { value: 'Swamp' } });
  await act(async () => { fireEvent.keyDown(search, { key: 'Enter' }); });
  expect(createTag).toHaveBeenCalledExactlyOnceWith('Swamp');
  fireEvent.change(search, { target: { value: '' } });
  await waitFor(() => expect(option('Swamp').getAttribute('aria-selected')).toBe('true'));
});
