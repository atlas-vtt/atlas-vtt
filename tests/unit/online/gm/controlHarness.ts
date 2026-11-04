import type { GmMessage, SharedGrid, SharedToken } from '../../../../src/app/online/protocol/index.ts';
import type { ResourceDefinition } from '../../../../src/app/resources/resourceTypes';
import { runUntracked } from '../../../../src/app/stores/history';
import type { TokenEntity } from '../../../../src/app/types';
import type { ConditionDefinition } from '../../../../src/app/types/collectionSettingsTypes';
import type { GridState } from '../../../../src/app/types/gridTypes';
import type { SceneLightingChanges } from '../../../../src/app/types/lightingTypes';
import type { TokenUpdates, ViewState } from '../../../../src/app/types/viewState';
import type { SceneState, SceneStore } from '../../../../src/app/online/gm/atlasView.ts';
import { MAP_LAYER_INTERVAL_MS } from '../../../../src/app/online/gm/MapLayerShare.ts';
import { TOKEN_INTERVAL_MS, TOKEN_POLL_MS } from '../../../../src/app/online/gm/TokenShare.ts';
import { fakeLayers, gmGridOptions } from './fakeAtlasTab.ts';
import { GENERIC_SOURCE, PLAYER_SETTINGS } from './gmLighting.ts';
import { sceneState, shareHarness, tokenLists, type ShareHarness } from './shareHarness.ts';

/**
 * A GM whose scene lives in Atlas's own view store, shared as the companion shares it, for tests of
 * the GM's controls: a test writes them through the store's actions, and through `table.settings`
 * (Atlas's player view settings) and `table.rules` (the collection's resources and conditions).
 */

/** Atlas's view store with the actions the GM's controls write through. */
export type ControlStore = Omit<SceneStore, 'getState'> & {
  getState(): SceneState & Pick<ViewState, 'tokenSettings'> & {
    setPersistenceEnabled(enabled: boolean): void;
    setGrid(grid: GridState): void;
    setGridVisible(visible: boolean): void;
    setTokenSettings(settings: ViewState['tokenSettings']): void;
    updateTokens(entries: { id: string; changes: TokenUpdates }[]): void;
    setSceneLighting(changes: SceneLightingChanges): void;
  };
};

/** Atlas's `createViewAtlasStore`, which each test file imports by `STORE_FACTORY` (a computed path the type checker does not follow). */
export type ControlStoreFactory = (app: unknown, viewId: string) => ControlStore;

const MAP = new Map([['maps/cave.webp', new Uint8Array([7, 7, 7])]]);
const BOUNDS = { width: 2000, height: 2000 };
export const GRID: GridState = { enabled: true, visible: true, snapToGrid: true, type: 'square', size: 70, offsetX: 0, offsetY: 0, opacity: 0.7 };

export const resource = (key: string, slot: number, changes: Partial<ResourceDefinition> = {}): ResourceDefinition => ({
  key, name: key.toUpperCase(), field: key, direction: 'drains', color: '#22c55e', visibleToPlayers: true, slot, ...changes,
});
export const RESOURCES: ResourceDefinition[] = [resource('hp', 0, { color: '#dc2626', defeatedWhenSpent: true }), resource('str', 1, { visibleToPlayers: false, color: '#0ea5e9' })];
export const CONDITIONS: ConditionDefinition[] = [{ id: 'frightened', name: 'Frightened', color: '#a855f7', valued: true }];

export function creature(id: string, x: number, changes: Partial<TokenEntity> = {}): TokenEntity {
  return {
    id, kind: 'character', name: `Name-of-${id}`, x, y: 105, imagePath: `art/${id}.webp`,
    resources: { hp: { current: 13, max: 31 }, str: { current: 41, max: 47 } }, ...changes,
  };
}

export interface Gm {
  readonly store: ControlStore;
  readonly table: ShareHarness;
  /** Lets the companion catch up with a store write (`TOKEN_INTERVAL_MS`) or, after a settings change, its poll. */
  readonly settle: (ms?: number) => Promise<void>;
  /** The last token list players hold, by GM id (the list's own order is the drawing order). */
  readonly tokens: () => Map<string, SharedToken>;
  readonly grid: () => SharedGrid | null | undefined;
}

/** A real Atlas view store with the scene loaded, shared with Atlas's defaults: grid shown to players, nameplates not. */
export async function gm(createViewAtlasStore: ControlStoreFactory, tokens: readonly TokenEntity[] = [creature('ogre', 105), creature('bear', 245)]): Promise<Gm> {
  const store = createViewAtlasStore({}, 'control-test');
  store.getState().setPersistenceEnabled(false);
  runUntracked(store as never, () => store.setState((draft) => {
    Object.assign(draft, { mapLoaded: true, isMapLoading: false, mapPath: 'Scenes/Cave.atlasmap', background: 'maps/cave.webp', grid: GRID });
    draft.objects.tokens = Object.fromEntries(tokens.map((token) => [token.id, token]));
  }));
  const table = shareHarness(sceneState(), MAP, undefined, store);
  table.settings = { ...PLAYER_SETTINGS, showNames: false };
  table.rules = { resources: RESOURCES, conditions: CONDITIONS };
  table.layers = fakeLayers({ state: () => store.getState(), source: GENERIC_SOURCE, bounds: BOUNDS, grid: () => gmGridOptions(store.getState()) });
  table.share.start();
  await table.advance(TOKEN_POLL_MS);
  const lastOf = <T extends GmMessage['t']>(t: T): Extract<GmMessage, { t: T }> | undefined => table.sent.flatMap(({ body }) => (body.t === t ? [body as Extract<GmMessage, { t: T }>] : [])).at(-1);
  // The players' ids, back to the GM's: aliases are handed out in the store's order on the first list.
  const ids = new Map((tokenLists(table.sent)[0]?.tokens ?? []).map((token, index) => [token.id, tokens[index]?.id ?? '']));
  return {
    store,
    table,
    settle: (ms = TOKEN_INTERVAL_MS + MAP_LAYER_INTERVAL_MS) => table.advance(ms),
    tokens: () => new Map((tokenLists(table.sent).at(-1)?.tokens ?? []).map((token) => [ids.get(token.id) ?? token.id, token])),
    grid: () => lastOf('grid')?.grid,
  };
}
