import { vi } from 'vitest';
import type { FederatedPointerEvent } from 'pixi.js';
import { fingerReaches } from '../../../src/app/pixi/utils/pointerReach';
import { isSecondaryPress } from '../../../src/app/pixi/utils/pointerButtons';

/** What may lie under the pointer, as each layer on the map reports it. */
export type Hit =
  | 'measureHandle' | 'pin' | 'door' | 'doorMenu' | 'light' | 'grip' | 'annotation' | 'annotationMenu'
  | 'stairs' | 'wall' | 'wallMenu' | 'sound' | 'selectionBar' | 'token' | 'groupFrame' | 'hexLink'
  | 'mapFeature' | 'fogMenu';

export const HITS: readonly Hit[] = [
  'measureHandle', 'pin', 'door', 'doorMenu', 'light', 'grip', 'annotation', 'annotationMenu',
  'stairs', 'wall', 'wallMenu', 'sound', 'selectionBar', 'token', 'groupFrame', 'hexLink',
  'mapFeature', 'fogMenu',
];

/** One situation on the map: the tool in hand, the pointer, and what lies under it. */
export interface PointerCase {
  tool: string;
  /** Layers that report a hit within a mouse's reach. */
  hits?: readonly Hit[];
  /** Layers that report a hit only within a finger's wider reach. */
  fingerHits?: readonly Hit[];
  pointer?: 'mouse' | 'touch' | 'pen';
  button?: 0 | 1 | 2;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** Whether the application runs on macOS, where a Ctrl+click is a secondary click. */
  mac?: boolean;
  /** Whether the canvas shows the GM's view (not session view, a peek or the palette's player mode). */
  gmView?: boolean;
  /** The store's local player view: tokens offer no menu and no drag. */
  playerView?: boolean;
  /** Tokens are being placed by hand. */
  placing?: boolean;
  selected?: readonly string[];
}

const ANNOTATION_HITS: ReadonlySet<Hit> = new Set(['grip', 'annotation', 'annotationMenu']);

/** The world point every case presses: the viewports of the drivers are unzoomed, so it is the screen point too. */
export const AT = { x: 120, y: 80 } as const;
/** Where the pointer is in the window. */
export const CLIENT = { x: 420, y: 280 } as const;

/** The fake map: which layers report a hit, what each did, and what each shows as hovered. */
export class PointerWorld {
  current: PointerCase = { tool: 'select' };
  private actions: string[] = [];
  readonly hovered = new Set<string>();

  reset(c: PointerCase): void {
    this.current = c;
    this.actions = [];
    this.hovered.clear();
  }

  hit(layer: Hit): boolean {
    // As the real layers do: drawings and texts answer only the tools that take them, a selection's bars only the token tools
    const { tool } = this.current;
    if (ANNOTATION_HITS.has(layer) && tool !== 'draw' && tool !== 'select' && tool !== 'move') return false;
    if (layer === 'selectionBar' && tool !== 'select' && tool !== 'move') return false;
    if (this.current.hits?.includes(layer)) return true;
    return (this.current.fingerHits?.includes(layer) ?? false) && fingerReaches({ pointerType: this.current.pointer ?? 'mouse' });
  }

  log(action: string): void {
    this.actions.push(action);
  }

  take(): string[] {
    const taken = this.actions;
    this.actions = [];
    return taken;
  }

  hover(name: string, on: boolean): void {
    if (on) this.hovered.add(name);
    else this.hovered.delete(name);
  }

  /** A press or a move at `AT` with the case's pointer, button and keys. */
  event(kind: 'down' | 'move' | 'up', at: { x: number; y: number } = AT): FederatedPointerEvent {
    const c = this.current;
    return {
      button: kind === 'move' ? -1 : c.button ?? 0,
      buttons: kind === 'down' ? 1 : 0,
      ctrlKey: c.ctrl ?? false, shiftKey: c.shift ?? false, altKey: c.alt ?? false, metaKey: false,
      pointerId: 1, pointerType: c.pointer ?? 'mouse',
      clientX: CLIENT.x + at.x - AT.x, clientY: CLIENT.y + at.y - AT.y,
      global: { x: at.x, y: at.y, clone: () => ({ x: at.x, y: at.y }) },
      stopPropagation: vi.fn(), preventDefault: vi.fn(),
    } as unknown as FederatedPointerEvent;
  }

  /** The layers of the map as the fakes the drivers wire: each reports its hit and records what it was asked to do. */
  layers(): FakeLayers {
    const hit = (layer: Hit): boolean => this.hit(layer);
    const log = (action: string): void => this.log(action);
    const hover = (name: string, on: boolean): void => this.hover(name, on);
    return {
      measure: {
        pointerDown: () => hit('measureHandle') && (log('measure:press'), true),
        cursorAt: () => { hover('measure', hit('measureHandle')); return hit('measureHandle') ? 'measure-cursor' : null; },
        leave: () => hover('measure', false),
      },
      pins: {
        hitTest: () => (hit('pin') ? 'pin-1' : null),
        press: (_id, e) => log(isSecondaryPress(e) ? 'pin:menu' : 'pin:press'),
        hover: (type) => hover('pin', type === 'over'),
      },
      doors: {
        click: () => hit('door') && (log('door:toggle'), true),
        pressAt: (_x, _y, lightingTool) => !lightingTool && hit('door'),
        menuHitTest: () => (hit('doorMenu') ? 'door-1' : null),
        openMenu: () => log('door:menu'),
      },
      lights: {
        pointerDown: () => hit('light') && (log('light:press'), true),
        cursorAt: () => { hover('light', hit('light')); return hit('light') ? 'light-cursor' : null; },
        leave: () => hover('light', false),
      },
      annotations: {
        gripDown: () => hit('grip') && (log('grip:press'), true),
        pointerDown: () => hit('annotation') && (log('annotation:press'), true),
        menuAt: () => hit('annotationMenu'),
        openMenu: () => hit('annotationMenu') && (log('annotation:menu'), true),
        dragAlong: () => log('annotations:dragAlong'),
        cursorAt: (_x, _y, covered) => {
          const grip = hit('grip');
          const body = !grip && hit('annotation') && (this.current.tool === 'draw' || !covered());
          hover('grip', grip);
          hover('annotation', body);
          return grip ? 'grip-cursor' : body ? 'annotation-cursor' : null;
        },
        leave: () => { hover('grip', false); hover('annotation', false); },
      },
      stairs: {
        pointerDown: () => hit('stairs') && (log('stairs:press'), true),
        pointerMove: () => log('stairs:move'),
        pointerUp: () => log('stairs:up'),
        doubleClick: () => log('stairs:dblclick'),
        cursorAt: () => 'stairs-cursor',
      },
      walls: {
        pointerDown: () => hit('wall') && (log('wall:press'), true),
        pointerMove: () => log('wall:move'),
        pointerUp: () => log('wall:up'),
        pointerCancel: () => log('wall:cancel'),
        doubleClick: () => log('wall:dblclick'),
        openMenu: () => { if (hit('wallMenu')) log('wall:menu'); },
        menuAt: () => hit('wallMenu'),
        cursorAt: () => 'wall-cursor',
      },
      sounds: {
        pointerDown: () => hit('sound') && (log('sound:press'), true),
      },
      hexLinks: {
        hitTest: () => (hit('hexLink') ? 'hex-1' : null),
        hover: (id) => hover('hexLink', id !== null),
        press: () => log('hexLink:press'),
        openContextMenu: () => log('hexLink:menu'),
      },
      mapFeatures: {
        hover: (_world, doorId) => { hover('doorLabel', doorId !== null); hover('feature', doorId === null && hit('mapFeature')); },
        leave: () => { hover('doorLabel', false); hover('feature', false); },
        hitTest: () => (hit('mapFeature') ? 'feature-1' : null),
        openContextMenu: () => log('feature:menu'),
      },
      fog: {
        menuAt: () => hit('fogMenu'),
        openMenu: () => log('fog:menu'),
      },
      groupFrame: () => hit('groupFrame'),
      tokens: {
        hitTest: () => (hit('token') ? 'token-1' : null),
        press: (_id, e) => {
          if (this.current.playerView) return;
          log(isSecondaryPress(e) ? 'token:menu' : 'token:press');
        },
        hover: (id) => hover('token', id !== null),
        uiHover: (id) => hover('tokenUi', id !== null),
        barAt: () => (hit('selectionBar') ? 'hp' : null),
        pressBar: () => (log('selectionBar:press'), true),
        hoverBar: (key) => hover('bar', key !== null),
        groupDrag: () => log('tokens:groupDrag'),
      },
    };
  }
}

type At = (x: number, y: number) => boolean;

export interface FakeLayers {
  measure: { pointerDown: At; cursorAt: (x: number, y: number) => string | null; leave: () => void };
  pins: { hitTest: (x: number, y: number) => string | null; press: (id: string, e: FederatedPointerEvent) => void; hover: (type: 'over' | 'out', id: string) => void };
  doors: { click: At; pressAt: (x: number, y: number, lightingTool: boolean) => boolean; menuHitTest: (x: number, y: number) => string | null; openMenu: (id: string, sx: number, sy: number) => void };
  lights: { pointerDown: At; cursorAt: (x: number, y: number) => string | null; leave: () => void };
  annotations: {
    gripDown: At; pointerDown: At; menuAt: At; openMenu: At; dragAlong: () => void;
    cursorAt: (x: number, y: number, covered: () => boolean, free?: boolean) => string | null; leave: () => void;
  };
  stairs: { pointerDown: () => boolean; pointerMove: () => void; pointerUp: () => void; doubleClick: () => void; cursorAt: () => string };
  walls: {
    pointerDown: At; pointerMove: () => void; pointerUp: () => void; pointerCancel: () => void; doubleClick: () => void;
    openMenu: () => void; menuAt: At; cursorAt: () => string;
  };
  sounds: { pointerDown: At };
  hexLinks: { hitTest: (x: number, y: number) => string | null; hover: (id: string | null) => void; press: () => void; openContextMenu: () => void };
  mapFeatures: { hover: (world: unknown, doorId: string | null) => void; leave: () => void; hitTest: (x: number, y: number) => string | null; openContextMenu: () => void };
  fog: { menuAt: At; openMenu: () => void };
  groupFrame: At;
  tokens: {
    hitTest: (x: number, y: number) => string | null; press: (id: string, e: FederatedPointerEvent) => void;
    hover: (id: string | null) => void; uiHover: (id: string | null) => void;
    barAt: () => string | null; pressBar: () => boolean; hoverBar: (key: string | null) => void; groupDrag: () => void;
  };
}
