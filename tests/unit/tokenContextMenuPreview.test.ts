import { describe, expect, it, vi } from 'vitest';
import type { FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { App } from 'obsidian';
import { InteractionController } from '../../src/app/pixi/token-renderer/InteractionController';
import type { GridSystem } from '../../src/app/grid/GridSystem';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { ContextMenuEntry } from '../../src/app/react/components/context-menu/AtlasContextMenu';
import { OPEN_PREVIEW_EVENT } from '../../src/app/services/previewByHand';
import type { TokenEntity } from '../../src/app/types';
import { EventEmitter } from '../../src/app/utils/typedEmitter';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const opened = vi.hoisted(() => ({ entries: [] as ContextMenuEntry[] }));
vi.mock('../../src/app/react/root/ContextMenuContext', () => ({
  openContextMenuGlobal: (entries: ContextMenuEntry[]) => { opened.entries = entries; },
  closeContextMenuGlobal: () => {},
}));

function setup(statblockPath?: string): { eventBus: EventEmitter; rightClick: () => void } {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `preview-${Math.random()}`);
  const token = { id: 'a', kind: 'character', name: 'Goblin', imagePath: 'goblin.png', x: 140, y: 70, ...(statblockPath && { statblockPath }) } as TokenEntity;
  store.setState({ persistenceEnabled: false, activeTool: 'select', objects: { ...store.getState().objects, tokens: { a: token } } });
  const eventBus = new EventEmitter();
  const controller = new InteractionController({} as Viewport, store, {} as GridSystem, eventBus, app as unknown as App);
  const rightClick = (): void => controller.handleViewportTokenPointerDown(
    'a', { button: 2, stopPropagation: () => {}, clientX: 320, clientY: 240, global: { x: 0, y: 0 } } as unknown as FederatedPointerEvent,
  );
  return { eventBus, rightClick };
}

const preview = (): ContextMenuEntry | undefined => opened.entries.find((entry) => entry.type === 'item' && entry.label === 'Preview');

describe('token context menu Preview', () => {
  it('opens the statblock a held Mod shows over the token, where the menu was opened', () => {
    const { eventBus, rightClick } = setup('Bestiary/Goblin.md');
    const asked = vi.fn();
    eventBus.on(OPEN_PREVIEW_EVENT, asked);
    rightClick();
    const row = preview();
    if (row?.type !== 'item') throw new Error('no Preview row');
    void row.onClick?.();
    expect(asked).toHaveBeenCalledWith({
      pin: expect.objectContaining({ id: 'a', type: 'token', notePath: 'Bestiary/Goblin.md', name: 'Goblin', imagePath: 'goblin.png' }),
      screenX: 320,
      screenY: 240,
    });
  });

  it('is left out of the menu of a token without a statblock', () => {
    const { rightClick } = setup();
    rightClick();
    expect(opened.entries.length).toBeGreaterThan(0);
    expect(preview()).toBeUndefined();
  });
});
