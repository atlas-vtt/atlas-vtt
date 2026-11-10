// @vitest-environment jsdom
import React from 'react';
import { act, fireEvent, render, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { AssetCard } from '../../src/app/packages/components/asset-manager/components/AssetCard';
import type { AssetCardHandlers } from '../../src/app/packages/components/asset-manager/hooks/useAssetCardHandlers';
import { useMissingStatblocks } from '../../src/app/packages/components/asset-manager/hooks/useMissingStatblocks';
import type { AnyAsset, TokenAsset } from '../../src/app/packages/components/asset-manager/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const KEPT = 'Bestiary/Goblin.md';
const GONE = 'Bestiary/Flickerfly.md';
const token = (id: string, statblockPath?: string): TokenAsset => ({
  id, name: id, type: 'tokens', imageUrl: `app://art/${id}.webp`, modifiedAt: 0, ...(statblockPath && { statblockPath }),
});

function renderCard(asset: TokenAsset, statblockMissing: boolean): ReturnType<typeof vi.fn> {
  const onOpenStatblock = vi.fn();
  const handlers: AssetCardHandlers = {
    onSelect: vi.fn(), onContextMenu: vi.fn(), onOpen: vi.fn(), onDelete: vi.fn(), onDragStart: vi.fn(), onDragEnd: vi.fn(),
    onSpawnCountChange: vi.fn(), onOpenStatblock, onArtNeeded: vi.fn(),
  };
  render(
    <TooltipProvider>
      <AssetCard asset={asset} isSelected={false} isDragging={false} spawnCount={1} statblockMissing={statblockMissing} {...handlers} />
    </TooltipProvider>,
  );
  return onOpenStatblock;
}

describe('a token card whose statblock note is gone (#612)', () => {
  it('marks the link as missing and hands the token on when clicked', () => {
    const asset = token('flickerfly', GONE);
    const onOpenStatblock = renderCard(asset, true);
    const badge = document.querySelector('.atlas-asset-statblock-indicator');
    expect(badge?.classList.contains('atlas-asset-statblock-indicator--missing')).toBe(true);
    fireEvent.click(badge!);
    expect(onOpenStatblock).toHaveBeenCalledWith(asset);
  });

  it('shows no badge for a link whose note is there: only what needs the GM is marked', () => {
    renderCard(token('goblin', KEPT), false);
    expect(document.querySelector('.atlas-asset-statblock-indicator')).toBeNull();
  });
});

describe('useMissingStatblocks', () => {
  it('finds the linked notes the vault lacks and follows the vault', () => {
    const { app, files, emit } = createInMemoryApp({ files: { [KEPT]: '---\nstatblock: true\n---' } });
    const assets: AnyAsset[] = [token('goblin', KEPT), token('flickerfly', GONE), token('plain')];
    const { result } = renderHook(() => useMissingStatblocks(app, assets));
    expect([...result.current]).toEqual([GONE]);

    // A sync tool delivers the note late: the link counts as whole again.
    files.set(GONE, '---\nstatblock: true\n---');
    act(() => emit('create'));
    expect(result.current.size).toBe(0);

    files.delete(KEPT);
    act(() => emit('delete'));
    expect([...result.current]).toEqual([KEPT]);
  });
});
