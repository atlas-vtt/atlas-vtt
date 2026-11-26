// @vitest-environment jsdom
import React, { act } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { App } from 'obsidian';
import type { EventEmitter } from '../../src/app/utils/typedEmitter';
import type { GridSystem } from '../../src/app/grid/GridSystem';
import type { ContextMenuEntry } from '../../src/app/react/components/context-menu/AtlasContextMenu';
import type { TokenEntity } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const opened = vi.hoisted(() => ({ entries: [] as ContextMenuEntry[] }));
vi.mock('../../src/app/react/root/ContextMenuContext', () => ({
  openContextMenuGlobal: (entries: ContextMenuEntry[]) => { opened.entries = entries; },
  closeContextMenuGlobal: () => {},
}));
vi.mock('../../src/app/react/components/StatblockHoverPreview', () => ({
  StatblockHoverPreview: () => null,
  useStatblockHoverPreview: () => [
    { hoveredEntry: null, isVisible: false, isClosing: false, position: null, anchorRect: null, notePath: null },
    { showPreview: vi.fn(), closePreview: vi.fn(), clearPreview: vi.fn() },
  ],
}));

import { InteractionController } from '../../src/app/pixi/token-renderer/InteractionController';
import { InitiativeTracker } from '../../src/app/react/components/InitiativeTracker';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';

/** A fight in turn order between `names`, in that order, with `a` holding the turn; `b` has no hit points left. */
function fight(app: App): ViewAtlasStore {
  const store = createViewAtlasStore(app, `remove-turn-holder-${Math.random()}`);
  const tokens: Record<string, TokenEntity> = {};
  for (const name of ['a', 'b', 'c']) {
    tokens[name] = { id: name, kind: 'token', x: 0, y: 0, imagePath: `${name}.png`, resources: { hp: { current: name === 'b' ? 0 : 7, max: 7 } } };
    store.getState().addToInitiative({ tokenId: name, name, initiative: 0, initiativeModifier: 0, imagePath: `${name}.png`, isNPC: true });
  }
  store.setState((state) => ({ persistenceEnabled: false, mapLoaded: true, activeTool: 'select', objects: { ...state.objects, tokens } }));
  store.getState().startCombat();
  return store;
}

const turnHolder = (store: ViewAtlasStore): string | undefined =>
  store.getState().initiative.entries.find((entry) => entry.isActive)?.tokenId;

describe('removing the combatant with the turn', () => {
  it('from its token menu passes the turn by a defeated combatant, as Next turn does', () => {
    const { app } = createInMemoryApp();
    const store = fight(app);
    const controller = new InteractionController({} as Viewport, store, {} as GridSystem, {} as EventEmitter, app);
    controller.handleViewportTokenPointerDown(
      'a', { button: 2, stopPropagation: () => {}, clientX: 0, clientY: 0, global: { x: 0, y: 0 } } as unknown as FederatedPointerEvent,
    );

    const remove = opened.entries.find((entry) => entry.type === 'item' && entry.label === 'Remove from Initiative');
    if (remove?.type !== 'item') throw new Error('no "Remove from Initiative" item');
    void remove.onClick?.();

    expect(turnHolder(store)).toBe('c');
  });

  it('by deleting its token passes the turn by a defeated combatant, as Next turn does', () => {
    const { app } = createInMemoryApp();
    const store = fight(app);
    store.setState({ initiativeTrackerOpen: true });
    render(
      <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
        <ViewStoreProvider store={store}><InitiativeTracker /></ViewStoreProvider>
      </AtlasUIContext.Provider>,
    );

    act(() => { store.getState().removeMapObjects(['a']); });

    expect(turnHolder(store)).toBe('c');
  });
});
