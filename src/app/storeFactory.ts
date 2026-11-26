import type { ViewState, TokenInput, TokenUpdates } from './types/viewState';
import type { ResourceDefinition } from './resources/resourceTypes';
import { defeatedResources, restedResources } from './resources/resourceValues';
import { create } from "zustand";
import type { Mutate, StoreApi } from "zustand";
import { subscribeWithSelector, persist } from "zustand/middleware";
import type { StorageValue } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { App, Plugin } from 'obsidian';
import type AtlasVTTPlugin from '../../main';
import type { TokenEntity, NotePin } from './types';
import type { SceneLightingChanges, SceneLightingOption } from './types/lightingTypes';
import type { AnyWidget, WidgetSettings } from './types/widgetTypes';
import type { InitiativeEntry } from './types/initiativeTypes';
import type { SideId } from './types/initiativeRulesTypes';
import { createAtlasStorage, ATLAS_VERSION } from './services/MapPersistence';
import type { CameraState, GridState } from './types/gridTypes';
import type { AtlasPersistStorage } from './services/MapPersistence';
import { normalizeImagePath } from './utils/pathUtils';
import { createInitiativeActions } from './stores/initiativeSlice';
import type { FightBinding } from './stores/initiativeFightStart';
import { followTokensInTracker } from './stores/combatantTokens';
import { createSceneObjectsActions, type SceneObjectsSlice } from './stores/sceneObjectsSlice';
import type { InitiativeTurnActions } from './stores/initiativeTurnActions';
import { createInitialUIState, createUIActions, type UISlice } from './stores/uiSlice';
import { loadDrawTool, saveDrawTool } from './services/deviceSettings';
import { loadStabilizer, saveStabilizer } from './services/roomToolMemory';
import { createPinnedNotePreviewActions, type PinnedNotePreviewSlice } from './stores/pinnedNotePreviewSlice';
import { createLootRollerActions, type LootRollerSlice } from './stores/lootRollerSlice';
import { newId } from './utils/ids';
import { withHistory } from './stores/history';
import { withWidgetOff } from './utils/widgetActivation';
import type { TimerState } from './utils/timerWidget';
import { createMapObjectsActions, type MapObjectsSlice } from './stores/mapObjectsSlice';
import { withoutOffMap } from './tokens/offMap';
import { diceRandom } from './services/offlineDiceInputs';
import { rulesLookup } from './services/mapRules';
import type { MapMove } from './grid/mapStretch';
import { objectsMovedWithMap } from './grid/mapStretchObjects';
import { computeNextInstanceNumber } from './stores/tokenInstanceNumbers';
import { placeTokens, raiseTokens, type TokenPlace } from './stores/tokenStacking';
import type { ArtFloors } from './levels/levelSurfaces';
import type { DiceRollResult } from './types/diceTypes';
import { isAtlasToolAvailable } from './tools/toolAvailability';
import { clampLitThreshold } from './lighting/sceneLightingOptions';
import { isPinLabelKind, nextPinLabel } from './tools/pinLabels';
import { movedFolderPathOf, movedPathOf, rewriteMapReferences } from './services/renamedPaths';
import { clearConditions, conditionValue, removeCondition, setConditionValue } from './utils/conditionValues';
import { HydrationTracker } from './stores/hydrationTracker';
import { isolateListeners } from './stores/isolatedListeners';
import { placedOnViewedLevel } from './levels/sceneLevels';
import { createSceneLevelsActions, writeExploredMask, type SceneLevelsSlice } from './stores/sceneLevelsSlice';
import { createMapFeaturesActions, type MapFeaturesSlice } from './stores/mapFeaturesSlice';
import { createRoomsSlice, DEFAULT_ROOM_TOOL, type RoomsSlice } from './stores/roomsSlice';
import { createTableModeActions, type TableModeSlice } from './stores/tableModeSlice';
import { createLiquidsActions, type LiquidsSlice } from './stores/liquidsSlice';
import { createMeasuresActions, type MeasuresSlice } from './stores/measuresSlice';
import { createAnnotationsActions, type AnnotationsSlice } from './stores/annotationsSlice';
import { createFogActions, type FogSlice } from './stores/fogSlice';
import { createTurnMovesActions, type TurnMovesSlice } from './stores/turnMovesSlice';
import { createPlayerFramesActions, type PlayerFramesSlice } from './stores/playerFramesSlice';
import { readSceneSound } from './soundLibrary/sceneSound';
import type { SceneSound } from './sound/soundTypes';
import { movesWithFrame } from './levels/levelAlignment';
import { clearedScene, initialBranches, loadedBranches, savedBranches, UNDO_DEPTHS } from './stores/stateBranches';
import { levelsCarriedWithGrid, type CarriedLevels, type GridCarryScene } from './levels/levelGridCarry';

// Individual store state interface (same as AtlasState but isolated)
export interface ViewAtlasState extends ViewState {
  setMapPath: (path: string | null) => void;
  setPersistenceEnabled: (enabled: boolean) => void;
  setMapLoaded: (loaded: boolean) => void;
  setMapLoading: (loading: boolean, progress?: number, message?: string) => void;
  setBackground: (bg: string | null) => void;
  setGrid: (grid: GridState) => void;
  /**
   * Sets an aligned grid. Where the alignment draws the map another way (`GridState.mapStretch`),
   * `move` takes what stands on the map along (`objectsMovedWithMap`), in the same write.
   */
  alignGrid: (grid: GridState, move?: MapMove) => void;
  setGridUnits: (units: { unitType: 'feet' | 'yards' | 'meters' | 'units'; unitDistance: number }) => void;
  setGridVisible: (visible: boolean) => void;
  setSnapToGrid: (snap: boolean) => void;
  setCamera: (partial: Partial<CameraState>) => void;

  // Token actions
  /** Adds several tokens in one store write, so spawning a group is a single undo step. */
  addTokens: (data: TokenInput[]) => string[];

  moveToken: (id: string, x: number, y: number) => void;
  updateToken: (id: string, updates: TokenUpdates) => void;
  /** Applies several token updates in one store write, so they form a single undo step. */
  updateTokens: (entries: Array<{ id: string; changes: TokenUpdates }>) => void;
  /** Points tokens and pins that name a vault file at the path it was renamed to. */
  retargetRenamedFile: (oldPath: string, newPath: string) => void;
  /** Points what the scene names at or below a renamed folder (a pin's folder of encounters) at its new place. */
  retargetRenamedFolder: (oldPath: string, newPath: string) => void;
  setTokens: (map: Record<string, TokenEntity>) => void;
  setTokenRing: (id: string, color: string | null) => void;
  /** Adds (`active`) or removes a condition on every token in one store write, so it is a single undo step. */
  setTokensCondition: (tokenIds: string[], conditionId: string, active: boolean) => void;
  /**
   * Raises or lowers a valued condition by `delta` on every token in one store write:
   * a token without it gains it at `delta`, one that falls to 0 loses it.
   */
  changeTokensConditionValue: (tokenIds: string[], conditionId: string, delta: number) => void;
  /**
   * Sets a valued condition to `value` on every token in one store write: a token without it gains
   * it, and a value of 0 or less, or null, takes it off.
   */
  setTokensConditionValue: (tokenIds: string[], conditionId: string, value: number | null) => void;
  clearTokenConditions: (id: string) => void;
  /** Spends every resource of `definitions` that defeats a token. */
  killTokens: (ids: string[], definitions: readonly ResourceDefinition[]) => void;
  /** Returns every resource of `definitions` to its start and clears conditions. */
  resetTokens: (ids: string[], definitions: readonly ResourceDefinition[]) => void;

  // Note Pin actions
  /** With `hex`, the note is linked to the hex containing (x, y) rather than pinned to the point. */
  addNotePin: (x: number, y: number, notePath: string, icon?: string, options?: { hex?: boolean; sceneLevel?: string; showName?: boolean }) => string;

  // Drawings and texts (from annotationsSlice.ts)
  addText: AnnotationsSlice['addText'];
  updateText: AnnotationsSlice['updateText'];
  setTexts: AnnotationsSlice['setTexts'];
  addDrawing: AnnotationsSlice['addDrawing'];
  addDrawings: AnnotationsSlice['addDrawings'];
  setDrawings: AnnotationsSlice['setDrawings'];
  updateAnnotations: AnnotationsSlice['updateAnnotations'];
  moveAnnotations: AnnotationsSlice['moveAnnotations'];
  placeAnnotations: AnnotationsSlice['placeAnnotations'];
  orderAnnotations: AnnotationsSlice['orderAnnotations'];
  groupAnnotations: AnnotationsSlice['groupAnnotations'];
  ungroupAnnotations: AnnotationsSlice['ungroupAnnotations'];
  replaceDrawings: AnnotationsSlice['replaceDrawings'];
  clearAnnotations: AnnotationsSlice['clearAnnotations'];

  // Fog actions (from fogSlice.ts)
  addFogOperation: FogSlice['addFogOperation'];
  addFogOperations: FogSlice['addFogOperations'];
  clearFog: FogSlice['clearFog'];
  coverAllFog: FogSlice['coverAllFog'];
  revealFogGround: FogSlice['revealFogGround'];
  hideFogArea: FogSlice['hideFogArea'];
  forgetFogArea: FogSlice['forgetFogArea'];
  hideRooms: FogSlice['hideRooms'];
  /** Merges `changes` into the scene's lighting; an option given as undefined is removed. */
  setSceneLighting: (changes: SceneLightingChanges) => void;
  /** Sets the explored memory of `level` (unset: the level the view shows; null: the first); a level the scene no longer has keeps none. */
  setExploredMask: (dataUrl: string | null, level?: string | null) => void;
  setExploredEdits: (count: number) => void;

  // Scene objects of every kind (from sceneObjectsSlice.ts)
  addObject: SceneObjectsSlice['addObject'];
  patchObject: SceneObjectsSlice['patchObject'];
  removeObjects: SceneObjectsSlice['removeObjects'];
  editWalls: SceneObjectsSlice['editWalls'];

  toggleDoor: (id: string) => void;
  /** Locks a door, closing it, or unlocks it; a locked door does not open (`toggleDoor`). */
  setDoorLocked: (id: string, locked: boolean) => void;

  markAudioDirty: () => void;
  consumeAudioDirty: () => boolean;

  setActiveTool: (tool: ViewAtlasState['activeTool']) => void;
  /** A press with the measure key held: the measure tool takes it as a ruler, and the tool in use waits (`heldRulerFrom`). */
  holdRuler: () => void;
  /** The measure key and the button are let go: the tool that waited comes back, unless another was picked meanwhile. */
  releaseRuler: () => void;
  setSelectionMode: (mode: ViewAtlasState['selectionMode']) => void;
  setSelection: (ids: string[]) => void;
  clearSelection: () => void;
  moveTokensBulk: (ids: string[], dx: number, dy: number) => void;
  setTokenPositions: (positions: Array<{id: string, x: number, y: number}>) => void;
  /**
   * The pointer lets go of the tokens it dragged: `placeTokens` puts them at `positions`, on top
   * of every other token, and they are no longer held. One write, so sight works the drop out once.
   */
  /** Puts dragged tokens down (`placeTokens`); `art` is what the view draws of the levels' maps, through which a token falls. */
  dropTokens: (positions: readonly TokenPlace[], art?: ArtFloors) => void;
  /** Deletes every selected token, drawing, text and pin in one undo step. */
  deleteSelected: () => void;
  setIsDragging: (dragging: boolean) => void;
  setWidgetSettings: (settings: WidgetSettings) => void;
  updateWidget: (widgetId: string, updates: Partial<AnyWidget>) => void;
  /** Sets a timer's time; a state without `running` leaves it paused. */
  setTimerState: (widgetId: string, state: TimerState) => void;
  addWidget: (widget: AnyWidget) => void;
  removeWidget: (widgetId: string) => void;
  /** Switches a widget on or off in this scene. */
  setWidgetOn: (widgetId: string, on: boolean) => void;
  reorderWidgets: (widgetIds: string[]) => void;
  setWidgetValue: (widgetId: string, value: number) => void;
  setGMView: (on: boolean) => void;
  setDMNotePath: (path: string | null) => void;

  // Levels (from sceneLevelsSlice.ts)
  setViewedLevel: SceneLevelsSlice['setViewedLevel'];
  setLevels: SceneLevelsSlice['setLevels'];
  applyLevelScene: SceneLevelsSlice['applyLevelScene'];
  moveTokensToLevel: SceneLevelsSlice['moveTokensToLevel'];
  alignLevel: SceneLevelsSlice['alignLevel'];
  forgetOtherLevelsExplored: SceneLevelsSlice['forgetOtherLevelsExplored'];
  restoreLevelsExplored: SceneLevelsSlice['restoreLevelsExplored'];

  // Named areas of the map for the GM (from mapFeaturesSlice.ts)
  addMapFeatures: MapFeaturesSlice['addMapFeatures'];

  // The rooms mode's choices (from roomsSlice.ts)
  roomTool: RoomsSlice['roomTool'];
  /** The rooms brush's and bucket's sizes of this scene; saved with the map once the GM sets them. */
  roomSizes?: RoomsSlice['roomSizes'];
  setRoomTool: RoomsSlice['setRoomTool'];
  // The view as the players' picture on a tablet on the table (from tableModeSlice.ts)
  tableMode: TableModeSlice['tableMode'];
  enterTableMode: TableModeSlice['enterTableMode'];
  leaveTableMode: TableModeSlice['leaveTableMode'];
  // Water, lava and acid that move on animated maps (from liquidsSlice.ts)
  addLiquids: LiquidsSlice['addLiquids'];
  // Measurements that stay on the map (from measuresSlice.ts)
  addMeasure: MeasuresSlice['addMeasure'];
  clearMeasures: MeasuresSlice['clearMeasures'];
  setTokenAuras: MeasuresSlice['setTokenAuras'];

  // Movement counted per turn (from turnMovesSlice.ts)
  countTurnMove: TurnMovesSlice['countTurnMove'];
  /** Links the scene to its moods; nothing to link clears the field. Written with the map, never an undo step. */
  setSceneSound: (sound: SceneSound | null) => void;

  // Frames saved for the players' TV (from playerFramesSlice.ts)
  addPlayerFrame: PlayerFramesSlice['addPlayerFrame'];
  movePlayerFrame: PlayerFramesSlice['movePlayerFrame'];
  removePlayerFrame: PlayerFramesSlice['removePlayerFrame'];

  // Copy, paste and duplicate (from mapObjectsSlice.ts)
  insertMapObjects: MapObjectsSlice['insertMapObjects'];
  duplicateMapObjects: MapObjectsSlice['duplicateMapObjects'];
  placeOffMapToken: MapObjectsSlice['placeOffMapToken'];

  // Map state management
  clearMapState: () => void;
  plugin?: Plugin;
  setTokenSettings: (settings: ViewAtlasState['tokenSettings']) => void;
  setInitiativeTrackerOpen: (open: boolean) => void;
  addToInitiative: (entry: Omit<InitiativeEntry, 'id' | 'order' | 'isActive'>) => string;
  removeFromInitiative: InitiativeTurnActions['removeFromInitiative'];
  updateInitiativeEntry: (id: string, updates: Partial<InitiativeEntry>) => void;
  rollAllInitiative: (roll?: string, fromStatblocks?: ReadonlyMap<string, number>) => void;
  rollEntryInitiative: (id: string, roll?: string, fromStatblock?: number | null) => void;
  nextTurn: InitiativeTurnActions['nextTurn'];
  previousTurn: InitiativeTurnActions['previousTurn'];
  reorderInitiative: (fromIndex: number, toIndex: number) => void;
  moveToFront: (id: string) => void;
  moveToBack: (id: string) => void;
  setSideOrder: (order: SideId[]) => void;
  startCombat: InitiativeTurnActions['startCombat'];
  endCombat: () => void;
  resetInitiativeNumbers: InitiativeTurnActions['resetInitiativeNumbers'];
  setInitiativeSitsOut: (id: string, sitsOut: boolean) => void;
  delayInitiativeTurn: InitiativeTurnActions['delayInitiativeTurn'];
  actNowInInitiative: InitiativeTurnActions['actNowInInitiative'];
  swapInitiativeCards: InitiativeTurnActions['swapInitiativeCards'];
  setCombatantCondition: InitiativeTurnActions['setCombatantCondition'];
  resetInitiative: () => void;
  addDiceLogEntry: (entry: DiceRollResult) => void;
  clearDiceLog: () => void;

  // Pinned note preview windows (persisted per map)
  pinnedNotePreviews: PinnedNotePreviewSlice['pinnedNotePreviews'];
  savePinnedNotePreview: PinnedNotePreviewSlice['savePinnedNotePreview'];
  removePinnedNotePreview: PinnedNotePreviewSlice['removePinnedNotePreview'];

  // Loot roller window (persisted per map)
  lootRoller: LootRollerSlice['lootRoller'];
  setLootRollerOpen: LootRollerSlice['setLootRollerOpen'];
  updateLootRoller: LootRollerSlice['updateLootRoller'];
  showLootRoll: LootRollerSlice['showLootRoll'];
  openLightPopover: UISlice['openLightPopover'];
  closeLightPopover: UISlice['closeLightPopover'];
  openLightZonePopover: UISlice['openLightZonePopover'];
  closeLightZonePopover: UISlice['closeLightZonePopover'];
  openLevelLinkPopover: UISlice['openLevelLinkPopover'];
  closeLevelLinkPopover: UISlice['closeLevelLinkPopover'];
  openLevelSurfacePopover: UISlice['openLevelSurfacePopover'];
  closeLevelSurfacePopover: UISlice['closeLevelSurfacePopover'];
  openMeasurePopover: UISlice['openMeasurePopover'];
  closeMeasurePopover: UISlice['closeMeasurePopover'];
  setMeasureTool: UISlice['setMeasureTool'];
  setDrawTool: UISlice['setDrawTool'];
  setFogTool: UISlice['setFogTool'];
  setLightingTool: UISlice['setLightingTool'];
  setToolSwitch: UISlice['setToolSwitch'];
  setHeldTokens: UISlice['setHeldTokens'];
  setExploredBrush: UISlice['setExploredBrush'];
  setToolbarEditing: UISlice['setToolbarEditing'];
  openDungeonGenerator: UISlice['openDungeonGenerator'];
  closeDungeonGenerator: UISlice['closeDungeonGenerator'];
  setRoofsHidden: UISlice['setRoofsHidden'];
  setSelectMore: UISlice['setSelectMore'];
  showCombatantConditions: UISlice['showCombatantConditions'];
  hideCombatantConditions: UISlice['hideCombatantConditions'];
  setGridSettingsOpen: UISlice['setGridSettingsOpen'];
  setDMScreenOpen: UISlice['setDMScreenOpen'];
  setDMScreenPage: UISlice['setDMScreenPage'];
  setGridAlignmentOpen: UISlice['setGridAlignmentOpen'];
  setFloorPositioning: UISlice['setFloorPositioning'];
  setDiceLogOpen: UISlice['setDiceLogOpen'];
  setHotkeyHelpOpen: UISlice['setHotkeyHelpOpen'];
  setDocsOpen: UISlice['setDocsOpen'];
  openAssetManager: UISlice['openAssetManager'];
  openArmarium: UISlice['openArmarium'];
  closeAssetManager: UISlice['closeAssetManager'];
  setCommandPaletteOpen: UISlice['setCommandPaletteOpen'];
  setDiceTrayOpen: UISlice['setDiceTrayOpen'];

  // Note: Undo/Redo is added by the history middleware (`store.temporal`, stores/history.ts)
}

/** The subset of view state that is written to the map file. */
export type PersistedViewState = Partial<ViewAtlasState>;

/**
 * A view store as seen after its middleware stack: selector-aware `subscribe`,
 * the `persist` API, and the storage flush used for tab-switch save coordination.
 * Assignable to `StoreApi<ViewAtlasState>` for consumers that only need the basics.
 */
export type ViewAtlasStore = Mutate<
  StoreApi<ViewAtlasState>,
  [['zustand/subscribeWithSelector', never], ['zustand/persist', PersistedViewState]]
> & {
  flushStorage: () => Promise<void>;
  /**
   * Fills the store from the file at `mapPath`. Rejects when the store did not take the
   * file's state (it cannot be read or loaded, or merging it failed); a path without a
   * file is a new map and resolves with the store as it was. A read that returns after
   * `isSuperseded` turned true, or after a later call, is dropped instead of applied.
   */
  rehydrateFromFile: (isSuperseded?: () => boolean) => Promise<void>;
};

/** The levels a grid write carries along; none while a load restores the scene, whose file already holds them as they belong. */
function carriedLevels(state: GridCarryScene & { isMapLoading: boolean }, grid: GridState | null): CarriedLevels | null {
  return state.isMapLoading ? null : levelsCarriedWithGrid(state, grid);
}

function applyTokenUpdates(token: TokenEntity | undefined, updates: TokenUpdates): void {
  if (!token) return;
  const normalized = updates.imagePath
    ? { ...updates, imagePath: normalizeImagePath(updates.imagePath) }
    : updates;
  Object.assign(token, normalized);
}

/**
 * Creates an isolated Atlas store instance for a specific view
 */
export function createViewAtlasStore(app: App, viewId: string, plugin?: AtlasVTTPlugin, isPlayerView: boolean = false): ViewAtlasStore {
  // Create a storage factory that will access the store once it's created
  let storeRef: Pick<StoreApi<ViewAtlasState>, 'getState'> | null = null;

  const hydrations = new HydrationTracker();

  // Keep a reference to the delayed storage so we can expose flush() on the store
  let delayedStorageRef: ReturnType<typeof createDelayedStorage> | null = null;

  const createDelayedStorage = (): AtlasPersistStorage<PersistedViewState> => {
    // Create storage lazily but only ONCE to preserve debounce state
    let currentStorage: AtlasPersistStorage<PersistedViewState> | null = null;

    const getOrCreateStorage = (): AtlasPersistStorage<PersistedViewState> | null => {
      if (!currentStorage && storeRef) {
        currentStorage = createAtlasStorage<ViewAtlasState, PersistedViewState>(app, storeRef, plugin);
      }
      return currentStorage;
    };

    // The persisted slice last handed to storage. Immer preserves references for
    // untouched branches, so a shallow key comparison tells us whether anything
    // that is actually persisted changed since the last write.
    let lastPersistedState: PersistedViewState | null = null;
    const persistedSliceChanged = (next: PersistedViewState): boolean => {
      if (!lastPersistedState) return true;
      const keys = Object.keys(next) as Array<keyof PersistedViewState>;
      if (keys.length !== Object.keys(lastPersistedState).length) return true;
      return keys.some((key) => next[key] !== lastPersistedState![key]);
    };

    const storage = {
      async getItem(name: string): Promise<StorageValue<PersistedViewState> | null> {
        if (!storeRef) {
          console.warn(`[ViewStore-${viewId}] Storage getItem called before store is ready`);
          return null;
        }
        const storage = getOrCreateStorage();
        return hydrations.read(async () => (storage ? storage.getItem(name) : null));
      },
      async setItem(name: string, value: StorageValue<PersistedViewState>): Promise<void> {
        if (!storeRef) {
          console.warn(`[ViewStore-${viewId}] Storage setItem called before store is ready`);
          return;
        }

        // Check per-store persistence control. A store without a loaded map is refused by
        // the storage as well; stopping here keeps its state from counting as already saved.
        const state = storeRef.getState();
        if (!state.persistenceEnabled || !state.mapLoaded) {
          return;
        }

        if (!persistedSliceChanged(value.state)) {
          return;
        }
        lastPersistedState = value.state;

        const storage = getOrCreateStorage();
        if (storage) {
          await storage.setItem(name, value);
        }
      },
      async removeItem(name: string): Promise<void> {
        if (!storeRef) {
          console.warn(`[ViewStore-${viewId}] Storage removeItem called before store is ready`);
          return;
        }
        const storage = getOrCreateStorage();
        if (storage) {
          await storage.removeItem(name);
        }
      },
      // Add flush method to handle pending saves
      async flush(): Promise<void> {
        if (currentStorage && typeof currentStorage.flush === 'function') {
          await currentStorage.flush();
        }
      }
    };
    delayedStorageRef = storage;
    return storage;
  };
  
  const fight: FightBinding = { rules: rulesLookup(app), random: diceRandom };

  const store = create<ViewAtlasState>()(
    withHistory(UNDO_DEPTHS)(
      subscribeWithSelector(
        persist(
          immer<ViewAtlasState>((set, get) => ({
          ...initialBranches(),
          isPlayerView,
          ...(plugin && { plugin }),

          setPersistenceEnabled: (enabled) => set((draft) => {
            draft.persistenceEnabled = enabled;
          }),
          
          setMapLoaded: (loaded) => set((draft) => {
            draft.mapLoaded = loaded;
          }),

          setMapLoading: (loading, progress, message) => set((draft) => {
            draft.isMapLoading = loading;
            if (progress !== undefined) draft.mapLoadingProgress = progress;
            if (message !== undefined) draft.mapLoadingMessage = message;
          }),

          // Set the map path - this drives persistence
          setMapPath: (path) => set((draft) => {
            draft.mapPath = path;
          }),

          // Update camera state
          setCamera: (partial) => set((draft) => {
            draft.camera = { ...draft.camera, ...partial };
          }),

          // Set background image path
          setBackground: (bg) => set((draft) => {
            draft.background = bg;
          }),

          // Set grid state; the levels fitted to it follow it in the same write (one undo step)
          setGrid: (grid) => {
            const carried = carriedLevels(get(), grid);
            set((draft) => {
              draft.grid = grid;
              if (carried) {
                draft.levelAlignments = carried.levelAlignments;
                draft.objects = carried.objects;
              }
            });
          },

          alignGrid: (grid, move) => {
            // What stands on the frame's levels moves with the frame's map, and every level fitted to the
            // grid follows the grid to stay on its art
            const state = get();
            const objects = move ? objectsMovedWithMap(state.objects, move, movesWithFrame(state)) : state.objects;
            const carried = carriedLevels({ ...state, objects }, grid);
            set((draft) => {
              draft.grid = grid;
              draft.objects = carried?.objects ?? objects;
              if (carried) draft.levelAlignments = carried.levelAlignments;
            });
          },
          
          setGridUnits: (units) => set((draft) => {
            if (draft.grid) {
              draft.grid.unitType = units.unitType;
              draft.grid.unitDistance = units.unitDistance;
            }
          }),
          
          // Set grid visibility
          setGridVisible: (visible) => set((draft) => {
            if (!draft.grid) {
              // Initialize grid with defaults if it doesn't exist
              draft.grid = {
                enabled: true,
                visible: visible,
                snapToGrid: true,
                size: 70,
                offsetX: 0,
                offsetY: 0,
                opacity: 0.5,
                lineType: 'solid',
                lineWidth: 1
              };
            } else {
              draft.grid.visible = visible;
            }
          }),
          
          setSnapToGrid: (snap) => set((draft) => {
            if (!draft.grid) {
              // Initialize grid with defaults if it doesn't exist
              draft.grid = {
                enabled: true,
                visible: true,
                snapToGrid: snap,
                size: 70,
                offsetX: 0,
                offsetY: 0,
                opacity: 0.5,
                lineType: 'solid',
                lineWidth: 1
              };
            } else {
              draft.grid.snapToGrid = snap;
            }
          }),

          addTokens: (entries) => {
            const ids: string[] = [];
            set((draft) => {
              for (const data of entries) {
                const id = data.id ?? newId('tok');
                // Normalize the image path to prevent app:// URLs
                const imagePath = normalizeImagePath(data.imagePath);
                const instanceNumber = computeNextInstanceNumber(draft.objects.tokens, imagePath);
                draft.objects.tokens[id] = { ...data, id, kind: data.kind ?? 'token', imagePath, instanceNumber, ...placedOnViewedLevel(draft) } as TokenEntity;
                ids.push(id);
              }
              raiseTokens(draft.objects.tokens, ids);
            });
            return ids;
          },

          moveToken: (id, x, y) => set((draft) => {
            const token = draft.objects.tokens[id];
            if (token) {
              token.x = x;
              token.y = y;
              draft._audioDirty = true;
            }
          }),

          updateToken: (id, updates) => set((draft) => {
            applyTokenUpdates(draft.objects.tokens[id], updates);
          }),

          updateTokens: (entries) => set((draft) => {
            for (const { id, changes } of entries) {
              applyTokenUpdates(draft.objects.tokens[id], changes);
            }
          }),

          retargetRenamedFile: (oldPath, newPath) => set((draft) => {
            rewriteMapReferences(draft, movedPathOf([{ from: oldPath, to: newPath }]));
          }),

          retargetRenamedFolder: (oldPath, newPath) => set((draft) => {
            rewriteMapReferences(draft, movedFolderPathOf([{ from: oldPath, to: newPath }]));
          }),

          setTokens: (map) => set((draft) => {
            // Filter out tokens with blob URLs and normalize image paths
            const filteredTokens: Record<string, TokenEntity> = {};
            
            for (const [id, token] of Object.entries(map)) {
              if (token.imagePath && token.imagePath.startsWith('blob:')) {
                console.warn(`[ViewAtlasStore] Skipping token with blob URL: ${id}`);
              } else {
                // Normalize the image path and ensure the token maintains all its properties
                const normalizedToken = {
                  ...token,
                  imagePath: normalizeImagePath(token.imagePath)
                };
                filteredTokens[id] = normalizedToken;
              }
            }
            
            draft.objects.tokens = filteredTokens;
          }),


          // Tool and selection state
          setActiveTool: (tool) => set((draft) => {
            if (!isAtlasToolAvailable(tool)) {
              return;
            }
            draft.activeTool = tool;
            draft.heldRulerFrom = undefined;
          }),

          holdRuler: () => set((draft) => {
            draft.heldRulerFrom ??= draft.activeTool;
            draft.activeTool = 'measure';
          }),

          releaseRuler: () => set((draft) => {
            if (draft.heldRulerFrom === undefined) return;
            draft.activeTool = draft.heldRulerFrom;
            draft.heldRulerFrom = undefined;
          }),

          setSelectionMode: (mode) => set((draft) => {
            draft.selectionMode = mode;
          }),

          setSelection: (ids) => set((draft) => {
            draft.selectedIds = ids;
          }),

          clearSelection: () => set((draft) => {
            draft.selectedIds = [];
          }),
          
          setIsDragging: (dragging) => set((draft) => {
            draft.isDragging = dragging;
          }),

          setGMView: (on) => set((draft) => {
            draft.isGMView = on;
          }),

          // Widget settings
          setWidgetSettings: (settings) => set((draft) => {
            draft.widgetSettings = settings;
          }),
          
          updateWidget: (widgetId, updates) => set((draft) => {
            if (draft.widgetSettings.widgets[widgetId]) {
              Object.assign(draft.widgetSettings.widgets[widgetId], updates);
            }
          }),
          
          setTimerState: (widgetId, { value, running }) => set((draft) => {
            const widget = draft.widgetSettings.widgets[widgetId];
            if (widget?.type !== 'timer') return;
            widget.value = value;
            if (running) widget.running = running;
            else delete widget.running;
          }),

          addWidget: (widget) => set((draft) => {
            draft.widgetSettings.widgets[widget.id] = widget;
          }),
          
          removeWidget: (widgetId) => set((draft) => {
            delete draft.widgetSettings.widgets[widgetId];
            delete draft.widgetValues[widgetId];
            const offWidgets = withWidgetOff(draft.widgetSettings.offWidgets, widgetId, false);
            if (offWidgets) draft.widgetSettings.offWidgets = offWidgets;
            else delete draft.widgetSettings.offWidgets;
          }),

          setWidgetOn: (widgetId, on) => set((draft) => {
            const offWidgets = withWidgetOff(draft.widgetSettings.offWidgets, widgetId, !on);
            if (offWidgets) draft.widgetSettings.offWidgets = offWidgets;
            else delete draft.widgetSettings.offWidgets;
            const widget = draft.widgetSettings.widgets[widgetId];
            // Older Atlas versions hid widgets with this flag instead
            if (on && widget && !widget.visible) widget.visible = true;
          }),
          
          reorderWidgets: (widgetIds) => set((draft) => {
            if (!widgetIds || !Array.isArray(widgetIds)) {
              console.warn(`[ViewStore-${viewId}] Invalid widgetIds provided to reorderWidgets:`, widgetIds);
              return;
            }
            widgetIds.forEach((id, index) => {
              if (draft.widgetSettings.widgets[id]) {
                draft.widgetSettings.widgets[id].order = index;
              }
            });
          }),
          
          setWidgetValue: (widgetId, value) => set((draft) => {
            // Store value separately from definition
            draft.widgetValues[widgetId] = value;
            
            // Also update in widgetSettings for backward compatibility
            if (draft.widgetSettings.widgets[widgetId]) {
              draft.widgetSettings.widgets[widgetId].value = value;
            }
          }),
          

          moveTokensBulk: (ids, dx, dy) => set((draft) => {
            if (!ids || !Array.isArray(ids)) {
              console.warn(`[ViewStore-${viewId}] Invalid ids provided to moveTokensBulk:`, ids);
              return;
            }
            ids.forEach(id => {
              const token = draft.objects.tokens[id];
              if (token) {
                token.x += dx;
                token.y += dy;
              }
            });
            draft._audioDirty = true;
          }),

          setTokenPositions: (positions) => set((draft) => {
            if (!positions || !Array.isArray(positions)) {
              console.warn(`[ViewStore-${viewId}] Invalid positions provided to setTokenPositions:`, positions);
              return;
            }
            positions.forEach(({id, x, y}) => {
              const token = draft.objects.tokens[id];
              if (token) {
                token.x = x;
                token.y = y;
              }
            });
            draft._audioDirty = true;
          }),

          dropTokens: (positions, art) => set((draft) => {
            const levelsBefore = new Map(positions.map(({ id }) => [id, draft.objects.tokens[id]?.level]));
            placeTokens(draft, positions, art);
            if (Object.keys(draft.heldTokens).length > 0) draft.heldTokens = {};
            // Tokens that went down or up stairs leave the selection, which stays on the level shown.
            const climbed = new Set(positions.filter(({ id }) => draft.objects.tokens[id]?.level !== levelsBefore.get(id)).map(({ id }) => id));
            if (climbed.size > 0) draft.selectedIds = draft.selectedIds.filter((id) => !climbed.has(id));
          }),

          // A combatant beside the map is never deleted by what the map has selected
          deleteSelected: () => get().removeObjects(withoutOffMap(get().objects, get().selectedIds)),

          // --- Copy, paste and duplicate (from mapObjectsSlice.ts) ---
          ...createMapObjectsActions(set, get),

          // DM screen actions
          setDMNotePath: (path) => set((draft) => {
            draft.dmNotePath = path;
          }),

          setTokenSettings: (settings) => set((draft) => {
            draft.tokenSettings = settings;
          }),

          // Note Pin actions
          addNotePin: (x, y, notePath, icon, options) => {
            const id = newId('pin');
            set((draft) => {
              const newPin: NotePin = { 
                id, 
                kind: 'pin',
                x, 
                y, 
                notePath,
                ...placedOnViewedLevel(draft),
              };
              if (icon) {
                newPin.icon = icon;
              }
              if (options?.hex) {
                newPin.hex = true;
              }
              if (options?.sceneLevel) {
                newPin.sceneLevel = options.sceneLevel;
              }
              if (options?.showName) {
                newPin.showName = true;
              }
              if (isPinLabelKind(icon)) {
                newPin.label = nextPinLabel(draft.objects.pins, icon);
              }
              draft.objects.pins[id] = newPin;
            });
            return id;
          },

          // Drawings and texts (from annotationsSlice.ts)
          ...createAnnotationsActions(set, get),

          // Fog actions (from fogSlice.ts)
          ...createFogActions(set, get),

          setSceneLighting: (changes) => set((draft) => {
            Object.assign(draft.lighting, changes);
            for (const field of Object.keys(changes) as SceneLightingOption[]) {
              if (changes[field] === undefined) delete draft.lighting[field];
            }
            draft.lighting.ambient = Math.min(1, Math.max(0, draft.lighting.ambient));
            if (draft.lighting.litThreshold !== undefined) draft.lighting.litThreshold = clampLitThreshold(draft.lighting.litThreshold);
          }),

          setExploredMask: (dataUrl, level) => set((draft) => {
            writeExploredMask(draft, dataUrl, level);
          }),

          setExploredEdits: (count) => set((draft) => {
            draft.exploredEdits = count;
          }),

          markAudioDirty: () => set((draft) => { draft._audioDirty = true; }),
          consumeAudioDirty: () => {
            const dirty = get()._audioDirty;
            if (dirty) set((draft) => { draft._audioDirty = false; });
            return dirty;
          },

          // --- Scene objects of every kind (from sceneObjectsSlice.ts) ---
          ...createSceneObjectsActions(set, get, fight),

          toggleDoor: (id) => set((draft) => {
            const wall = draft.objects.walls[id];
            // A locked door stays shut until it is unlocked.
            if (wall && (wall.type === 'door' || wall.type === 'secret-door') && wall.locked !== true) {
              wall.closed = !(wall.closed ?? true);
              draft._audioDirty = true;
            }
          }),

          setDoorLocked: (id, locked) => set((draft) => {
            const wall = draft.objects.walls[id];
            if (!wall || (wall.type !== 'door' && wall.type !== 'secret-door')) return;
            if (!locked) {
              delete wall.locked;
              return;
            }
            wall.locked = true;
            if (!(wall.closed ?? true)) {
              wall.closed = true;
              draft._audioDirty = true;
            }
          }),

          // Clear all map state when switching maps
          clearMapState: () => set((draft) => {
            Object.assign(draft, clearedScene());
          }),

          // Token ring actions
          setTokenRing: (id, color) => set((draft) => {
            const existing = draft.objects.tokens[id];
            if (!existing) {
              console.warn(`[ViewStore-${viewId}] setTokenRing: token not found`, id);
              return;
            }

            // Create new token object so Reactivity triggers
            const updated: TokenEntity = { ...existing };
            if (color === null) {
              delete updated.ringColor;
            } else {
              updated.ringColor = color;
            }

            // Replace in map and also replace the map reference so Zustand selector fires
            draft.objects.tokens = {
              ...draft.objects.tokens,
              [id]: updated,
            };
          }),
          
          // Token condition actions
          setTokensCondition: (tokenIds, conditionId, active) => set((draft) => {
            for (const tokenId of tokenIds) {
              const token = draft.objects.tokens[tokenId];
              if (!token || (token.conditions ?? []).includes(conditionId) === active) continue;
              if (active) token.conditions = [...(token.conditions ?? []), conditionId];
              else removeCondition(token, conditionId);
            }
          }),

          changeTokensConditionValue: (tokenIds, conditionId, delta) => set((draft) => {
            for (const tokenId of tokenIds) {
              const token = draft.objects.tokens[tokenId];
              if (!token) continue;
              const current = (token.conditions ?? []).includes(conditionId) ? conditionValue(token, conditionId) : 0;
              setConditionValue(token, conditionId, current + delta, true);
            }
          }),

          setTokensConditionValue: (tokenIds, conditionId, value) => set((draft) => {
            for (const tokenId of tokenIds) {
              const token = draft.objects.tokens[tokenId];
              if (token) setConditionValue(token, conditionId, value ?? 0, true);
            }
          }),

          clearTokenConditions: (id) => set((draft) => {
            const token = draft.objects.tokens[id];
            if (!token) {
              console.warn(`[ViewStore-${viewId}] clearTokenConditions: token not found`, id);
              return;
            }

            clearConditions(token);
          }),

          // Kill tokens - set HP to 0
          killTokens: (ids, definitions) => set((draft) => {
            for (const id of ids) {
              const token = draft.objects.tokens[id];
              if (token?.kind !== 'character') continue;
              const resources = defeatedResources(token, definitions);
              if (resources) token.resources = resources;
            }
          }),

          // Reset tokens - restore every resource and clear conditions
          resetTokens: (ids, definitions) => set((draft) => {
            for (const id of ids) {
              const token = draft.objects.tokens[id];
              if (!token) continue;
              const resources = token.kind === 'character' ? restedResources(token, definitions) : undefined;
              if (resources) token.resources = resources;
              clearConditions(token);
            }
          }),

          // --- Initiative Tracker Actions (from initiativeSlice.ts) ---
          ...createInitiativeActions(set, get, fight),

          // --- Dice Roll Log ---
          addDiceLogEntry: (entry: DiceRollResult) => set((draft) => {
            draft.diceLog.unshift(entry);
            if (draft.diceLog.length > 20) {
              draft.diceLog = draft.diceLog.slice(0, 20);
            }
          }),
          clearDiceLog: () => set((draft) => {
            draft.diceLog = [];
          }),

          ...createPinnedNotePreviewActions(set),
          ...createLootRollerActions(set),

          // --- Levels of the scene (from sceneLevelsSlice.ts) ---
          ...createSceneLevelsActions(set, get),
          ...createMapFeaturesActions(set),
          roomTool: { ...DEFAULT_ROOM_TOOL, stabilize: loadStabilizer(app) },
          ...createRoomsSlice(set, (stabilize) => saveStabilizer(app, stabilize)),
          ...createTableModeActions(set),
          ...createLiquidsActions(set),
          ...createMeasuresActions(set),
          ...createTurnMovesActions(set),
          ...createPlayerFramesActions(set),
          setSceneSound: (sound) => set((draft) => { draft.sound = readSceneSound(sound); }),

          // --- Per-view UI visibility (from uiSlice.ts) ---
          ...createInitialUIState(loadDrawTool(app)),
          ...createUIActions(set, (choices) => saveDrawTool(app, choices)),

        })),
        {
          name: `atlas-view-${viewId}`,
          
          // Create a unique storage adapter for this view that uses this store instance
          storage: createDelayedStorage(),
          
          // Store version for migrations
          version: ATLAS_VERSION,
          
          // Skip automatic hydration on store creation
          skipHydration: true,
          
          partialize: savedBranches,
          merge: loadedBranches,

          onRehydrateStorage: () => hydrations.reporter((error) => {
            console.error(`[ViewStore-${viewId}] Hydration failed:`, error);
          }),
        }
      )
    )
  )
);

  // Set the store reference after creation
  storeRef = store;

  // A renderer that fails on some state must not keep the others, or a scene load, from going on
  isolateListeners(store, (error) => {
    console.error(`[ViewStore-${viewId}] A store subscriber failed:`, error);
  });

  followTokensInTracker(store, fight);

  // Immer types `setState` with draft updaters, and WritableDraft<ViewAtlasState> is not
  // assignable back to ViewAtlasState because the state holds the Obsidian `plugin`.
  // The public type keeps the plain StoreApi `setState`, which the Immer store also honours.
  const publicStore = store as unknown as Omit<ViewAtlasStore, 'flushStorage' | 'rehydrateFromFile'>;

  // Expose the storage flush method on the store for tab-switch save coordination
  return Object.assign(publicStore, {
    flushStorage: async (): Promise<void> => {
      if (delayedStorageRef && typeof delayedStorageRef.flush === 'function') {
        await delayedStorageRef.flush();
      }
    },
    rehydrateFromFile: (isSuperseded = (): boolean => false): Promise<void> => (
      hydrations.run(() => store.persist.rehydrate(), isSuperseded)
    ),
  });
}
