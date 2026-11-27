import type { App } from 'obsidian';
import type { SceneLevels } from '../../../levels/sceneLevels';
import type { AtlasView } from '../../../atlas-view';
import { zoomToTokenWithHighlight } from '../../../pixi/utils/tokenHighlight';
import { mapResources } from '../../../resources/collectionResources';
import type { ResourceDefinition } from '../../../resources/resourceTypes';
import { mapInitiativeRules } from '../../../services/mapInitiativeRules';
import { rulesLookup } from '../../../services/mapRules';
import { remoteMapView } from '../../../soundRemote/remoteMapView';
import type { DiceRollResult } from '../../../types/diceTypes';
import type { TokenUpdates } from '../../../types/viewState';
import type { TokenEntity } from '../../../types';
import type { InitiativeRules } from '../../../types/initiativeRulesTypes';
import type { InitiativeState } from '../../../types/initiativeTypes';
import { isOffMap } from '../../../tokens/offMap';

/** What the Statblocks screen reads of a map view's scene, as the DM screen reads it. */
export interface FrontSceneState {
  readonly mapPath: string | null;
  readonly mapLoaded: boolean;
  readonly isMapLoading: boolean;
  readonly objects: { readonly tokens: Readonly<Record<string, TokenEntity>> };
  readonly initiative: InitiativeState;
  /** Whether the map numbers look-alikes (`showInstanceBadges`); on where unset. */
  readonly tokenSettings?: { readonly showInstanceBadges?: boolean };
  readonly levels?: SceneLevels;
}

/** The map the GM has in front: its scene, and what the DM screen's token controls do there. */
export interface FrontScene {
  readonly viewId: string;
  state(): FrontSceneState;
  /** Calls `listener` after every change of the scene; returns what stops it. */
  subscribe(listener: () => void): () => void;
  /** The resources of the rules its map plays by. */
  definitions(): readonly ResourceDefinition[];
  /** The initiative rules its map plays by. */
  rules(): InitiativeRules;
  updateToken(id: string, updates: TokenUpdates): void;
  locateToken(id: string): void;
  /**
   * Calls `listener` with every roll its map's dice tool makes, as it is made (`dice-rolled`), before the map's other dice
   * listeners, so one of them that throws cannot hide a roll that was made; returns what stops it.
   */
  watchRolls(listener: (result: DiceRollResult) => void): () => void;
}

/** Which map the GM has in front, and word when that may have changed. */
export interface FrontScenes {
  current(): FrontScene | null;
  /** Calls `listener` whenever another map may have come to the front; returns what stops it. */
  watch(listener: () => void): () => void;
}

function frontSceneOf(app: App, view: AtlasView): FrontScene {
  const store = view.getStore();
  return {
    viewId: view.viewId,
    state: () => store.getState(),
    subscribe: (listener) => store.subscribe(listener),
    definitions: () => mapResources(rulesLookup(app), store.getState().mapPath),
    rules: () => mapInitiativeRules(app, store.getState().mapPath),
    updateToken: (id, updates) => store.getState().updateToken(id, updates),
    locateToken: (id) => {
      const token = store.getState().objects.tokens[id];
      // A combatant kept beside the map has no place on it to show
      if (token && !isOffMap(token)) zoomToTokenWithHighlight(view, id, { x: token.x, y: token.y });
    },
    watchRolls: (listener) => {
      const bus = view.serviceManager.getEventBus();
      const rolled = (result: DiceRollResult): void => listener(result);
      bus.prependListener('dice-rolled', rolled);
      return () => void bus.off('dice-rolled', rolled);
    },
  };
}

/** The map view the GM has in front (`remoteMapView`, as the Stream Deck's keys act on it), followed through the workspace. */
export function atlasFrontScenes(app: App): FrontScenes {
  return {
    current: () => {
      const view = remoteMapView(app.workspace);
      return view ? frontSceneOf(app, view) : null;
    },
    watch: (listener) => {
      const refs = [app.workspace.on('active-leaf-change', listener), app.workspace.on('layout-change', listener)];
      return () => refs.forEach((ref) => app.workspace.offref(ref));
    },
  };
}
