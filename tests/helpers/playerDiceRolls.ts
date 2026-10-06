import { EventEmitter } from 'events';
import { act } from '@testing-library/react';
import { vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { App } from 'obsidian';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import type { TokenPerception } from '../../src/app/pixi/lighting/playerLightingLayers';
import { shownRollTokens } from '../../src/app/pixi/playerRollTokens';
import type { PlayerFrameSource } from '../../src/app/services/PlayerFrameMirror';
import type { PlayerRollSources } from '../../src/app/services/playerRollSource';
import { PlayerWindowService } from '../../src/app/services/PlayerWindowService';
import { SettingsService } from '../../src/app/services/SettingsService';
import type { DiceRollOrigin } from '../../src/app/types/diceRollOrigin';
import type { DiceRollResult } from '../../src/app/types/diceTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { attachFakePlayerWindow } from '../mocks/playerPopout';

export const MAP_A = 'maps/a.atlasmap';
export const MAP_B = 'maps/b.atlasmap';
export const MAP_C = 'maps/c.atlasmap';
export const VIEW_ID = 'view-1';

type SceneTokens = Record<string, Record<string, unknown>>;

/** A hidden goblin and a wolf with its own art and ring, on scene A. */
export const SCENE_A_TOKENS: SceneTokens = {
  goblin: { id: 'goblin', kind: 'character', name: 'Goblin Boss', x: 0, y: 0, imagePath: 'tokens/goblin.webp', isHidden: true },
  wolf: { id: 'wolf', kind: 'character', name: 'Wolf', x: 0, y: 0, imagePath: 'tokens/wolf.webp', ringColor: '#aa0000' },
};

/** Scene B reuses the id `wolf` for another creature. */
export const SCENE_B_TOKENS: SceneTokens = {
  wolf: { id: 'wolf', kind: 'character', name: 'Bone Hound', x: 0, y: 0, imagePath: 'tokens/hound.webp', ringColor: '#0000aa' },
};

/** The store of a view holding `mapPath`, loaded. */
export function sceneState(mapPath: string, tokens: SceneTokens): Partial<ViewAtlasState> {
  return { mapPath, mapLoaded: true, isMapLoading: false, objects: { tokens } } as unknown as Partial<ViewAtlasState>;
}

export interface PlayerDiceHarness {
  app: App;
  settings: SettingsService;
  store: StoreApi<ViewAtlasState>;
  bus: EventEmitter;
  doc: Document;
  service: PlayerWindowService;
  /** How the players' frame perceives tokens; unset sees all that is not hidden. */
  perception: { current: TokenPerception | undefined };
  /** How often any presented scene was asked which tokens it shows. */
  shownTokens: ReturnType<typeof vi.fn>;
  /** The frame source the view renders for the scene its store holds now. */
  sourceFor(diceEvents?: EventEmitter): PlayerFrameSource;
}

/** Answers for `mapPath` from the store as the view's renderer does. */
export function rollSourcesFor(
  store: StoreApi<ViewAtlasState>, mapPath: string, perception: () => TokenPerception | undefined, count: (ids?: readonly string[]) => void = () => undefined,
): PlayerRollSources {
  return {
    viewId: VIEW_ID,
    mapPath,
    shownTokens: (ids) => {
      count(ids);
      const state = store.getState();
      const drawn = Object.fromEntries(Object.keys(state.objects?.tokens ?? {}).map((id) => [id, {}]));
      return shownRollTokens(state, mapPath, drawn, perception, ids);
    },
  };
}

/** A player window showing the rolls, and the token names, of a view whose store holds scene A. */
export function setupPlayerDice(display: 'card' | 'full' = 'card'): PlayerDiceHarness {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const { app } = createInMemoryApp({ files: {
    'tokens/wolf.webp': '', 'tokens/hound.webp': '', 'tokens/goblin.webp': '', 'tokens/statblock-wolf.webp': '',
  } });
  const settings = new SettingsService(app);
  settings.setDiceDisplay(display);
  const store = createStore(() => sceneState(MAP_A, SCENE_A_TOKENS)) as unknown as StoreApi<ViewAtlasState>;
  const service = new PlayerWindowService(app, store, settings);
  const bus = new EventEmitter();
  const perception: PlayerDiceHarness['perception'] = { current: undefined };
  const shownTokens = vi.fn();
  const sourceFor = (diceEvents = bus): PlayerFrameSource => ({
    canvas: createEl('canvas'), withPlayerSafeFrame: vi.fn(), store, diceEvents,
    rollSources: rollSourcesFor(store, store.getState().mapPath ?? '', () => perception.current, shownTokens),
  });
  const doc = attachFakePlayerWindow(service, sourceFor());
  act(() => settings.setLocalPlayerViewSettings({ showDiceRolls: true, showTokenNameplates: true }));
  return { app, settings, store, bus, doc, service, perception, shownTokens, sourceFor };
}

export const WOLF_BITE: NonNullable<DiceRollResult['source']> = {
  type: 'statblock', tokenId: 'wolf', statblockPath: 'Bestiary/Wolf.md', tokenName: 'Wolf', tokenImagePath: 'tokens/statblock-wolf.webp', abilityName: 'Bite',
};

export const originOf = (mapPath: string, tokenId = 'wolf', viewId = VIEW_ID): DiceRollOrigin => ({ viewId, mapPath, tokenId });

let rollCount = 0;

/** Emits a roll of 17 on `bus` as the dice tool does, with its origin as the second argument. */
export function emitRoll(bus: EventEmitter, source?: DiceRollResult['source'], origin?: DiceRollOrigin): DiceRollResult {
  const result: DiceRollResult = {
    id: `roll-${++rollCount}`, timestamp: 0, formula: '1d20+4', rolls: [{ die: 'd20', value: 13, max: 20 }], modifiers: 4, total: 17,
    ...(source ? { source } : {}),
  };
  act(() => { bus.emit('dice-rolled', result, origin); });
  return result;
}

/** The text of every result card, oldest first. */
export const cardTexts = (doc: Document): string[] => [...doc.querySelectorAll('.atlas-dice-toast')].map((card) => card.textContent ?? '');

/** The newest result card. */
export const lastCard = (doc: Document): Element | null => [...doc.querySelectorAll('.atlas-dice-toast')].pop() ?? null;
