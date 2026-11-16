// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { AssetCard } from '../../src/app/packages/components/asset-manager/components/AssetCard';
import { TransferDialog } from '../../src/app/packages/components/asset-manager/collection-transfer/TransferDialog';
import { CollectionHero } from '../../src/app/packages/components/asset-manager/collection-transfer/CollectionHero';
import type { AssetCardHandlers } from '../../src/app/packages/components/asset-manager/hooks/useAssetCardHandlers';
import type { TokenAsset } from '../../src/app/packages/components/asset-manager/types';

afterEach(cleanup);

const goblin: TokenAsset = { id: 'goblin', name: 'Goblin', type: 'tokens', imageUrl: 'app://art/goblin.webp', modifiedAt: 0 };

function handlers(): AssetCardHandlers {
  return {
    onSelect: vi.fn(), onContextMenu: vi.fn(), onOpen: vi.fn(), onDelete: vi.fn(), onDragStart: vi.fn(),
    onDragEnd: vi.fn(), onSpawnCountChange: vi.fn(), onOpenStatblock: vi.fn(), onArtNeeded: vi.fn(),
  };
}

function renderCard(cardHandlers: AssetCardHandlers): HTMLElement {
  render(
    <TooltipProvider>
      <div className="atlas-asset-grid-cell" role="listbox" aria-label="Tokens">
        <AssetCard asset={goblin} isSelected={false} isDragging={false} spawnCount={1} tabbable {...cardHandlers} />
      </div>
    </TooltipProvider>,
  );
  return screen.getByRole('option', { name: 'Goblin' });
}

describe('a card\'s ⋯ button (decision #20)', () => {
  const moreButton = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('.atlas-asset-card-more')!;

  it('stands beside the option, not in it, for the pointer only: hidden from assistive tech and out of the tab order', () => {
    const card = renderCard(handlers());
    const more = moreButton();
    expect(card.contains(more)).toBe(false);
    expect(card.nextElementSibling?.contains(more)).toBe(true);
    expect(more.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(more.tabIndex).toBe(-1);
    // The listbox still owns nothing but its option.
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1);
    expect(within(screen.getByRole('listbox')).queryByRole('button')).toBeNull();
  });

  it('opens the menu right-click opens, hung below itself, handing focus back to the card', () => {
    const cardHandlers = handlers();
    const card = renderCard(cardHandlers);
    const more = moreButton();
    more.getBoundingClientRect = (): DOMRect => ({ left: 40, top: 60, right: 64, bottom: 84, width: 24, height: 24, x: 40, y: 60, toJSON: () => ({}) });

    // A press takes no focus and selects nothing: the card keeps both.
    expect(fireEvent.mouseDown(more)).toBe(false);
    fireEvent.click(more);
    expect(cardHandlers.onSelect).not.toHaveBeenCalled();
    expect(cardHandlers.onContextMenu).toHaveBeenCalledWith(goblin, { clientX: 40, clientY: 88, returnFocus: card });

    fireEvent.contextMenu(more);
    expect(cardHandlers.onContextMenu).toHaveBeenCalledTimes(2);
    fireEvent.doubleClick(more);
    expect(cardHandlers.onOpen).not.toHaveBeenCalled();
  });
});

describe('the export and import dialog', () => {
  it('adds no banner or sidebar landmark beside the asset manager\'s, and its title heads the page below it', () => {
    render(
      <>
        <header>Asset manager</header>
        <aside>Collections</aside>
        <TransferDialog
          label="Export collection"
          onClose={vi.fn()}
          hero={<CollectionHero eyebrow="Export collection" name="Demo" version="v1" details={[]} />}
          aside={<p>Cover</p>}
          actions={<button type="button">Export</button>}
        >
          <h3>What&rsquo;s included</h3>
        </TransferDialog>
      </>,
    );
    expect(screen.getAllByRole('banner')).toHaveLength(1);
    expect(screen.getAllByRole('complementary')).toHaveLength(1);
    const dialog = screen.getByRole('dialog', { name: 'Export collection' });
    expect(within(dialog).getAllByRole('heading').map((heading) => heading.tagName)).toEqual(['H2', 'H3']);
  });

  it('keeps Tab inside, so the asset manager behind never switches its tabs', () => {
    const heard = vi.fn();
    const behind = (event: KeyboardEvent): void => heard(event.key);
    document.addEventListener('keydown', behind);
    try {
      render(
        <TransferDialog label="Export collection" onClose={vi.fn()} hero={<CollectionHero eyebrow="Export" name="Demo" version="v1" details={[]} />}
          actions={<button type="button">Export</button>}>
          <p>Contents</p>
        </TransferDialog>,
      );
      const exportButton = screen.getByRole('button', { name: 'Export' });
      exportButton.focus();
      fireEvent.keyDown(exportButton, { key: 'Tab' });
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
      expect(heard).not.toHaveBeenCalledWith('Tab');
    } finally {
      document.removeEventListener('keydown', behind);
    }
  });
});
