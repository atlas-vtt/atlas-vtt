// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { showAtlasToast } from '../../src/app/react/components/AtlasToast';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { AssetCard } from '../../src/app/packages/components/asset-manager/components/AssetCard';
import type { AssetCardHandlers } from '../../src/app/packages/components/asset-manager/hooks/useAssetCardHandlers';
import type { TokenAsset } from '../../src/app/packages/components/asset-manager/types';
import { focusSoon, isQuietlyFocused } from '../../src/app/packages/components/asset-manager/utils/cardFocus';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.querySelectorAll('.atlas-toast-container').forEach((el) => el.remove());
});

describe('a toast with an action', () => {
  it('shows the message and a button that does the action and closes the toast', () => {
    const run = vi.fn();
    vi.useFakeTimers();
    showAtlasToast('Moved "Rogue" to Loot', 6000, { label: 'Open folder', run });
    vi.advanceTimersByTime(20);
    const toast = document.querySelector('.atlas-toast')!;
    expect(toast.querySelector('.atlas-toast__text')?.textContent).toBe('Moved "Rogue" to Loot');
    const button = toast.querySelector('button')!;
    expect(button.textContent).toBe('Open folder');

    fireEvent.click(button);
    expect(run).toHaveBeenCalledTimes(1);
    expect(toast.classList.contains('atlas-toast-exiting')).toBe(true);
  });

  it('stays while the pointer rests on it, so the button can be reached', () => {
    vi.useFakeTimers();
    showAtlasToast('Moved 3 tokens to Loot', 1000, { label: 'Open folder', run: vi.fn() });
    const toast = document.querySelector('.atlas-toast')!;
    fireEvent.pointerEnter(toast);
    vi.advanceTimersByTime(5000);
    expect(toast.classList.contains('atlas-toast-exiting')).toBe(false);

    fireEvent.pointerLeave(toast);
    vi.advanceTimersByTime(1000);
    expect(toast.classList.contains('atlas-toast-exiting')).toBe(true);
    // No transition ends in jsdom: the toast still goes.
    vi.advanceTimersByTime(1000);
    expect(document.querySelector('.atlas-toast')).toBeNull();
  });

  it('announces its message alone, politely, and leaves when dismissed', () => {
    vi.useFakeTimers();
    const handle = showAtlasToast('Moved "Rogue" to Keep', 6000, { label: 'Open collection', run: vi.fn() });
    const container = document.querySelector('.atlas-toast-container');
    // Atlas' styles reach it only with the plugin's class on it: the host under <body> lies outside the plugin's root.
    expect(container?.classList.contains('atlas-vtt-plugin')).toBe(true);
    // The button is no part of what is read out: it was read run together with the message ("…KeepOpen collection").
    const regions = Array.from(document.querySelectorAll('[aria-live]'));
    expect(regions).toHaveLength(1);
    const [region] = regions;
    expect(region?.getAttribute('aria-live')).toBe('polite');
    expect(region?.getAttribute('role')).toBe('status');
    expect(region?.querySelector('button')).toBeNull();
    // Its text comes once the region is in the document, which is when a screen reader hears it.
    expect(region?.textContent).toBe('');
    vi.advanceTimersByTime(20);
    expect(region?.textContent).toBe('Moved "Rogue" to Keep');
    expect(document.querySelector('.atlas-toast button')?.textContent).toBe('Open collection');
    handle.dismiss();
    vi.advanceTimersByTime(1000);
    expect(document.querySelector('.atlas-toast-container')).toBeNull();
  });
});

describe('focus put on a card by code', () => {
  const asset: TokenAsset = { id: 'bard', name: 'Bard', type: 'tokens', imageUrl: 'app://art/bard.webp', modifiedAt: 0 };
  const handlers: AssetCardHandlers = {
    onSelect: vi.fn(), onContextMenu: vi.fn(), onOpen: vi.fn(), onDelete: vi.fn(), onDragStart: vi.fn(), onDragEnd: vi.fn(),
    onSpawnCountChange: vi.fn(), onOpenStatblock: vi.fn(), onArtNeeded: vi.fn(),
  };
  const renderCard = (): HTMLElement => {
    render(
      <TooltipProvider>
        <AssetCard asset={asset} isSelected={false} isDragging={false} spawnCount={1} {...handlers} />
      </TooltipProvider>,
    );
    return document.querySelector<HTMLElement>('[data-asset-id="bard"]')!;
  };
  const tooltipShown = (): boolean => document.querySelector('.atlas-asset-card-tooltip') !== null;

  it('opens no tooltip: nobody pointed at the card (the neighbour of a moved card)', () => {
    const card = renderCard();
    act(() => focusSoon(document, () => card));
    expect(document.activeElement).toBe(card);
    expect(isQuietlyFocused(card)).toBe(true);
    expect(tooltipShown()).toBe(false);
  });

  it('lets the tooltip open again once the pointer moves over the card or focus leaves it', () => {
    const card = renderCard();
    act(() => focusSoon(document, () => card));
    fireEvent.pointerMove(card);
    expect(isQuietlyFocused(card)).toBe(false);

    act(() => focusSoon(document, () => card));
    act(() => card.blur());
    expect(isQuietlyFocused(card)).toBe(false);
    act(() => card.focus());
    expect(tooltipShown()).toBe(true);
  });
});
