import type { TokenEntity, Character, NotePin, TextElement, DrawingStroke } from '../types';
import type { FogOperation } from './fogTypes';
import type { WallSegment } from './wallTypes';
import type { LightSource, LightZone, SceneLighting } from './lightingTypes';
import type { AudioSource } from './audioTypes';
import type { WidgetSettings } from './widgetTypes';
import type { InitiativeState } from './initiativeTypes';
import type { DiceRollResult } from './diceTypes';
import type { CameraState, GridState } from './gridTypes';
import type { ViewUIState } from './viewUIState';

/** Data read from a map view, independent of the store and persistence services. */
export interface ViewState extends ViewUIState {

  // --- Non-persisted fields ---
  // Current map file path (for persistence)
  mapPath: string | null;

  // Per-store persistence control
  persistenceEnabled: boolean;

  /**
   * Whether the store holds the scene at `mapPath` as it was loaded. It does not while
   * a scene loads or after loading failed, and is then never saved to the scene's file.
   */
  mapLoaded: boolean;

  // Loading state
  isMapLoading: boolean;
  mapLoadingProgress?: number;
  mapLoadingMessage?: string;

  // --- Persisted fields ---
  // Schema identifier and version for migrations
  schema: 'atlas-vtt';
  version: number;

  // Map background image path
  background: string | null;

  // Grid configuration
  grid: GridState | null;

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

  /** Dynamic lighting of the scene; saved with the map, never undo-tracked. */
  lighting: SceneLighting;
  /** What the players' tokens have explored, as a PNG data URL; saved with the map, never undo-tracked. */
  exploredMask: string | null;
  /**
   * How many edits by hand led to the explored memory as it is, counted since the scene loaded.
   * The memory itself is no store state, so this count stands for it in the undo history: a
   * memory edit is the step that raises it, and undo and redo reach it in the order the GM
   * worked (`ExploredMemory` puts the memory back when it changes). Never saved.
   */
  exploredEdits: number;

  // Audio dirty flag (non-persisted)
  _audioDirty: boolean;

  // Tool and selection state
  activeTool: 'move' | 'select' | 'fog' | 'text' | 'measure' | 'measure-circle' | 'measure-cone' | 'eraser' | 'asset' | 'note-pin' | 'laser-pointer' | 'draw-pen' | 'draw-eraser' | 'draw-icon' | 'draw-line' | 'draw-rectangle' | 'draw-circle' | 'wall' | 'audio';
  selectionMode: 'box' | 'lasso';
  selectedIds: string[];

  // Drag state
  isDragging: boolean;

  // Widget settings
  widgetSettings: WidgetSettings;
  widgetValues: Record<string, number>; // Widget values separate from definitions

  // Player view state
  isPlayerView: boolean;

  // GM view toggle (semi-transparent fog vs fully opaque)
  isGMView: boolean;

  // DM screen state
  dmNotePath: string | null;

  // Collection management
  currentCollectionId?: string;

  // Token settings
  tokenSettings: {
    showNameplates: boolean;
    /** Keys of the collection's resources this map does not show to the GM; see `resources/sceneVisibility.ts`. */
    hiddenResources: string[];
    showInstanceBadges: boolean;
    tokenRingSize: number;
  };

  // --- Initiative Tracker ---
  initiative: InitiativeState;
  initiativeTrackerOpen: boolean;

  // Dice roll log (persisted per map, capped at 20 entries)
  diceLog: DiceRollResult[];
}

/** Data for a new token; the store assigns the id (unless given), kind default and instance number. */
export type TokenInput = Omit<TokenEntity, 'id' | 'kind'> & { kind?: 'token' | 'character'; id?: string };

/**
 * Fields an update may set on a token. `Character` is a superset of `Token`, so its
 * fields cover both kinds; an explicit `undefined` clears a field (statblock unlinking).
 */
export type TokenUpdates = { [K in Exclude<keyof Character, 'id' | 'kind'>]?: Character[K] | undefined };
