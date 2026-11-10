import { isFiniteNumber, isRecord, isStringArray } from '../utils/guards';
import { readLootRoll, type LootRoll } from '../loot/lootHistory';
import type { PanelArea, PanelPosition } from '../react/hooks/useDraggablePosition';

/**
 * The loot roller window of a map: where it floats, which base views it rolls on
 * and its latest roll. Saved in the map file, so every map keeps its own; the
 * history of all rolls belongs to the collection (`LootHistoryStore`).
 */

export const LOOT_MAX_COUNT = 10;
/** A vault path and a table's place; anything longer is no table id. */
const MAX_SELECTED_LENGTH = 1024;
/** No collection names more rarity words. */
const MAX_EXCLUDED = 32;

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
  /** The collection's rarity words switched off for rolls, in lower case; every word is on by default. */
  excludedRarities: string[];
  count: number;
  pane: LootPane;
  /** The table rolled on: a table of a note (`<path>#<index>`) or a loot base (its path); the first one while unset. */
  selected?: string;
  lastRoll?: LootRoll;
}

export type LootRollerSettings = Partial<Pick<LootRollerState, 'position' | 'size' | 'disabledViews' | 'excludedRarities' | 'count' | 'pane' | 'selected'>>;

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
  const { open, position, size, disabledViews, excludedRarities, count, pane, selected, lastRoll } = value;
  const roll = readLootRoll(lastRoll);
  return {
    open: open === true,
    ...(isRecord(position) && isFiniteNumber(position.x) && isFiniteNumber(position.y)
      && { position: { x: position.x, y: position.y } }),
    ...(isRecord(size) && isFiniteNumber(size.width) && isFiniteNumber(size.height) && size.width > 0 && size.height > 0
      && { size: { width: size.width, height: size.height } }),
    disabledViews: isStringArray(disabledViews) ? disabledViews : [],
    excludedRarities: isStringArray(excludedRarities) ? excludedRarities.slice(0, MAX_EXCLUDED).map((name) => name.toLowerCase()) : [],
    count: isFiniteNumber(count) ? clampCount(count) : state.count,
    pane: pane === 'history' ? 'history' : 'results',
    ...(typeof selected === 'string' && selected.length > 0 && selected.length <= MAX_SELECTED_LENGTH && { selected }),
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
