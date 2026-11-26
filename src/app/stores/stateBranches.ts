/**
 * What each branch of a view store's state is, declared once: saved with the scene's file,
 * undoable, started anew when the map changes, or the view's own. A new store, the scene file
 * (`partialize`, `merge`), the map switch (`clearMapState`) and the undo history read it.
 */

import type { PersistedViewState, ViewAtlasState } from '../storeFactory';
import { ATLAS_SCHEMA, ATLAS_VERSION } from '../services/MapPersistence';
import { DEFAULT_TOKEN_SETTINGS } from '../types/viewState';
import { DEFAULT_SCENE_LIGHTING } from '../types/lightingTypes';
import { createDefaultInitiativeState } from '../types/initiativeTypes';
import { createInitialLootRollerState, readLootRollerState } from './lootRollerSlice';
import { readPlayerFrames } from './playerFramesSlice';
import { readRoomSizes } from './roomsSlice';
import { readSceneSound } from '../soundLibrary/sceneSound';
import { readSceneLighting } from '../lighting/sceneLightingOptions';
import { readExploredMask } from '../lighting/exploredMaskCodec';
import { levelsForFile, readExploredMasks, readSceneLevels } from '../levels/levelFile';
import { levelAlignmentsOf, withoutAlignments } from '../levels/levelAlignment';
import { firstLevelId, viewedLevelId } from '../levels/sceneLevels';
import { withoutCollectionWidgets } from '../utils/collectionWidgets';
import { isRecord } from '../utils/guards';
import type { UndoDepths } from './history';

type Action = (...args: never[]) => unknown;

/** The keys of a view's state that hold data, not actions. */
type BranchKey = { [K in keyof ViewAtlasState]-?: NonNullable<ViewAtlasState[K]> extends Action ? never : K }[keyof ViewAtlasState];

/** A scene file's state as the store's `merge` is handed it: what `partialize` wrote, or an older Atlas did. */
type SavedState = Partial<ViewAtlasState>;

type UndoDepth = UndoDepths[string];

/** How the scene's file holds a branch. */
interface FileForm<V> {
  /** What the file holds under the branch's key; undefined leaves the key out. Unset: the branch as it is. */
  readonly write?: (state: ViewAtlasState) => unknown;
  /** What a load takes from the file. Unset: the file's value where the file has the key, else the view's. */
  readonly read?: (saved: SavedState, current: ViewAtlasState) => V;
}

type BranchPolicy<V> = {
  /** Saved with the scene. Unset: never saved, and a load keeps what the view holds. */
  readonly file?: FileForm<V>;
  /** Undoable, this deep (`UndoDepths`). Unset: no undo step ever changes it. */
  readonly undo?: UndoDepth;
} & (
  /** The scene's: a new store starts with `initial`, and a map switch puts it back. */
  | { readonly initial: () => V; readonly perScene: true }
  /** Kept when the map changes; a new store starts with `initial`, or as the slice that owns it sets it. */
  | { readonly initial?: () => V; readonly perScene?: never }
);

/** The view's own, started by the slice that owns it: never saved, kept when the map changes, never undone. */
const VIEW = {} as const;
/** Saved as the branch is, and loaded as the file has it. */
const AS_IS = {} as const;

const levelsOfFile = (saved: SavedState, current: ViewAtlasState): ViewAtlasState['levels'] => (
  readSceneLevels(saved.levels, saved.background ?? current.background)
);

// Collection-wide widgets are saved in the collection settings, not in the scene
const sceneWidgets = (state: ViewAtlasState): ReturnType<typeof withoutCollectionWidgets> => (
  withoutCollectionWidgets({ widgets: state.widgetSettings.widgets, widgetValues: state.widgetValues })
);

/**
 * Every branch of the state. A scene file holds its saved branches in the order they are declared
 * here, so moving one changes the bytes of every scene saved after.
 */
const STATE_BRANCHES = {
  schema: { file: AS_IS, initial: () => ATLAS_SCHEMA },
  version: { file: AS_IS, initial: () => ATLAS_VERSION },
  mapPath: { file: AS_IS, initial: () => null },
  // A map switch keeps it: the next map sets its own before its file is read
  background: { file: AS_IS, undo: 0, initial: () => null },
  levels: {
    file: { write: (state) => levelsForFile(state.levels, state.background, state.levelAlignments), read: (saved, current) => withoutAlignments(levelsOfFile(saved, current)) },
    initial: () => undefined,
    perScene: true,
  },
  // Each level carries its own in the file (`levelsForFile`)
  levelAlignments: { file: { write: () => undefined, read: (saved, current) => levelAlignmentsOf(levelsOfFile(saved, current)) }, undo: 1, initial: () => undefined, perScene: true },
  viewedLevel: {
    file: {
      // Left out on the first level, so files of scenes that stay there stay as they were
      write: (state) => (viewedLevelId(state) !== firstLevelId(state.levels) ? state.viewedLevel : undefined),
      // The loader chose it from the file; a later read (another device's save) moves no view
      read: (_saved, current) => current.viewedLevel,
    },
    initial: () => null,
    perScene: true,
  },
  grid: {
    file: AS_IS,
    undo: 0,
    initial: () => ({ enabled: true, visible: true, snapToGrid: true, type: 'square', size: 70, offsetX: 0, offsetY: 0, opacity: 0.5, lineType: 'solid', lineWidth: 1 }),
    perScene: true,
  },
  objects: {
    file: AS_IS,
    undo: 2,
    initial: () => ({ tokens: {}, fog: {}, pins: {}, texts: {}, drawings: {}, walls: {}, lights: {}, audios: {} }),
    perScene: true,
  },
  camera: { file: AS_IS, initial: () => ({ x: 0, y: 0, scale: 1 }), perScene: true },
  widgetValues: { file: { write: (state) => sceneWidgets(state).widgetValues }, undo: 1, initial: () => ({}), perScene: true },
  widgetSettings: {
    file: { write: (state) => ({ ...state.widgetSettings, widgets: sceneWidgets(state).widgets }) },
    initial: () => ({ widgets: {}, globalVisible: true, position: 'top', scale: 1 }),
    perScene: true,
  },
  dmNotePath: { file: AS_IS, initial: () => null, perScene: true },
  tokenSettings: { file: AS_IS, initial: () => ({ ...DEFAULT_TOKEN_SETTINGS }) },
  initiative: { file: AS_IS, initial: createDefaultInitiativeState },
  initiativeTrackerOpen: { file: AS_IS, initial: () => false },
  diceLog: { file: AS_IS, initial: () => [] },
  pinnedNotePreviews: { file: AS_IS, initial: () => ({}), perScene: true },
  lootRoller: { file: { read: (saved) => readLootRollerState(saved.lootRoller) }, initial: createInitialLootRollerState, perScene: true },
  lighting: { file: { read: (saved) => readSceneLighting(saved.lighting) }, initial: () => ({ ...DEFAULT_SCENE_LIGHTING }), perScene: true },
  exploredMask: { file: { read: (saved) => readExploredMask(saved.exploredMask) }, initial: () => null, perScene: true },
  exploredMasks: { file: { read: (saved, current) => readExploredMasks(saved.exploredMasks, levelsOfFile(saved, current)) }, initial: () => undefined, perScene: true },
  // Left out until the GM saves one, so files of scenes without stay as they were
  playerFrames: { file: { write: (state) => (state.playerFrames.length > 0 ? state.playerFrames : undefined), read: (saved) => readPlayerFrames(saved.playerFrames) }, initial: () => [], perScene: true },
  sound: { file: { write: (state) => state.sound ?? undefined, read: (saved) => readSceneSound(saved.sound) }, initial: () => null, perScene: true },
  roomSizes: { file: { read: (saved) => readRoomSizes(saved.roomSizes) }, initial: () => undefined, perScene: true },

  // Counted while the scene is open: a file never brings them
  exploredEdits: { undo: 0, initial: () => 0, perScene: true },
  turnMoves: { undo: 1, initial: () => ({}), perScene: true },
  fightsStarted: { initial: () => 0 },
  exploredForgotten: VIEW,
  // The campaign's, never the scene's
  partyValues: { undo: 1, initial: () => ({}) },
  selectedIds: { initial: () => [], perScene: true },

  persistenceEnabled: { initial: () => true },
  mapLoaded: { initial: () => false },
  isMapLoading: { initial: () => false },
  mapLoadingProgress: VIEW,
  mapLoadingMessage: VIEW,
  _audioDirty: { initial: () => false },
  isPlayerView: VIEW,
  isGMView: { initial: () => true },
  activeTool: { initial: () => 'move' },
  heldRulerFrom: VIEW,
  selectionMode: { initial: () => 'box' },
  isDragging: { initial: () => false },
  plugin: VIEW,
  roomTool: VIEW,
  tableMode: { initial: () => null },
  isGridSettingsOpen: VIEW,
  isDMScreenOpen: VIEW,
  dmScreenPage: VIEW,
  isGridAlignmentOpen: VIEW,
  isFloorPositioning: VIEW,
  isDiceLogOpen: VIEW,
  isHotkeyHelpOpen: VIEW,
  isDocsOpen: VIEW,
  isAssetManagerOpen: VIEW,
  assetManagerInitialTab: VIEW,
  assetManagerAddsCombatants: VIEW,
  assetManagerArmarium: VIEW,
  isCommandPaletteOpen: VIEW,
  commandPalettePage: VIEW,
  isDiceTrayOpen: VIEW,
  lightPopover: VIEW,
  lightZonePopover: VIEW,
  levelLinkPopover: VIEW,
  levelSurfacePopover: VIEW,
  measurePopover: VIEW,
  measureTool: VIEW,
  drawTool: VIEW,
  fogTool: VIEW,
  lightingTool: VIEW,
  toolSwitches: VIEW,
  heldTokens: VIEW,
  exploredBrush: VIEW,
  isToolbarEditing: VIEW,
  dungeonGenerator: VIEW,
  roofsHidden: VIEW,
  selectMore: VIEW,
  conditionsShownEntry: VIEW,
} satisfies { readonly [K in BranchKey]-?: BranchPolicy<ViewAtlasState[K]> };

type Branches = typeof STATE_BRANCHES;
type Policy = BranchPolicy<unknown>;
const BRANCHES = Object.entries(STATE_BRANCHES) as Array<[BranchKey, Policy]>;
const SAVED = BRANCHES.flatMap(([key, { file }]) => (file ? [[key, file] as const] : []));
const OF_SCENE = BRANCHES.filter(([, policy]) => policy.perScene);

/** The branches undo tracks, and how deep (`withHistory`). */
export const UNDO_DEPTHS: UndoDepths = Object.fromEntries(BRANCHES.flatMap(([key, { undo }]) => (undo === undefined ? [] : [[key, undo]])));

const valuesOf = (entries: Array<[BranchKey, Policy]>): Partial<ViewAtlasState> => (
  Object.fromEntries(entries.flatMap(([key, { initial }]) => (initial ? [[key, initial()]] : [])))
);

/** The branches a declaration starts. */
type Started = { [K in keyof Branches]: Branches[K] extends { readonly initial: () => unknown } ? K : never }[keyof Branches];

/** The state a new view store starts with, where the declarations start it. */
export function initialBranches(): Pick<ViewAtlasState, Started> {
  return valuesOf(BRANCHES) as Pick<ViewAtlasState, Started>;
}

/** What a map switch puts back: every branch of the scene as a new store starts it. */
export function clearedScene(): Partial<ViewAtlasState> {
  return valuesOf(OF_SCENE);
}

/** The state the scene's file holds (`partialize`); nothing while the view does not save. */
export function savedBranches(state: ViewAtlasState): PersistedViewState {
  if (!state.persistenceEnabled) return {};
  const saved: Record<string, unknown> = {};
  for (const [key, file] of SAVED) {
    const value = file.write ? file.write(state) : state[key];
    if (value !== undefined) saved[key] = value;
  }
  return saved;
}

/** The state once the scene's file is read (`merge`): the file's saved branches, checked where they need it, and the view's own. */
export function loadedBranches(persisted: unknown, current: ViewAtlasState): ViewAtlasState {
  const saved: SavedState = isRecord(persisted) ? persisted : {};
  const loaded: Record<string, unknown> = { ...current };
  for (const [key, file] of SAVED) {
    if (file.read) loaded[key] = file.read(saved, current);
    else if (Object.hasOwn(saved, key)) loaded[key] = saved[key];
  }
  return loaded as unknown as ViewAtlasState;
}
