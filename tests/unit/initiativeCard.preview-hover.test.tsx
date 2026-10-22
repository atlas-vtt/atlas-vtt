// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Platform } from 'obsidian';
import type { InitiativeEntry } from '../../src/app/types/initiativeTypes';

vi.mock('../../src/app/react/root/AtlasUIContext', async () => ({
  AtlasUIContext: (await import('react')).createContext(null),
  useAtlasUI: () => ({
    app: null,
    view: null,
  }),
}));

vi.mock('../../src/app/react/ViewStoreContext', () => ({
  useViewStoreHook: () => ({ getState: () => ({}) }),
  useAtlasStore: (selector: (state: any) => unknown) => selector({
    objects: { tokens: {} },
    tokenSettings: { showInstanceBadges: true },
  }),
}));

vi.mock('../../src/app/pixi/utils/tokenHighlight', () => ({
  zoomToTokenWithHighlight: vi.fn(),
}));

import { InitiativeCard } from '../../src/app/react/components/InitiativeCard';

function createEntry(): InitiativeEntry {
  return {
    id: 'entry-1',
    tokenId: 'token-1',
    name: 'Bandit Captain',
    initiative: 12,
    initiativeModifier: 2,
    isActive: false,
    isNPC: true,
    order: 0,
    statblockPath: 'atlas-vtt/statblocks/Bandit Captain.md',
  };
}

describe('InitiativeCard statblock preview hover behavior', () => {
  beforeEach(() => {
    Platform.isMacOS = true;
  });

  afterEach(() => {
    Platform.isMacOS = false;
  });

  it('does not repeatedly trigger onHover when this card is already active preview target', () => {
    const onHover = vi.fn();
    const entry = createEntry();

    const { rerender, getByRole } = render(
      <InitiativeCard
        entry={entry}
        index={0}
        isHoveredForPreview={false}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDragEnd={vi.fn()}
        onContextMenu={vi.fn()}
        onHover={onHover}
      />,
    );

    const card = getByRole('listitem');

    fireEvent.mouseMove(card, { metaKey: true });
    expect(onHover).toHaveBeenCalledTimes(1);

    rerender(
      <InitiativeCard
        entry={entry}
        index={0}
        isHoveredForPreview={true}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDragEnd={vi.fn()}
        onContextMenu={vi.fn()}
        onHover={onHover}
      />,
    );

    fireEvent.mouseMove(card, { metaKey: true });
    expect(onHover).toHaveBeenCalledTimes(1);
  });

  it('opens the preview when the modifier key is pressed after the card is already hovered', () => {
    const onHover = vi.fn();
    const entry = createEntry();

    const { getByRole } = render(
      <InitiativeCard
        entry={entry}
        index={0}
        isHoveredForPreview={false}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDragEnd={vi.fn()}
        onContextMenu={vi.fn()}
        onHover={onHover}
      />,
    );

    const card = getByRole('listitem');

    fireEvent.mouseEnter(card);
    expect(onHover).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Meta', metaKey: true });
    expect(onHover).toHaveBeenCalledTimes(1);
  });

  it('believes a pointer event over the keys: a Mod release nobody heard opens no preview (#501)', () => {
    const onHover = vi.fn();
    const { getByRole } = render(
      <InitiativeCard
        entry={createEntry()}
        index={0}
        isHoveredForPreview={false}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDragEnd={vi.fn()}
        onContextMenu={vi.fn()}
        onHover={onHover}
      />,
    );
    // Mod went down over the map, and came up where nothing passed the release on
    fireEvent.keyDown(window, { key: 'Meta', metaKey: true });

    fireEvent.mouseEnter(getByRole('listitem'));
    fireEvent.mouseMove(getByRole('listitem'));

    expect(onHover).not.toHaveBeenCalled();
  });

  it('ends the preview when the pointer leaves the card without Mod, and keeps it when Mod is held', () => {
    const onHover = vi.fn();
    const { getByRole } = render(
      <InitiativeCard
        entry={createEntry()}
        index={0}
        isHoveredForPreview={true}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDragEnd={vi.fn()}
        onContextMenu={vi.fn()}
        onHover={onHover}
      />,
    );
    const card = getByRole('listitem');

    fireEvent.mouseLeave(card, { metaKey: true });
    expect(onHover).not.toHaveBeenCalled();

    fireEvent.mouseLeave(card);
    expect(onHover).toHaveBeenCalledWith(null);
  });

  it('ignores Ctrl on macOS, where Ctrl+click is a right click', () => {
    const onHover = vi.fn();

    const { getByRole } = render(
      <InitiativeCard
        entry={createEntry()}
        index={0}
        isHoveredForPreview={false}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDragEnd={vi.fn()}
        onContextMenu={vi.fn()}
        onHover={onHover}
      />,
    );

    const card = getByRole('listitem');
    fireEvent.keyDown(window, { key: 'Control', ctrlKey: true });
    fireEvent.mouseMove(card, { ctrlKey: true });

    expect(onHover).not.toHaveBeenCalled();
  });

  it('ignores the modifier key once the card was hidden without a mouseleave', () => {
    const onHover = vi.fn();

    const { getByRole } = render(
      <InitiativeCard
        entry={createEntry()}
        index={0}
        isHoveredForPreview={false}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDragEnd={vi.fn()}
        onContextMenu={vi.fn()}
        onHover={onHover}
      />,
    );

    const card = getByRole('listitem');
    fireEvent.mouseEnter(card);
    // Another Obsidian tab took over and hid the map view under the resting pointer.
    card.checkVisibility = (): boolean => false;

    fireEvent.keyDown(window, { key: 'Meta', metaKey: true });
    expect(onHover).not.toHaveBeenCalled();
  });
});
