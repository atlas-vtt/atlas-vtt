// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { AssetCard } from '../../src/app/packages/components/asset-manager/components/AssetCard';
import type { AssetCardHandlers } from '../../src/app/packages/components/asset-manager/hooks/useAssetCardHandlers';
import type { EncounterAsset } from '../../src/app/packages/components/asset-manager/types';

const handlers: AssetCardHandlers = {
  onSelect: () => {},
  onContextMenu: () => {},
  onOpen: () => {},
  onDragStart: () => {},
  onDragEnd: () => {},
  onSpawnCountChange: () => {},
  onOpenStatblock: () => {},
};

function renderEncounterCard(asset: EncounterAsset): void {
  render(
    <TooltipProvider>
      <AssetCard asset={asset} isSelected={false} isDragging={false} spawnCount={1} {...handlers} />
    </TooltipProvider>
  );
}

describe('AssetCard encounter previews', () => {
  it('renders the resolved token previews and counts the rest', () => {
    const tokenPath = (name: string): string => `atlas-vtt/collections/default/tokens/${name}.webp`;
    const encounter: EncounterAsset = {
      id: 'enc-1',
      name: 'Forest Ambush',
      modifiedAt: 0,
      type: 'encounters',
      tags: [],
      tokens: ['Goblin', 'Wolf', 'Boss', 'Shaman'].map((name, index) => ({ id: String(index), name, imagePath: tokenPath(name) })),
      tokenPreviews: ['goblin', 'wolf', 'boss'].map((name) => ({ url: `resource://${tokenPath(name)}` })),
    };

    renderEncounterCard(encounter);

    expect(screen.getByAltText('Forest Ambush token 1')).toBeTruthy();
    expect(screen.getByAltText('Forest Ambush token 2')).toBeTruthy();
    expect(screen.getByAltText('Forest Ambush token 3')).toBeTruthy();
    expect(screen.queryByAltText('Forest Ambush token 4')).toBeNull();
    expect(screen.getByText('+1')).toBeTruthy();
  });
});
