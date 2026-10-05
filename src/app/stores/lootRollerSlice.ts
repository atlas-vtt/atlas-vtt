import { isFiniteNumber, isRecord, isStringArray } from '../utils/guards';
import { readLootRoll, type LootRoll } from '../loot/lootHistory';
import { isRarityTone, type RarityTone } from '../loot/lootRarity';
import type { PanelArea, PanelPosition } from '../react/hooks/useDraggablePosition';

/**
 * The loot roller window of a map: where it floats, which base views it rolls on
 * and its latest roll. Saved in the map file, so every map keeps its own; the
 * history of all rolls belongs to the collection (`LootHistoryStore`).
 */

export const LOOT_MAX_COUNT = 10;

/** The list on the right: the latest roll, or every roll of the collection. */
export type LootPane = 'results' | 'history';

export interface LootRollerState {
  open: boolean;
  /** Top-left corner inside the map view; absent until the window is first placed. */
  position?: PanelPosition;
  /** Set once the window has been resized; until then it takes its default size. */
  size?: PanelArea;
  /** Base views switched off in the source list, by view id (`lootViewId`). */
  disabledViews: string[];
  /** Rarities switched off for rolls; every rarity is on by default. */
  excludedRarities: RarityTone[];
  count: number;
  pane: LootPane;
  lastRoll?: LootRoll;
}

export type LootRollerSettings = Partial<Pick<LootRollerState, 'position' | 'size' | 'disabledViews' | 'excludedRarities' | 'count' | 'pane'>>;

export interface LootRollerSlice {
  lootRoller: LootRollerState;
  setLootRollerOpen: (open: boolean) => void;
  updateLootRoller: (settings: LootRollerSettings) => void;
  /** Shows a roll as the latest result. */
  showLootRoll: (roll: LootRoll) => void;
}

export function createInitialLootRollerState(): LootRollerState {
  return { open: false, disabledViews: [], excludedRarities: [], count: 1, pane: 'results' };
}

function clampCount(value: number): number {
  return Math.min(LOOT_MAX_COUNT, Math.max(1, Math.round(value)));
}

/**
 * The loot roller state saved in a map file, which arrives unchecked. Runs
 * once when the map loads; the store holds only checked state after that.
 */
export function readLootRollerState(value: unknown): LootRollerState {
  const state = createInitialLootRollerState();
  if (!isRecord(value)) return state;
  const { open, position, size, disabledViews, excludedRarities, count, pane, lastRoll } = value;
  const roll = readLootRoll(lastRoll);
  return {
    open: open === true,
    ...(isRecord(position) && isFiniteNumber(position.x) && isFiniteNumber(position.y)
      && { position: { x: position.x, y: position.y } }),
    ...(isRecord(size) && isFiniteNumber(size.width) && isFiniteNumber(size.height) && size.width > 0 && size.height > 0
      && { size: { width: size.width, height: size.height } }),
    disabledViews: isStringArray(disabledViews) ? disabledViews : [],
    excludedRarities: Array.isArray(excludedRarities) ? excludedRarities.filter(isRarityTone) : [],
    count: isFiniteNumber(count) ? clampCount(count) : state.count,
    pane: pane === 'history' ? 'history' : 'results',
    ...(roll && { lastRoll: roll }),
  };
}

type ImmerSet = (fn: (draft: Pick<LootRollerSlice, 'lootRoller'>) => void) => void;

export function createLootRollerActions(set: ImmerSet): Omit<LootRollerSlice, 'lootRoller'> {
  return {
    setLootRollerOpen: (open) => set((draft) => {
      draft.lootRoller.open = open;
    }),
    updateLootRoller: (settings) => set((draft) => {
      Object.assign(draft.lootRoller, settings);
      if (settings.count !== undefined) draft.lootRoller.count = clampCount(settings.count);
    }),
    showLootRoll: (roll) => set((draft) => {
      draft.lootRoller.lastRoll = roll;
      draft.lootRoller.pane = 'results';
    }),
  };
}
