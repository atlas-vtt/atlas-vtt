import type { FederatedPointerEvent } from 'pixi.js';
import type { AnnotationPointerHandlers } from '../annotations/annotationPointer';
import type { AreaToolPointer } from '../areas/PolygonAreaEditor';
import type { FogMenuPointerHandlers } from '../fog/FogOfWarRenderer';
import type { HexLinkPointerHandlers } from '../hexLinks/HexLinkInteraction';
import type { LightPointerHandlers } from '../lighting/LightInteraction';
import type { MapFeaturePointerHandlers } from '../mapFeatures/MapFeatureInteraction';
import type { MeasurePointerHandlers } from '../measure/measureHandle';

/** A world point of the map under the pointer, and the event that put it there. */
export interface PointerAt {
  readonly x: number;
  readonly y: number;
  readonly event: FederatedPointerEvent;
}

/** What the view says about who may take the pointer. */
export interface PointerContext {
  readonly tool: string;
  /** The select and move tools: they take tokens, their bars and frame, drawings on the map and linked hexes. */
  readonly tokenTool: boolean;
  /** Whether the canvas shows the GM's view: not session view, a peek or the palette's player mode. */
  gmView(): boolean;
  /** The ids selected now, read when asked: a press may change them. */
  selectedIds(): readonly string[];
  clearSelection(): void;
}

/** Note pins, with any tool. */
export interface PinPointer {
  hitTest(x: number, y: number): string | null;
  /** A press of pin `id`: a primary one drags or opens it, a secondary one opens its menu. */
  press(id: string, event: FederatedPointerEvent): void;
  /** The pointer is over pin `id`, or over none (null). */
  hover(id: string | null, event?: FederatedPointerEvent): void;
}

/** Door badges: a click opens or closes the door whose badge shows, a right-click opens the menu of the GM's badge. */
export interface DoorPointer {
  /** Opens or closes the door whose shown badge is at the point; true when one was there. */
  click(x: number, y: number): boolean;
  /** Whether a primary press at the point opens or closes a door, with the lighting tool in hand or another. */
  pressActsAt(x: number, y: number, lightingTool: boolean): boolean;
  /** The door whose GM badge is at the point, while those show. */
  menuHitTest(x: number, y: number): string | null;
  openMenu(doorId: string, screenX: number, screenY: number): void;
}

/** The lighting tool: walls, lights' editing modes, zones and explored memory. */
export interface WallToolPointer {
  /** A primary press; true when the tool took it. */
  pointerDown(x: number, y: number, event: FederatedPointerEvent): boolean;
  pointerMove(x: number, y: number, event: FederatedPointerEvent): void;
  pointerUp(): void;
  /** A press the tool was handed is lost (a second finger, a touch the system took): what it drew goes. */
  pointerCancel(): void;
  doubleClick(): void;
  /** Whether the tool's menu has something to open at the point. */
  menuAt(x: number, y: number): boolean;
  openMenu(x: number, y: number, screenX: number, screenY: number): void;
  cursorAt(x: number, y: number): string;
}

/** The sound tool: a press places a sound or picks the one there. */
export interface SoundPointer {
  pointerDown(x: number, y: number): boolean;
}

/** Tokens and the bars of a selection of them. */
export interface TokenPointer {
  /** The topmost token at the point, or null. */
  hitTest(x: number, y: number): string | null;
  /** A press on token `id`: a secondary one opens its menu, any other may select, drag or turn it. */
  press(id: string, event: FederatedPointerEvent): void;
  /** Whether a press on a token opens its menu: not in the local player view. */
  offersMenu(): boolean;
  /** With a tool that takes tokens, the pointer is over token `id`, or over none (null). */
  hover(id: string | null, event?: FederatedPointerEvent): void;
  /** With another tool, the token whose statblock a Ctrl/Cmd hover previews, or none (null). */
  preview(id: string | null, event?: FederatedPointerEvent): void;
  /** The resource of the selection's bar at the world point, or null. */
  barAt(x: number, y: number): string | null;
  /** Opens the change of the bar `key` for the whole selection; true when it opened. */
  pressBar(key: string, event: FederatedPointerEvent): boolean;
  /** The pointer is over the selection's bar `key`, or over none (null). */
  hoverBar(key: string | null): void;
  /** Drags the selected tokens with the press `event`; nothing when none is selected. */
  dragSelected(event: FederatedPointerEvent): void;
  /** Whether this view's pointer is dragging tokens: nothing else is hovered meanwhile. */
  dragging(): boolean;
}

/** The frame around a selection of two or more. */
export interface GroupFramePointer {
  contains(x: number, y: number): boolean;
}

/** Every layer on the map that takes the pointer. Each is attached by its owner when it is built. */
export interface MapLayers {
  measureHandles: MeasurePointerHandlers;
  pins: PinPointer;
  doors: DoorPointer;
  lights: LightPointerHandlers;
  annotations: AnnotationPointerHandlers;
  stairs: AreaToolPointer;
  walls: WallToolPointer;
  sounds: SoundPointer;
  tokens: TokenPointer;
  groupFrame: GroupFramePointer;
  hexLinks: HexLinkPointerHandlers;
  mapFeatures: MapFeaturePointerHandlers;
  fog: FogMenuPointerHandlers;
}

export type LayerId = keyof MapLayers;
export type AttachedLayers = Partial<MapLayers>;

/**
 * What a secondary press does where a layer has its menu. Most open it when the press is released
 * in place, since a right-drag pans; a pin and a token take the press itself. `opens` says whether
 * a menu opens at all (the lighting tool's offers nothing beside the walls without a selection).
 */
export type MenuClaim =
  | { readonly on: 'release'; readonly opens: boolean; readonly open: (up: FederatedPointerEvent) => void }
  | { readonly on: 'press'; readonly opens: boolean; readonly press: (event: FederatedPointerEvent) => void };

/**
 * What a layer shows under a moving pointer: its cursor, and whether it covers the layers beneath
 * (a selection's bar lights up over a token without covering it).
 */
export interface HoverClaim {
  readonly cursor: string;
  readonly covers: boolean;
}

/** A press a layer took: claimed, so the viewport's other listeners leave it alone; or acted on and left to the viewport, which may still pan or select. */
export type PressResult = 'claimed' | 'through' | null;
