// @vitest-environment jsdom
import React, { useRef, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { AssetCard } from '../../src/app/packages/components/asset-manager/components/AssetCard';
import type { AssetCardHandlers } from '../../src/app/packages/components/asset-manager/hooks/useAssetCardHandlers';
import { useGridKeyboard } from '../../src/app/packages/components/asset-manager/hooks/useGridKeyboard';
import { buildAssetContextMenuEntries, type AssetContextMenuDeps } from '../../src/app/packages/components/asset-manager/contextMenus/assetContextMenu';
import type { AnyAsset, TokenAsset } from '../../src/app/packages/components/asset-manager/types';
import { t } from '../../src/app/i18n';

afterEach(cleanup);

const token = (id: string, extra: Partial<TokenAsset> = {}): TokenAsset => ({
  id, name: id, type: 'tokens', imageUrl: `app://art/${id}.webp`, modifiedAt: 0, ...extra,
});

function handlers(): AssetCardHandlers {
  return {
    onSelect: vi.fn(), onContextMenu: vi.fn(), onOpen: vi.fn(), onDelete: vi.fn(), onDragStart: vi.fn(),
    onDragEnd: vi.fn(), onSpawnCountChange: vi.fn(), onOpenStatblock: vi.fn(), onArtNeeded: vi.fn(),
  };
}

function renderCard(asset: TokenAsset, cardHandlers: AssetCardHandlers, extra: { spawnCount?: number; statblockMissing?: boolean } = {}): HTMLElement {
  render(
    <TooltipProvider>
      <AssetCard asset={asset} isSelected={false} isDragging={false} spawnCount={extra.spawnCount ?? 1}
        statblockMissing={extra.statblockMissing ?? false} tabbable position={3} setSize={9} {...cardHandlers} />
    </TooltipProvider>,
  );
  return screen.getByRole('option', { name: asset.name });
}

describe('an asset card is an option of the grid', () => {
  it('names itself by the asset, tells its place and holds no control of its own (axe nested-interactive)', () => {
    const card = renderCard(token('Goblin', { statblockPath: 'Bestiary/Goblin.md' }), handlers(), { spawnCount: 3, statblockMissing: true });
    expect(card.getAttribute('aria-selected')).toBe('false');
    expect(card.getAttribute('aria-posinset')).toBe('3');
    expect(card.getAttribute('aria-setsize')).toBe('9');
    expect(card.tabIndex).toBe(0);
    expect(card.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')).toHaveLength(0);
    expect(card.querySelector('.atlas-asset-card-thumb')?.getAttribute('aria-hidden')).toBe('true');
    // What the hidden art well shows is said as the card's description.
    const description = document.getElementById(card.getAttribute('aria-describedby') ?? '');
    expect(description?.textContent).toBe('Statblock note not found, Spawn 3 tokens');
  });

  it('runs its main action on Enter, selects on Space, asks to delete on Delete and opens its menu on Shift+F10', () => {
    const cardHandlers = handlers();
    const asset = token('Wolf');
    const card = renderCard(asset, cardHandlers);

    fireEvent.keyDown(card, { key: 'Enter' });
    expect(cardHandlers.onOpen).toHaveBeenCalledWith(asset, 1);

    expect(fireEvent.keyDown(card, { key: ' ' })).toBe(false);
    expect(cardHandlers.onSelect).toHaveBeenCalledWith('Wolf', expect.objectContaining({ key: ' ' }));

    fireEvent.keyDown(card, { key: 'Delete' });
    expect(cardHandlers.onDelete).toHaveBeenCalledWith(asset);

    fireEvent.keyDown(card, { key: 'F10', shiftKey: true });
    expect(cardHandlers.onContextMenu).toHaveBeenCalledWith(asset, expect.objectContaining({ returnFocus: card }));
  });

  it('opens its menu at the pointer on a right click, handing focus back to the card', () => {
    const cardHandlers = handlers();
    const card = renderCard(token('Bat'), cardHandlers);
    fireEvent.contextMenu(card, { clientX: 40, clientY: 60 });
    expect(cardHandlers.onContextMenu).toHaveBeenCalledWith(expect.objectContaining({ id: 'Bat' }), { clientX: 40, clientY: 60, returnFocus: card });
  });
});

describe('roving focus over the grid', () => {
  function Grid({ assets, mounted, onSelect, scrollToRow }: {
    assets: AnyAsset[]; mounted: number; onSelect: (id: string, event?: unknown) => void; scrollToRow: (row: number) => void;
  }): React.JSX.Element {
    const container = useRef<HTMLDivElement>(null);
    const [shown, setShown] = useState(mounted);
    const keys = useGridKeyboard({
      assets, columns: 2, pageRows: 1, container, onSelect,
      scrollToRow: (row) => { scrollToRow(row); setShown(assets.length); },
    });
    return (
      <div ref={container} role="listbox" aria-label="Tokens" onKeyDown={keys.onKeyDown} onFocus={keys.onFocus}>
        {assets.slice(0, shown).map((asset) => (
          <div key={asset.id} role="option" aria-selected="false" data-asset-id={asset.id} tabIndex={asset.id === keys.tabbableId ? 0 : -1}>{asset.name}</div>
        ))}
      </div>
    );
  }

  const assets = ['a', 'b', 'c', 'd', 'e'].map((id) => token(id));

  it('moves focus card by card and row by row, keeping one tab stop', () => {
    render(<Grid assets={assets} mounted={5} onSelect={vi.fn()} scrollToRow={vi.fn()} />);
    const option = (name: string): HTMLElement => screen.getByRole('option', { name });
    expect(option('a').tabIndex).toBe(0);
    option('a').focus();
    fireEvent.keyDown(option('a'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(option('b'));
    fireEvent.keyDown(option('b'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(option('d'));
    expect(option('d').tabIndex).toBe(0);
    expect(option('a').tabIndex).toBe(-1);
    fireEvent.keyDown(option('d'), { key: 'End' });
    expect(document.activeElement).toBe(option('e'));
  });

  it('extends the selection with Shift from the card focus leaves', () => {
    const onSelect = vi.fn();
    render(<Grid assets={assets} mounted={5} onSelect={onSelect} scrollToRow={vi.fn()} />);
    const first = screen.getByRole('option', { name: 'a' });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight', shiftKey: true });
    expect(onSelect.mock.calls.map(([id, event]) => [id, (event as { shiftKey?: boolean } | undefined)?.shiftKey ?? false]))
      .toEqual([['a', false], ['b', true]]);
  });

  it('scrolls an unmounted card into the grid and focuses it once it mounts', () => {
    const scrollToRow = vi.fn();
    render(<Grid assets={assets} mounted={2} onSelect={vi.fn()} scrollToRow={scrollToRow} />);
    const first = screen.getByRole('option', { name: 'a' });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(scrollToRow).toHaveBeenCalledWith(1);
    expect(document.activeElement).toBe(screen.getByRole('option', { name: 'c' }));
  });
});

describe('the card menu', () => {
  const deps = { folders: [{ id: 'f', type: 'tokens' }], transferTargets: [], selectedAssetIds: ['Wolf'], assets: [] } as unknown as AssetContextMenuDeps;
  const asset = token('Wolf', { statblockPath: 'Bestiary/Wolf.md' });
  const entries = buildAssetContextMenuEntries(asset, [asset], deps);

  it('groups its rows with separators: play, change, file, delete', () => {
    const kinds = entries.map((entry) => (entry.type === 'custom' ? '|' : entry.label));
    expect(kinds.filter((kind) => kind === '|')).toHaveLength(3);
    expect(kinds[0]).toBe(t('am.menu.spawn'));
    expect(kinds[kinds.length - 1]).toBe(t('common.delete'));
    expect(kinds[kinds.length - 2]).toBe('|');
  });

  it('names the keys that do the same and starts every label on one edge', () => {
    const items = entries.filter((entry) => entry.type === 'item');
    expect(items[0]).toMatchObject({ detail: 'Enter' });
    expect(items[items.length - 1]).toMatchObject({ detail: 'Delete' });
    expect(items.every((item) => item.type === 'item' && item.leading !== undefined)).toBe(true);
  });
});

it('keeps the name tooltip shut over a control of the art that shows its own (one tooltip at a time)', () => {
  const card = renderCard(token('Lich', { statblockPath: 'Bestiary/Lich.md' }), handlers(), { statblockMissing: true });
  fireEvent.pointerOver(card.querySelector('.atlas-asset-statblock-indicator')!);
  fireEvent.focus(card);
  expect(document.querySelector('.atlas-asset-card-tooltip')).toBeNull();
  fireEvent.blur(card);
  // The name tooltip shows only a name its line cuts.
  const name = card.querySelector<HTMLElement>('.atlas-asset-card-name')!;
  Object.defineProperties(name, { scrollWidth: { value: 200 }, clientWidth: { value: 100 } });
  fireEvent.pointerOver(name);
  fireEvent.focus(card);
  expect(document.querySelector('.atlas-asset-card-tooltip')).not.toBeNull();
});

it('tells the main action on focus, without the name its card shows whole', () => {
  const card = renderCard(token('Lich'), handlers());
  fireEvent.pointerOver(card.querySelector('.atlas-asset-card-name')!);
  fireEvent.focus(card);
  const tooltip = document.querySelector('.atlas-asset-card-tooltip');
  expect(tooltip?.querySelector('.atlas-asset-card-tooltip__hint')?.textContent).toBe('Double-click to spawn on map');
  expect(tooltip?.querySelector('.atlas-asset-card-tooltip__name')).toBeNull();
});
