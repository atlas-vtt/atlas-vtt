/**
 * Resources in the remote view: the stand-in definitions its owner feeds per token, drawn by
 * Atlas's own token UI as the player window draws them: bars, no numbers on hover or selection,
 * and a definition players may not see marks a token downed without drawing a bar.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Text } from 'pixi.js';
import { TokenUIRenderer } from '../../src/app/pixi/TokenUIRenderer';
import { isTokenDowned } from '../../src/app/pixi/token-renderer/isTokenDowned';
import { TokenCollectionSync } from '../../src/app/plugin/TokenCollectionSync';
import type { ResourceDefinition } from '../../src/app/resources/resourceTypes';
import { RemoteViewScene } from '../../src/app/remote-view/RemoteViewScene';
import { resolveMeasurementSettings } from '../../src/app/grid/measurementFormat';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { Character, TokenEntity } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { remoteScene } from './remoteSceneFixtures';

const BAR: ResourceDefinition = { key: 'bar0', name: 'Bar', field: '', direction: 'drains', color: '#22c55e', visibleToPlayers: true, slot: 0 };
const DOWNED: ResourceDefinition = { key: 'downed', name: 'Downed', field: '', direction: 'drains', color: '#ef4444', defeatedWhenSpent: true, visibleToPlayers: false };
const character = (id: string, resources: Character['resources']): Character => ({ id, kind: 'character', x: 70, y: 70, imagePath: '', name: id, resources });

function remoteStore(): ReturnType<typeof createViewAtlasStore> {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, 'remote-resources', undefined, false, { remote: true });
  const scene = new RemoteViewScene({ app, viewId: 'remote-resources', atlasStore: store, containerEl: document.createElement('div'), renderer: null });
  scene.setScene(remoteScene({ objects: {
    tokens: {
      hurt: character('hurt', { bar0: { current: 5, max: 10 }, downed: { current: 1, max: 1 } }),
      fallen: character('fallen', { bar0: { current: 9, max: 10 }, downed: { current: 0, max: 1 } }),
    },
    texts: {}, drawings: {}, fog: {},
  } }));
  scene.setPlayer({
    movableTokenIds: [], measurement: resolveMeasurementSettings(undefined, null),
    tokenUi: { conditions: [], resources: { hurt: [BAR, DOWNED], fallen: [BAR, DOWNED] } },
    initiative: { rules: null, health: {} },
  });
  return store;
}

const tokenOf = (store: ReturnType<typeof remoteStore>, id: string): TokenEntity => store.getState().objects.tokens[id]!;
/** The resources the token renderer reads, through the same collection sync it builds. */
const definitionsOf = (store: ReturnType<typeof remoteStore>) => (id?: string): readonly ResourceDefinition[] =>
  new TokenCollectionSync(createInMemoryApp().app, store.getState, { refreshRules: () => undefined, refreshArt: async () => undefined }).resources(id);

function tokenUi(store: ReturnType<typeof remoteStore>): TokenUIRenderer {
  const ui = new TokenUIRenderer(store);
  ui.resourceDefsProvider = definitionsOf(store);
  return ui;
}

function mockCanvas(): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    createLinearGradient: () => ({ addColorStop: vi.fn() }), fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(Text.prototype, 'getLocalBounds').mockReturnValue({ width: 80, height: 20 } as never);
}

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

describe('resources in the remote view', () => {
  it('answers with the definitions fed for each token, and none for any other, never reading a collection', () => {
    const store = remoteStore();
    expect(definitionsOf(store)('hurt').map((definition) => definition.key)).toEqual(['bar0', 'downed']);
    expect(definitionsOf(store)('nobody')).toEqual([]);
    expect(definitionsOf(store)()).toEqual([]);
  });

  it('shows no numbers on hover or selection, where a GM view reveals them', () => {
    mockCanvas();
    const remote = remoteStore();
    const ui = tokenUi(remote);
    try {
      ui.update(tokenOf(remote, 'hurt'), 70);
      ui.setHoverState(true);
      ui.setSelectionState(true);
      expect((ui as unknown as { resources: { getTextAlpha(): number } }).resources.getTextAlpha()).toBe(0);
    } finally { ui.destroy(); }

    const { app } = createInMemoryApp();
    const gm = createViewAtlasStore(app, 'gm-view');
    const gmUi = new TokenUIRenderer(gm);
    gmUi.resourceDefsProvider = () => [BAR];
    try {
      gmUi.update(tokenOf(remote, 'hurt'), 70);
      gmUi.setHoverState(true);
      expect((gmUi as unknown as { resources: { getTextAlpha(): number } }).resources.getTextAlpha()).toBeGreaterThan(0);
    } finally { gmUi.destroy(); }
  });

  it('draws no bar for a definition players may not see, which still downs the token', () => {
    mockCanvas();
    const store = remoteStore();
    // Decided per token: nothing is hidden map-wide.
    expect(store.getState().tokenSettings.hiddenResources).toEqual([]);
    const ui = tokenUi(store);
    try {
      ui.update(tokenOf(store, 'fallen'), 70);
      expect(ui.getResourceSlots().map((slot) => slot.key)).toEqual(['bar0']);
    } finally { ui.destroy(); }
    expect(isTokenDowned(tokenOf(store, 'fallen'), definitionsOf(store)('fallen'))).toBe(true);
    expect(isTokenDowned(tokenOf(store, 'hurt'), definitionsOf(store)('hurt'))).toBe(false);
  });

  it('decides per token: a key hidden on one token still draws its bar on another', () => {
    mockCanvas();
    const { app } = createInMemoryApp();
    const store = createViewAtlasStore(app, 'remote-shared-key', undefined, false, { remote: true });
    const scene = new RemoteViewScene({ app, viewId: 'remote-shared-key', atlasStore: store, containerEl: document.createElement('div'), renderer: null });
    scene.setScene(remoteScene({ objects: {
      tokens: { secret: character('secret', { bar0: { current: 5, max: 10 } }), open: character('open', { bar0: { current: 5, max: 10 } }) },
      texts: {}, drawings: {}, fog: {},
    } }));
    scene.setPlayer({
      movableTokenIds: [], measurement: resolveMeasurementSettings(undefined, null),
      tokenUi: { conditions: [], resources: { secret: [{ ...BAR, visibleToPlayers: false }], open: [BAR] } },
      initiative: { rules: null, health: {} },
    });
    const slots = (id: string): string[] => {
      const ui = tokenUi(store);
      try {
        ui.update(tokenOf(store, id), 70);
        return ui.getResourceSlots().map((slot) => slot.key);
      } finally { ui.destroy(); }
    };
    expect(slots('secret')).toEqual([]);
    expect(slots('open')).toEqual(['bar0']);
  });
});
