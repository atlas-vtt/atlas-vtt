// types.ts
// Shared interfaces and types for Atlas VTT

import type { InitiativeSide } from './types/initiativeRulesTypes';
import type { LightEmission, TokenVision } from './types/lightingTypes';

/**
 * Note pin object that links to an Obsidian note
 */
export interface NotePin {
  id: string;
  kind: 'pin';
  x: number;
  y: number;
  notePath: string;
  icon?: string; // Optional icon for customized pins
  label?: string; // Auto-assigned sequence label shown by 'number' / 'letter' pins
  gmOnly?: boolean; // Whether the pin is only visible to the GM
  /** Links the note to the grid cell containing (x, y) instead of marking a point; hex grids show that hex, other grids a pin. */
  hex?: boolean;
}

/** A bounded resource value saved on an individual map token. */
export interface TokenResourceValue {
  current: number;
  max: number;
}

/** Base interface for any token entity. */
export interface BaseToken {
  /** False preserves the whole artwork without an Atlas frame. Defaults to true. */
  showRing?: boolean;
  /** Expendable resources by definition key; see `src/app/resources/`. */
  resources?: Record<string, TokenResourceValue>;
  /** Resource keys whose maximum was set by hand and no longer follows the statblock. */
  overriddenMax?: string[];
  id: string;
  x: number;
  y: number;
  imagePath: string;
  tags?: string[];
  /** Hex colour for the Atlas ring; undefined uses white. */
  ringColor?: string;
  /** Active condition IDs referencing ConditionDefinition.id from collection settings */
  conditions?: string[];
  /** Numbers of active valued conditions, by condition id; a valued condition without one has 1. */
  conditionValues?: Record<string, number>;
  /** Whether the token is hidden (visible to DM but not players) */
  isHidden?: boolean;
  /** The side the token fights on where initiative runs by sides. Read with `sideOf`: unset, a token that sees is the players'. */
  side?: InitiativeSide;
  /** How the token sees when the scene has dynamic lighting. */
  vision?: TokenVision;
  /** Light the token carries; it moves with the token. */
  light?: LightEmission;
  /** Whether to show the nameplate (defaults to false) */
  showNameplate?: boolean;
  /** Rotation in degrees (0-360) */
  rotation?: number;
  /** Token size in logical cells (default 1: 1=1x1, 1.5=2x2, 2=3x3, 2.5=4x4, 3=5x5, etc.) */
  size?: number;
  /** Layer for z-ordering (higher values appear on top) */
  layer?: number;
  /** Instance number for distinguishing multiple tokens of the same type (same imagePath) */
  instanceNumber?: number;
}

/**
 * Simple token without character data
 */
export interface Token extends BaseToken {
  kind: 'token';
}

/**
 * Character with a name and optional note and statblock links
 */
export interface Character extends BaseToken {
  kind: 'character';
  name: string;
  difficulty?: string; // CR or tier from statblock
  notePath?: string;
  statblockPath?: string; // Path to linked statblock note
  /** Name read from the linked statblock; the nameplate falls back to it when `name` is empty. */
  statblockName?: string | null;
  // Player-linked token properties
  playerLinked?: boolean; // Whether this token is linked to a player character
  playerId?: string; // The player ID who owns this character
  playerCharacterId?: string; // The character ID in the player's character sheet
}

/**
 * Union of token entities
 */
export type TokenEntity = Token | Character;

/**
 * Everything about a token except its identity and map position.
 * Saved with encounters so spawning reproduces the exact token state.
 */
export type TokenStateSnapshot = Omit<TokenEntity, 'id' | 'x' | 'y' | 'instanceNumber'>;

/**
 * Text element object for map annotations
 */
export interface TextElement {
  id: string;
  kind: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  backgroundColor?: string;
  padding?: number;
  borderRadius?: number;
  opacity?: number;
  width?: number; // Auto-size if not set
  height?: number; // Auto-size if not set
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  italic?: boolean;
  /** Rotation in degrees (0-360) */
  rotation?: number;
  /** Text scale multiplier (default 1) */
  scale?: number;
}

/**
 * Drawing types. Add-ons add theirs from their own folder
 * (`declare module 'src/app/types' { interface DrawingTypeRegistry { area: true } }`)
 * and draw them through `drawingShapes`.
 */
export interface DrawingTypeRegistry {
  pen: true;
  eraser: true;
  line: true;
  rectangle: true;
  circle: true;
  icon: true;
}

export type DrawingType = keyof DrawingTypeRegistry;

export interface DrawingStroke {
  id: string;
  kind: 'drawing';
  timestamp: number;
  type: DrawingType;
  points: Array<{ x: number; y: number }>;
  color: string;
  /** Line width for strokes, footprint size for `icon` stamps */
  width: number;
  opacity: number;
  /** Key into `MAP_ICON_SVG`; only set when `type` is `'icon'` */
  icon?: string;
}

export type ToolMode =
  | 'move'
  | 'pan'
  | 'select'
  | 'fog-paint'
  | 'fog-erase'
  | 'measure'
  | 'measure-circle'
  | 'measure-cone'
  | 'pointer'
  | 'text'
  | 'note-pin'
  | 'dice'
  | 'laser-pointer'
  | 'draw-pen'
  | 'draw-eraser'
  | 'draw-icon'
  | 'draw-line'
  | 'draw-rectangle'
  | 'draw-circle'
  | 'audio';

 