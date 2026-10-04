import type { ResourceDefinition } from './resources/resourceTypes';
import { defeatedResources, restedResources } from './resources/resourceValues';
import { create } from "zustand";
import type { Mutate, StoreApi } from "zustand";
import { subscribeWithSelector, persist } from "zustand/middleware";
import type { StorageValue } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { temporal } from 'zundo';
import type { App, Plugin } from 'obsidian';
import type AtlasVTTPlugin from '../../main';
import type { TokenEntity, Character, NotePin, TextElement, DrawingStroke } from './types';
import type { FogOperation, FogOperationInput } from './types/fogTypes';
import type { WallSegment, WallInput } from './types/wallTypes';
import { DEFAULT_SCENE_LIGHTING, type LightChanges, type LightInput, type LightSource, type LightZone, type LightZoneChanges, type LightZoneInput, type SceneLighting, type SceneLightingChanges, type SceneLightingOption } from './types/lightingTypes';
import type { AudioSource, AudioInput } from './types/audioTypes';
import type { AnyWidget, WidgetSettings } from './types/widgetTypes';
import type { InitiativeState, InitiativeEntry, InitiativeConfig } from './types/initiativeTypes';
import { createDefaultInitiativeState } from './types/initiativeTypes';
import type { InitiativeRules } from './types/initiativeRulesTypes';
import { CameraState, GridState, createAtlasStorage, ATLAS_SCHEMA, ATLAS_VERSION } from './services/MapPersistence';
import type { AtlasPersistStorage } from './services/MapPersistence';
import { normalizeImagePath } from './utils/pathUtils';
import { createInitiativeActions } from './stores/initiativeSlice';
import { createInitialUIState, createUIActions, type UISlice } from './stores/uiSlice';
import { createPinnedNotePreviewActions, type PinnedNotePreviewSlice } from './stores/pinnedNotePreviewSlice';
import { createInitialLootRollerState, createLootRollerActions, readLootRollerState, type LootRollerSlice } from './stores/lootRollerSlice';
import { createAddonActions, createInitialAddonState, type AddonSlice } from './stores/addonSlice';
import { addonActions, addonInitialState, addonPersistedState, addonRestoredState } from './addons/addonHost';
import type { AddonViewState } from './addons/AtlasAddon';
import { isRecord } from './services/assetMetadataGuards';
import { createHistoryOptions } from './stores/history';
import { withoutCollectionWidgets } from './utils/collectionWidgets';
import { withWidgetOff } from './utils/widgetActivation';
import { createMapObjectsActions, type MapObjectsSlice } from './stores/mapObjectsSlice';
import { computeNextInstanceNumber } from './stores/tokenInstanceNumbers';
import { raiseTokens } from './stores/tokenStacking';
import type { DiceRollResult } from './tools/DiceTool';
import { isAtlasToolAvailable } from './tools/toolAvailability';
import { readExploredMask } from './lighting/exploredMaskCodec';
import { clampLitThreshold, readSceneLighting } from './lighting/sceneLightingOptions';
import { isPinLabelKind, nextPinLabel } from './tools/pinLabels';
import { movedPathOf, rewriteMapReferences } from './services/renamedPaths';
import { conditionValue, removeCondition, setConditionValue } from './utils/conditionValues';
import { HydrationTracker } from './stores/hydrationTracker';
import { isolateListeners } from './stores/isolatedListeners';

// Individual store state interface (same as AtlasState but isolated)
export interface ViewAtlasState extends AddonViewState {
  // --- Non-persisted fields ---
  // Current map file path (for persistence)
  mapPath: string | null;
  setMapPath: (path: string | null) => void;
  
  // Per-store persistence control
  persistenceEnabled: boolean;
  setPersistenceEnabled: (enabled: boolean) => void;
  
  /**
   * Whether the store holds the scene at `mapPath` as it was loaded. It does not while
   * a scene loads or after loading failed, and is then never saved to the scene's file.
   */
  mapLoaded: boolean;
  setMapLoaded: (loaded: boolean) => void;

  // Loading state
  isMapLoading: boolean;
  mapLoadingProgress?: number;
  mapLoadingMessage?: string;
  setMapLoading: (loading: boolean, progress?: number, message?: string) => void;

  // --- Persisted fields ---
  // Schema identifier and version for migrations
  schema: 'atlas-vtt';
  version: number;
  
  // Map background image path
  background: string | null;
  setBackground: (bg: string | null) => void;
  
  // Grid configuration
  grid: GridState | null;
  setGrid: (grid: GridState) => void;
  setGridUnits: (units: { unitType: 'feet' | 'yards' | 'meters' | 'units'; unitDistance: number }) => void;
  setGridVisible: (visible: boolean) => void;
  setSnapToGrid: (snap: boolean) => void;
  
  // Object collections by type
  objects: {
    tokens: Record<string, TokenEntity>;
    fog: Record<string, FogOperation>;
    pins: Record<string, NotePin>;
    texts: Record<string, TextElement>;
    drawings: Record<string, DrawingStroke>;
    walls: Record<string, WallSegment>;
    lights: Record<string, LightSource>;
    audios: Record<string, AudioSource>;
    /** Areas with ambient light of their own, in the order they were drawn; absent until the first is. Read with `lightZoneList`. */
    lightZones?: Record<string, LightZone>;
  };
  
  // Camera state
  camera: CameraState;
  setCamera: (partial: Partial<CameraState>) => void;

  // Token actions
  addToken: (data: TokenInput) => string;
  /** Adds several tokens in one store write, so spawning a group is a single undo step. */
  addTokens: (data: TokenInput[]) => string[];

  addCharacter: (data: {
    x: number;
    y: number;
    imagePath: string;
    name: string;
    notePath?: string;
    snapped?: boolean;
    ringColor?: string;
    showRing?: boolean;
  }) => string;

  addTokenWithId: (
    id: string,
    data: { x: number; y: number; imagePath: string; snapped?: boolean },
    extra: Pick<Character, 'name' | 'notePath'>
  ) => void;

  moveToken: (id: string, x: number, y: number) => void;
  updateToken: (id: string, updates: TokenUpdates) => void;
  /** Applies several token updates in one store write, so they form a single undo step. */
  updateTokens: (entries: Array<{ id: string; changes: TokenUpdates }>) => void;
  /** Points tokens and pins that name a vault file at the path it was renamed to. */
  retargetRenamedFile: (oldPath: string, newPath: string) => void;
  deleteToken: (id: string) => void;
  setTokens: (map: Record<string, TokenEntity>) => void;
  setTokenRing: (id: string, color: string | null) => void;
  /** Adds (`active`) or removes a condition on every token in one store write, so it is a single undo step. */
  setTokensCondition: (tokenIds: string[], conditionId: string, active: boolean) => void;
  /**
   * Raises or lowers a valued condition by `delta` on every token in one store write:
   * a token without it gains it at `delta`, one that falls to 0 loses it.
   */
  changeTokensConditionValue: (tokenIds: string[], conditionId: string, delta: number) => void;
  clearTokenConditions: (id: string) => void;
  /** Spends every resource of `definitions` that defeats a token. */
  killTokens: (ids: string[], definitions: readonly ResourceDefinition[]) => void;
  /** Returns every resource of `definitions` to its start and clears conditions. */
  resetTokens: (ids: string[], definitions: readonly ResourceDefinition[]) => void;

  // Note Pin actions
  /** With `hex`, the note is linked to the hex containing (x, y) rather than pinned to the point. */
  addNotePin: (x: number, y: number, notePath: string, icon?: string, options?: { hex?: boolean }) => string;
  updateNotePin: (id: string, updates: Partial<Omit<NotePin, 'id' | 'kind'>>) => void;
  moveNotePin: (id: string, x: number, y: number) => void;
  deleteNotePin: (id: string) => void;

  // Text element actions
  addText: (data: Omit<TextElement, 'id' | 'kind'>) => string;
  updateText: (id: string, updates: Partial<Omit<TextElement, 'id' | 'kind'>>) => void;
  moveText: (id: string, x: number, y: number) => void;
  deleteText: (id: string) => void;
  setTexts: (texts: Record<string, TextElement>) => void;

  // Drawing actions
  addDrawing: (data: Omit<DrawingStroke, 'id' | 'kind' | 'timestamp'>) => string;
  moveDrawings: (ids: string[], dx: number, dy: number) => void;
  updateDrawings: (ids: string[], updates: Partial<Pick<DrawingStroke, 'color' | 'icon'>>) => void;
  deleteDrawing: (id: string) => void;
  clearDrawings: () => void;
  setDrawings: (drawings: Record<string, DrawingStroke>) => void;

  // Fog actions
  addFogOperation: (data: FogOperationInput) => string;
  deleteFogOperation: (id: string) => void;
  deleteFogOperations: (ids: string[]) => void;
  duplicateFogOperations: (ids: string[]) => void;
  setFogOperations: (fog: Record<string, FogOperation>) => void;
  clearFog: () => void;

  /** Dynamic lighting of the scene; saved with the map, never undo-tracked. */
  lighting: SceneLighting;
  /** Merges `changes` into the scene's lighting; an option given as undefined is removed. */
  setSceneLighting: (changes: SceneLightingChanges) => void;
  /** What the players' tokens have explored, as a PNG data URL; saved with the map, never undo-tracked. */
  exploredMask: string | null;
  setExploredMask: (dataUrl: string | null) => void;
  /**
   * How many edits by hand led to the explored memory as it is, counted since the scene loaded.
   * The memory itself is no store state, so this count stands for it in the undo history: a
   * memory edit is the step that raises it, and undo and redo reach it in the order the GM
   * worked (`ExploredMemory` puts the memory back when it changes). Never saved.
   */
  exploredEdits: number;
  setExploredEdits: (count: number) => void;

  // Wall actions
  addWall: (data: WallInput) => string;
  updateWall: (id: string, changes: Partial<WallSegment>) => void;
  deleteWall: (id: string) => void;
  deleteWalls: (ids: string[]) => void;
  toggleDoor: (id: string) => void;
  /** Locks a door, closing it, or unlocks it; a locked door does not open (`toggleDoor`). */
  setDoorLocked: (id: string, locked: boolean) => void;

  // Light actions
  addLight: (data: LightInput) => string;
  updateLight: (id: string, changes: LightChanges) => void;
  deleteLight: (id: string) => void;
  addLightZone: (data: LightZoneInput) => string;
  updateLightZone: (id: string, changes: LightZoneChanges) => void;
  deleteLightZone: (id: string) => void;

  // Audio dirty flag (non-persisted)
  _audioDirty: boolean;
  markAudioDirty: () => void;
  consumeAudioDirty: () => boolean;

  // Audio actions
  addAudio: (data: AudioInput) => string;
  updateAudio: (id: string, changes: Partial<AudioSource>) => void;
  deleteAudio: (id: string) => void;

  // Tool and selection state
  activeTool: 'move' | 'select' | 'fog' | 'text' | 'measure' | 'measure-circle' | 'measure-cone' | 'eraser' | 'asset' | 'note-pin' | 'laser-pointer' | 'draw-pen' | 'draw-eraser' | 'draw-icon' | 'draw-line' | 'draw-rectangle' | 'draw-circle' | 'wall' | 'audio';
  setActiveTool: (tool: ViewAtlasState['activeTool']) => void;
  selectionMode: 'box' | 'lasso';
  setSelectionMode: (mode: ViewAtlasState['selectionMode']) => void;
  selectedIds: string[];
  setSelection: (ids: string[]) => void;
  clearSelection: () => void;
  moveTokensBulk: (ids: string[], dx: number, dy: number) => void;
  setTokenPositions: (positions: Array<{id: string, x: number, y: number}>) => void;
  /**
   * The pointer lets go of the tokens it dragged: they stand at `positions`, on top of every
   * other token, and are no longer held. One write, so sight works the drop out once.
   */
  dropTokens: (positions: Array<{id: string, x: number, y: number}>) => void;
  deleteTokens: (ids: string[]) => void;
  /** Deletes every selected token, drawing, text and pin in one undo step. */
  deleteSelected: () => void;
  
  // Drag state
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
  
  // Widget settings
  widgetSettings: WidgetSettings;
  widgetValues: Record<string, number>; // Widget values separate from definitions
  setWidgetSettings: (settings: WidgetSettings) => void;
  updateWidget: (widgetId: string, updates: Partial<AnyWidget>) => void;
  addWidget: (widget: AnyWidget) => void;
  removeWidget: (widgetId: string) => void;
  /** Switches a widget on or off in this scene. */
  setWidgetOn: (widgetId: string, on: boolean) => void;
  reorderWidgets: (widgetIds: string[]) => void;
  setWidgetValue: (widgetId: string, value: number) => void;
  
  // Player view state
  isPlayerView: boolean;

  // GM view toggle (semi-transparent fog vs fully opaque)
  isGMView: boolean;
  setGMView: (on: boolean) => void;

  // DM screen state
  dmNotePath: string | null;
  setDMNotePath: (path: string | null) => void;

  // Copy, paste and duplicate (from mapObjectsSlice.ts)
  insertMapObjects: MapObjectsSlice['insertMapObjects'];
  duplicateMapObjects: MapObjectsSlice['duplicateMapObjects'];
  removeMapObjects: MapObjectsSlice['removeMapObjects'];

  // Map state management
  deleteMapObject: (type: 'token' | 'fog' | 'pin' | 'text' | 'drawing' | 'wall' | 'light' | 'audio', id: string) => void;
  clearMapState: () => void;
  
  // Collection management
  currentCollectionId?: string;
  plugin?: Plugin;
  
  // Token settings
  tokenSettings: {
    showNameplates: boolean;
    /** Keys of the collection's resources this map does not show to the GM; see `resources/sceneVisibility.ts`. */
    hiddenResources: string[];
    showInstanceBadges: boolean;
    tokenRingSize: number;
  };
  setTokenSettings: (settings: ViewAtlasState['tokenSettings']) => void;

  
  // --- Initiative Tracker ---
  initiative: InitiativeState;
  initiativeTrackerOpen: boolean;
  setInitiativeTrackerOpen: (open: boolean) => void;
  addToInitiative: (entry: Omit<InitiativeEntry, 'id' | 'order' | 'isActive'>) => string;
  removeFromInitiative: (id: string) => void;
  updateInitiativeEntry: (id: string, updates: Partial<InitiativeEntry>) => void;
  rollAllInitiative: (roll?: string) => void;
  rollEntryInitiative: (id: string, roll?: string) => void;
  nextTurn: () => void;
  previousTurn: () => void;
  reorderInitiative: (fromIndex: number, toIndex: number) => void;
  moveToFront: (id: string) => void;
  moveToBack: (id: string) => void;
  startCombat: (rules?: InitiativeRules) => void;
  endCombat: () => void;
  setInitiativeSitsOut: (id: string, sitsOut: boolean) => void;
  resetInitiative: () => void;
  setInitiativeConfig: (config: Partial<InitiativeConfig>) => void;

  // Dice roll log (persisted per map, capped at 20 entries)
  diceLog: DiceRollResult[];
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

  // Core state for add-ons (derived, never saved); add-ons add their own state through AddonStateRegistry
  objectMask: AddonSlice['objectMask'];
  objectMaskSources: AddonSlice['objectMaskSources'];
  setObjectMask: AddonSlice['setObjectMask'];
  addonRevision: AddonSlice['addonRevision'];
  bumpAddonRevision: AddonSlice['bumpAddonRevision'];

  // --- Per-view UI visibility (from uiSlice.ts, NOT persisted) ---
  isGridSettingsOpen: UISlice['isGridSettingsOpen'];
  isDMScreenOpen: UISlice['isDMScreenOpen'];
  isGridAlignmentOpen: UISlice['isGridAlignmentOpen'];
  isDiceLogOpen: UISlice['isDiceLogOpen'];
  isAssetManagerOpen: UISlice['isAssetManagerOpen'];
  assetManagerInitialTab?: UISlice['assetManagerInitialTab'];
  isCommandPaletteOpen: UISlice['isCommandPaletteOpen'];
  isDiceTrayOpen: UISlice['isDiceTrayOpen'];
  lightPopover: UISlice['lightPopover'];
  openLightPopover: UISlice['openLightPopover'];
  closeLightPopover: UISlice['closeLightPopover'];
  lightZonePopover: UISlice['lightZonePopover'];
  openLightZonePopover: UISlice['openLightZonePopover'];
  closeLightZonePopover: UISlice['closeLightZonePopover'];
  isSceneLightingPanelOpen: UISlice['isSceneLightingPanelOpen'];
  setSceneLightingPanelOpen: UISlice['setSceneLightingPanelOpen'];
  heldTokens: UISlice['heldTokens'];
  setHeldTokens: UISlice['setHeldTokens'];
  exploredBrush: UISlice['exploredBrush'];
  setExploredBrush: UISlice['setExploredBrush'];
  isToolbarEditing: UISlice['isToolbarEditing'];
  setToolbarEditing: UISlice['setToolbarEditing'];
  setGridSettingsOpen: UISlice['setGridSettingsOpen'];
  setDMScreenOpen: UISlice['setDMScreenOpen'];
  setGridAlignmentOpen: UISlice['setGridAlignmentOpen'];
  setDiceLogOpen: UISlice['setDiceLogOpen'];
  openAssetManager: UISlice['openAssetManager'];
  closeAssetManager: UISlice['closeAssetManager'];
  setCommandPaletteOpen: UISlice['setCommandPaletteOpen'];
  setDiceTrayOpen: UISlice['setDiceTrayOpen'];

  // Note: Undo/Redo functionality is added by temporal middleware
}

/** Data for a new token; the store assigns the id (unless given), kind default and instance number. */
export type TokenInput = Omit<TokenEntity, 'id' | 'kind'> & { kind?: 'token' | 'character'; id?: string };

/** The subset of view state that is written to the map file. */
export type PersistedViewState = Partial<ViewAtlasState>;

// Simple default widget settings
const createDefaultWidgets = (): WidgetSettings => ({
  widgets: {},
  globalVisible: true,
  position: 'top',
  scale: 1.0
});

// Initial state for each store instance
/** Token display settings of a map that never set its own. */
export const DEFAULT_TOKEN_SETTINGS: Readonly<ViewAtlasState['tokenSettings']> = {
  showNameplates: false,
  hiddenResources: [],
  showInstanceBadges: true,
  tokenRingSize: 1,
};

const createInitialState = (): Pick<ViewAtlasState, 'schema' | 'version' | 'mapPath' | 'background' | 'grid' | 'objects' | 'camera' | 'persistenceEnabled' | 'widgetSettings' | 'widgetValues' | 'dmNotePath' | 'tokenSettings' | 'initiative' | 'diceLog' | 'pinnedNotePreviews' | 'lootRoller' | 'lighting' | 'exploredMask' | 'exploredEdits'> => ({
  lighting: { ...DEFAULT_SCENE_LIGHTING },
  exploredMask: null,
  exploredEdits: 0,
  schema: ATLAS_SCHEMA,
  version: ATLAS_VERSION,
  mapPath: null,
  background: null,
  grid: {
    enabled: true,
    visible: true,
    snapToGrid: true,
    type: 'square',
    size: 70,
    offsetX: 0,
    offsetY: 0,
    opacity: 0.5,
    lineType: 'solid',
    lineWidth: 1
  },
  objects: {
    tokens: {},
    fog: {},
    pins: {},
    texts: {},
    drawings: {},
    walls: {},
    lights: {},
    audios: {},
  },
  camera: { x: 0, y: 0, scale: 1 },
  persistenceEnabled: true,
  widgetSettings: createDefaultWidgets(),
  widgetValues: {}, // Widget values stored separately
  dmNotePath: null, // DM note linking
  tokenSettings: {
    showNameplates: false,
    hiddenResources: [],
    showInstanceBadges: true,
    tokenRingSize: 1
  },
  initiative: createDefaultInitiativeState(),
  diceLog: [],
  pinnedNotePreviews: {},
  lootRoller: createInitialLootRollerState(),
});

/**
 * Fields an update may set on a token. `Character` is a superset of `Token`, so its
 * fields cover both kinds; an explicit `undefined` clears a field (statblock unlinking).
 */
export type TokenUpdates = { [K in Exclude<keyof Character, 'id' | 'kind'>]?: Character[K] | undefined };

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

  const createDelayedStorage = () => {
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
  
  const store = create<ViewAtlasState>()(
    temporal(
      subscribeWithSelector(
        persist(
          immer<ViewAtlasState>((set, get) => ({
          // Initialize with default state
          ...createInitialState(),
          
          // Player view state (set during creation)
          isPlayerView: isPlayerView,
          isGMView: true,

          // Selection and tool state (not persisted)
          selectedIds: [],
          activeTool: 'move',
          selectionMode: 'box' as const,
          isDragging: false,
          
          // Collection management (not persisted)
          ...(plugin && { plugin }),
          currentCollectionId: 'default', // Default to 'default' collection
          
          // DM screen state
          dmNotePath: null,
          
          // Token settings
          tokenSettings: { ...DEFAULT_TOKEN_SETTINGS },
          
          // Per-store persistence control (not persisted)
          persistenceEnabled: true,
          setPersistenceEnabled: (enabled) => set((draft) => {
            draft.persistenceEnabled = enabled;
          }),
          
          mapLoaded: false,
          setMapLoaded: (loaded) => set((draft) => {
            draft.mapLoaded = loaded;
          }),

          // Loading state (not persisted)
          isMapLoading: false,
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

          // Set grid state
          setGrid: (grid) => set((draft) => {
            draft.grid = grid;
          }),
          
          // Set grid units
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
          
          // Set snap to grid
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

          // Add a new token and return its ID
          addToken: (data) => get().addTokens([data])[0]!,

          addTokens: (entries) => {
            const ids: string[] = [];
            set((draft) => {
              for (const data of entries) {
                const id = data.id ?? `tok_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
                // Normalize the image path to prevent app:// URLs
                const imagePath = normalizeImagePath(data.imagePath);
                const instanceNumber = computeNextInstanceNumber(draft.objects.tokens, imagePath);
                draft.objects.tokens[id] = { ...data, id, kind: data.kind ?? 'token', imagePath, instanceNumber } as TokenEntity;
                ids.push(id);
              }
              raiseTokens(draft.objects.tokens, ids);
            });
            return ids;
          },

          // Add a new character and return its ID
          addCharacter: (data) => {
            const id = `char_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
            const normalizedImagePath = normalizeImagePath(data.imagePath);

            const instanceNumber = computeNextInstanceNumber(get().objects.tokens, normalizedImagePath);

            const token: Character = {
              id,
              kind: 'character',
              x: data.x,
              y: data.y,
              imagePath: normalizedImagePath,
              name: data.name,
              instanceNumber,
              ...(data.notePath && { notePath: data.notePath }),
              ...(data.snapped !== undefined && { snapped: data.snapped }),
              ...(data.ringColor && { ringColor: data.ringColor }),
              ...(data.showRing !== undefined && { showRing: data.showRing }),
            };
            set((draft) => {
              draft.objects.tokens[id] = token;
              raiseTokens(draft.objects.tokens, [id]);
            });
            return id;
          },

          addTokenWithId: (id, data, extra) => {
            const normalizedImagePath = normalizeImagePath(data.imagePath);
            const instanceNumber = computeNextInstanceNumber(get().objects.tokens, normalizedImagePath);

            set((draft) => {
              const char: Character = {
                id,
                kind: 'character',
                x: data.x,
                y: data.y,
                imagePath: normalizedImagePath,
                name: extra.name,
                instanceNumber,
                ...(extra.notePath && { notePath: extra.notePath }),
                ...(data.snapped !== undefined && { snapped: data.snapped }),
              };
              draft.objects.tokens[id] = char;
              raiseTokens(draft.objects.tokens, [id]);
            });
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

          deleteToken: (id) => set((draft) => {
            delete draft.objects.tokens[id];
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

          dropTokens: (positions) => set((draft) => {
            for (const { id, x, y } of positions) {
              const token = draft.objects.tokens[id];
              if (token) {
                token.x = x;
                token.y = y;
              }
            }
            raiseTokens(draft.objects.tokens, positions.map(({ id }) => id));
            if (Object.keys(draft.heldTokens).length > 0) draft.heldTokens = {};
            draft._audioDirty = true;
          }),

          deleteTokens: (ids) => set((draft) => {
            if (!ids || !Array.isArray(ids)) {
              console.warn(`[ViewStore-${viewId}] Invalid ids provided to deleteTokens:`, ids);
              return;
            }
            ids.forEach(id => delete draft.objects.tokens[id]);
            
            // Remove deleted token IDs from selection
            draft.selectedIds = draft.selectedIds.filter(selectedId => !ids.includes(selectedId));
          }),

          deleteSelected: () => get().removeMapObjects(get().selectedIds),

          // --- Copy, paste and duplicate (from mapObjectsSlice.ts) ---
          ...createMapObjectsActions(set, get),

          deleteMapObject: (type: 'token' | 'fog' | 'pin' | 'text' | 'drawing' | 'wall' | 'light' | 'audio', id: string) => set((draft) => {
            switch (type) {
              case 'token':
                if (draft.objects.tokens[id]) {
                  delete draft.objects.tokens[id];
                  // Remove from selection if selected
                  draft.selectedIds = draft.selectedIds.filter(selectedId => selectedId !== id);
                }
                break;
              case 'fog':
                if (draft.objects.fog[id]) {
                  delete draft.objects.fog[id];
                  draft.selectedIds = draft.selectedIds.filter(selectedId => selectedId !== id);
                }
                break;
              case 'pin':
                if (draft.objects.pins[id]) {
                  delete draft.objects.pins[id];
                  // Remove from selection if selected
                  draft.selectedIds = draft.selectedIds.filter(selectedId => selectedId !== id);
                }
                break;
              case 'text':
                if (draft.objects.texts[id]) {
                  delete draft.objects.texts[id];
                  // Remove from selection if selected
                  draft.selectedIds = draft.selectedIds.filter(selectedId => selectedId !== id);
                }
                break;
              case 'drawing':
                if (draft.objects.drawings[id]) {
                  delete draft.objects.drawings[id];
                  // Remove from selection if selected
                  draft.selectedIds = draft.selectedIds.filter(selectedId => selectedId !== id);
                }
                break;
              case 'wall':
                if (draft.objects.walls[id]) {
                  delete draft.objects.walls[id];
                  draft.selectedIds = draft.selectedIds.filter(selectedId => selectedId !== id);
                }
                break;
              case 'light':
                if (draft.objects.lights[id]) {
                  delete draft.objects.lights[id];
                  draft.selectedIds = draft.selectedIds.filter(selectedId => selectedId !== id);
                }
                break;
              case 'audio':
                if (draft.objects.audios[id]) {
                  delete draft.objects.audios[id];
                  draft.selectedIds = draft.selectedIds.filter(selectedId => selectedId !== id);
                  draft._audioDirty = true;
                }
                break;
              default:
                break;
            }
          }),
          
          // DM screen actions
          setDMNotePath: (path) => set((draft) => {
            draft.dmNotePath = path;
          }),

          // Token settings
          setTokenSettings: (settings) => set((draft) => {
            draft.tokenSettings = settings;
          }),

          // Note Pin actions
          addNotePin: (x, y, notePath, icon, options) => {
            const id = `pin_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
            set((draft) => {
              const newPin: NotePin = { 
                id, 
                kind: 'pin',
                x, 
                y, 
                notePath
              };
              if (icon) {
                newPin.icon = icon;
              }
              if (options?.hex) {
                newPin.hex = true;
              }
              if (isPinLabelKind(icon)) {
                newPin.label = nextPinLabel(draft.objects.pins, icon);
              }
              draft.objects.pins[id] = newPin;
            });
            return id;
          },

          updateNotePin: (id, updates) => set((draft) => {
            const pin = draft.objects.pins[id];
            if (pin) {
              const kindChanged = updates.icon !== undefined && updates.icon !== pin.icon;
              Object.assign(pin, updates);
              // A pin keeps its label for life; only moving it to another sequence re-labels it
              if (kindChanged) {
                delete pin.label;
                if (isPinLabelKind(pin.icon)) {
                  pin.label = nextPinLabel(draft.objects.pins, pin.icon);
                }
              }
            }
          }),

          moveNotePin: (id, x, y) => set((draft) => {
            const pin = draft.objects.pins[id];
            if (pin) {
              pin.x = x;
              pin.y = y;
            }
          }),

          deleteNotePin: (id) => set((draft) => {
            if (draft.objects.pins[id]) {
              delete draft.objects.pins[id];
              draft.selectedIds = draft.selectedIds.filter(selectedId => selectedId !== id);
            }
          }),

          // Text element actions
          addText: (data) => {
            const id = `text_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
            set((draft) => {
              const textElement: TextElement = {
                id,
                kind: 'text',
                ...data
              };
              draft.objects.texts[id] = textElement;
            });
            return id;
          },

          updateText: (id, updates) => set((draft) => {
            const text = draft.objects.texts[id];
            if (text) {
              Object.assign(text, updates);
            }
          }),

          moveText: (id, x, y) => set((draft) => {
            const text = draft.objects.texts[id];
            if (text) {
              text.x = x;
              text.y = y;
            }
          }),

          deleteText: (id) => set((draft) => {
            if (draft.objects.texts[id]) {
              delete draft.objects.texts[id];
              draft.selectedIds = draft.selectedIds.filter(selectedId => selectedId !== id);
            }
          }),

          setTexts: (texts) => set((draft) => {
            draft.objects.texts = texts;
          }),

          // Drawing actions
          addDrawing: (data) => {
            const id = `drawing_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
            set((draft) => {
              const drawingStroke: DrawingStroke = {
                id,
                kind: 'drawing',
                timestamp: Date.now(),
                ...data,
                // Create a deep copy of points array to avoid frozen object issues
                points: data.points.map((p: { x: number; y: number }) => ({ x: p.x, y: p.y }))
              };
              draft.objects.drawings[id] = drawingStroke;
            });
            return id;
          },

          moveDrawings: (ids, dx, dy) => set((draft) => {
            for (const id of ids) {
              const drawing = draft.objects.drawings[id];
              if (!drawing) continue;
              for (const point of drawing.points) {
                point.x += dx;
                point.y += dy;
              }
            }
          }),

          updateDrawings: (ids, updates) => set((draft) => {
            for (const id of ids) {
              const drawing = draft.objects.drawings[id];
              if (drawing) Object.assign(drawing, updates);
            }
          }),

          deleteDrawing: (id) => set((draft) => {
            if (draft.objects.drawings[id]) {
              delete draft.objects.drawings[id];
              draft.selectedIds = draft.selectedIds.filter(selectedId => selectedId !== id);
            }
          }),

          clearDrawings: () => set((draft) => {
            draft.objects.drawings = {};
          }),

          setDrawings: (drawings) => set((draft) => {
            // Create a new object to ensure Immer detects the change
            draft.objects.drawings = { ...drawings };
          }),

          // Fog actions
          addFogOperation: (data) => {
            const id = `fog_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
            set((draft) => {
              const op: FogOperation = {
                id,
                kind: 'fog',
                timestamp: Date.now(),
                ...data,
              };
              draft.objects.fog[id] = op;
            });
            return id;
          },

          deleteFogOperation: (id) => set((draft) => {
            if (draft.objects.fog[id]) {
              delete draft.objects.fog[id];
              draft.selectedIds = draft.selectedIds.filter(sid => sid !== id);
            }
          }),

          deleteFogOperations: (ids) => set((draft) => {
            for (const id of ids) {
              delete draft.objects.fog[id];
            }
            draft.selectedIds = draft.selectedIds.filter(sid => !ids.includes(sid));
          }),

          duplicateFogOperations: (ids) => set((draft) => {
            if (!ids || !Array.isArray(ids)) return;
            const newIds: string[] = [];
            ids.forEach(id => {
              const original = draft.objects.fog[id];
              if (original && !original.isErasing) {
                const newId = `fog_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
                const offset = 40;
                draft.objects.fog[newId] = {
                  ...original,
                  id: newId,
                  timestamp: Date.now(),
                  offsetX: (original.offsetX ?? 0) + offset,
                  offsetY: (original.offsetY ?? 0) + offset,
                };
                newIds.push(newId);
              }
            });
            draft.selectedIds = newIds;
          }),

          setFogOperations: (fog) => set((draft) => {
            draft.objects.fog = { ...fog };
          }),

          clearFog: () => set((draft) => {
            draft.objects.fog = {};
          }),

          setSceneLighting: (changes) => set((draft) => {
            Object.assign(draft.lighting, changes);
            for (const field of Object.keys(changes) as SceneLightingOption[]) {
              if (changes[field] === undefined) delete draft.lighting[field];
            }
            draft.lighting.ambient = Math.min(1, Math.max(0, draft.lighting.ambient));
            if (draft.lighting.litThreshold !== undefined) draft.lighting.litThreshold = clampLitThreshold(draft.lighting.litThreshold);
          }),

          setExploredMask: (dataUrl) => set((draft) => {
            draft.exploredMask = dataUrl;
          }),

          setExploredEdits: (count) => set((draft) => {
            draft.exploredEdits = count;
          }),

          // Audio dirty flag
          _audioDirty: false,
          markAudioDirty: () => set((draft) => { draft._audioDirty = true; }),
          consumeAudioDirty: () => {
            const dirty = get()._audioDirty;
            if (dirty) set((draft) => { draft._audioDirty = false; });
            return dirty;
          },

          // Wall actions
          addWall: (data) => {
            const id = `wall_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
            set((draft) => {
              draft.objects.walls[id] = { id, kind: 'wall', ...data };
              draft._audioDirty = true;
            });
            return id;
          },

          updateWall: (id, changes) => set((draft) => {
            const wall = draft.objects.walls[id];
            if (wall) {
              Object.assign(wall, changes);
              // A field given as undefined is removed: the wall is as if it never had it.
              for (const key of Object.keys(changes) as (keyof WallSegment)[]) if (changes[key] === undefined) delete wall[key];
              draft._audioDirty = true;
            }
          }),

          deleteWall: (id) => set((draft) => {
            delete draft.objects.walls[id];
            draft.selectedIds = draft.selectedIds.filter(sid => sid !== id);
            draft._audioDirty = true;
          }),

          deleteWalls: (ids) => set((draft) => {
            for (const id of ids) {
              delete draft.objects.walls[id];
            }
            draft.selectedIds = draft.selectedIds.filter(sid => !ids.includes(sid));
            draft._audioDirty = true;
          }),

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

          // Light actions
          addLight: (data) => {
            const id = `light_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
            set((draft) => {
              draft.objects.lights[id] = { id, kind: 'light', ...data };
            });
            return id;
          },

          updateLight: (id, changes) => set((draft) => {
            const light = draft.objects.lights[id];
            if (!light) return;
            Object.assign(light, changes);
            // A field given as undefined is removed, not stored as undefined.
            for (const field of Object.keys(changes) as (keyof LightChanges)[]) {
              if (changes[field] === undefined) delete light[field];
            }
          }),

          deleteLight: (id) => set((draft) => {
            delete draft.objects.lights[id];
            draft.selectedIds = draft.selectedIds.filter(sid => sid !== id);
          }),

          // Light zones: map geometry like walls, in the order they were drawn
          addLightZone: (data) => {
            const id = `zone_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
            set((draft) => {
              // Whatever is in their place that is no record (a store filled by something else than a load) gives way.
              if (!isRecord(draft.objects.lightZones)) draft.objects.lightZones = {};
              draft.objects.lightZones[id] = { id, kind: 'light-zone', ...data };
            });
            return id;
          },

          updateLightZone: (id, changes) => set((draft) => {
            const zone = draft.objects.lightZones?.[id];
            if (!zone) return;
            Object.assign(zone, changes);
            for (const field of Object.keys(changes) as (keyof LightZoneChanges)[]) {
              if (changes[field] === undefined) delete zone[field];
            }
          }),

          deleteLightZone: (id) => set((draft) => {
            delete draft.objects.lightZones?.[id];
            if (draft.lightZonePopover === id) draft.lightZonePopover = null;
          }),

          // Audio actions
          addAudio: (data) => {
            const id = `audio_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
            set((draft) => {
              draft.objects.audios[id] = { id, kind: 'audio', ...data };
              draft._audioDirty = true;
            });
            return id;
          },

          updateAudio: (id, changes) => set((draft) => {
            const audio = draft.objects.audios[id];
            if (audio) {
              Object.assign(audio, changes);
              draft._audioDirty = true;
            }
          }),

          deleteAudio: (id) => set((draft) => {
            delete draft.objects.audios[id];
            draft.selectedIds = draft.selectedIds.filter(sid => sid !== id);
            draft._audioDirty = true;
          }),

          // Clear all map state when switching maps
          clearMapState: () => set((draft) => {
            // Preserve the mapPath as it's needed for storage operations
            
            // Create completely fresh empty objects to ensure no state bleeds through
            draft.objects = {
              tokens: {},
              fog: {},
              pins: {},
              texts: {},
              drawings: {},
              walls: {},
              lights: {},
              audios: {},
            };
            // Reset grid to defaults
            draft.grid = {
              enabled: true,
              visible: true,
              snapToGrid: true,
              type: 'square',
              size: 70,
              offsetX: 0,
              offsetY: 0,
              opacity: 0.5,
              lineType: 'solid',
              lineWidth: 1
            };
            // Reset camera to origin
            draft.camera = { x: 0, y: 0, scale: 1 };
            draft.selectedIds = [];
            draft.dmNotePath = null;
            // Maps without saved widgets must not inherit the previous map's
            draft.widgetSettings = createDefaultWidgets();
            draft.widgetValues = {};
            draft.pinnedNotePreviews = {};
            draft.lootRoller = createInitialLootRollerState();
            draft.lighting = { ...DEFAULT_SCENE_LIGHTING };
            draft.exploredMask = null;
            draft.exploredEdits = 0;
            Object.assign(draft, createInitialAddonState(), addonInitialState());

            // Note: We don't clear background here - it will be set by the new map
            // Note: We don't clear mapPath - it must be preserved for storage adapter
            
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

          clearTokenConditions: (id) => set((draft) => {
            const token = draft.objects.tokens[id];
            if (!token) {
              console.warn(`[ViewStore-${viewId}] clearTokenConditions: token not found`, id);
              return;
            }

            delete token.conditions;
            delete token.conditionValues;
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
              delete token.conditions;
              delete token.conditionValues;
            }
          }),

          // --- Initiative Tracker State & Actions (from initiativeSlice.ts) ---
          initiative: createDefaultInitiativeState(),
          initiativeTrackerOpen: false,
          ...createInitiativeActions(set, viewId),

          // --- Dice Roll Log (persisted per map) ---
          diceLog: [],
          addDiceLogEntry: (entry: DiceRollResult) => set((draft) => {
            draft.diceLog.unshift(entry);
            if (draft.diceLog.length > 20) {
              draft.diceLog = draft.diceLog.slice(0, 20);
            }
          }),
          clearDiceLog: () => set((draft) => {
            draft.diceLog = [];
          }),

          // --- Pinned note previews (persisted per map) ---
          pinnedNotePreviews: {},
          ...createPinnedNotePreviewActions(set),

          // --- Loot roller window (persisted per map) ---
          lootRoller: createInitialLootRollerState(),
          ...createLootRollerActions(set),

          // --- Add-ons (src/addons/*): object mask plus each add-on's own state ---
          ...createInitialAddonState(),
          ...createAddonActions(set),
          ...({ ...addonInitialState(), ...addonActions(set, get) } as unknown as AddonViewState),

          // --- Per-view UI visibility (from uiSlice.ts) ---
          ...createInitialUIState(),
          ...createUIActions(set),

        })),
        {
          name: `atlas-view-${viewId}`,
          
          // Create a unique storage adapter for this view that uses this store instance
          storage: createDelayedStorage(),
          
          // Store version for migrations
          version: ATLAS_VERSION,
          
          // Skip automatic hydration on store creation
          skipHydration: true,
          
          // Only persist relevant parts of state (check per-store persistence control)
          partialize: (state): PersistedViewState => {
            // Use per-store persistence control instead of global
            if (!state.persistenceEnabled) {
              return {};
            }

            // Collection-wide widgets are saved in the collection settings, not in the scene
            const sceneWidgets = withoutCollectionWidgets({
              widgets: state.widgetSettings.widgets,
              widgetValues: state.widgetValues,
            });
            
            return {
              schema: state.schema,
              version: state.version,
              mapPath: state.mapPath, // Include mapPath to verify data belongs to correct map
              background: state.background,
              grid: state.grid,
              objects: state.objects,
              camera: state.camera,
              widgetValues: sceneWidgets.widgetValues,
              widgetSettings: { ...state.widgetSettings, widgets: sceneWidgets.widgets },
              dmNotePath: state.dmNotePath, // DM note linking
              tokenSettings: state.tokenSettings, // Token display settings
              initiative: state.initiative, // Initiative tracker state
              initiativeTrackerOpen: state.initiativeTrackerOpen, // Initiative tracker open/closed state
              diceLog: state.diceLog, // Dice roll history (last 20 per map)
              pinnedNotePreviews: state.pinnedNotePreviews, // Pinned note preview windows
              lootRoller: state.lootRoller, // Loot roller window, filters and history
              lighting: state.lighting,
              exploredMask: state.exploredMask,
              ...addonPersistedState(state), // Add-on fields saved in the scene
            };
          },
          
          // The map file arrives unchecked; fields that need it are checked here, once per load.
          merge: (persisted, current): ViewAtlasState => {
            const saved: Partial<ViewAtlasState> = isRecord(persisted) ? persisted : {};
            return {
              ...current,
              ...saved,
              lootRoller: readLootRollerState(saved.lootRoller),
              lighting: readSceneLighting(saved.lighting),
              exploredMask: readExploredMask(saved.exploredMask),
              // Counted per session: a file never brings one.
              exploredEdits: current.exploredEdits,
              ...addonRestoredState(saved),
            };
          },

          onRehydrateStorage: () => hydrations.reporter((error) => {
            console.error(`[ViewStore-${viewId}] Hydration failed:`, error);
          }),
        }
      )
    ),
    // Undo/redo tracks objects, grid, background, widgetValues and the count of explored-memory
    // edits only; selection, camera, tool and loading state never enter the history.
    // storeRef is assigned right after creation, before any history call.
    createHistoryOptions<ViewAtlasState>(() => storeRef!.getState())
  )
);

  // Set the store reference after creation
  storeRef = store;

  // A renderer that fails on some state must not keep the others, or a scene load, from going on
  isolateListeners(store, (error) => {
    console.error(`[ViewStore-${viewId}] A store subscriber failed:`, error);
  });

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
