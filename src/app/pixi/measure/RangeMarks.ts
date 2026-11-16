import { Container, type FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { StoreApi } from 'zustand/vanilla';
import { levelObjects } from '../../levels/levelObjects';
import { NO_MOVEMENT_RULES } from '../../measure/movementRules';
import { rangeCheckPair } from '../../measure/rangeCheck';
import type { RangeOrigin } from '../../measure/rangeOutline';
import { rangeRings, type RangeRing } from '../../measure/rangeRings';
import type { TokenGrid } from '../../measure/tokenDistance';
import { mapTokens } from '../../tokens/offMap';
import type { TokenEntity } from '../../types';
import type { ViewState } from '../../types/viewState';
import type { Point } from '../../types/visionTypes';
import { MAP_LAYER_Z } from '../mapLayerOrder';
import type { TokenMovement } from '../token-renderer/tokenMovement';
import { destroyTree } from '../utils/destroyTree';
import { isHandled } from '../utils/handledEvents';
import { MeasureInkLayer } from '../utils/measureInk';
import type { MeasureLook } from './DrawnMeasure';
import { RangeCheck } from './RangeCheck';
import { RangeRings } from './RangeRings';

type RangeState = Pick<ViewState, 'activeTool' | 'grid' | 'objects' | 'levels' | 'viewedLevel' | 'measureTool' | 'mapPath' | 'selectedIds'>;

/** What the range marks read of their view's state; they write nothing. */
export type RangeStore = Pick<StoreApi<RangeState>, 'getState' | 'subscribe'>;

/** What the range marks ask of the map's tokens. */
export interface RangeSources {
  /** The token drawn on top at a world point, as a click picks it; never one the canvas hides. */
  tokenAt(x: number, y: number): string | null;
  /** The map's movement rules and its tokens' speeds. */
  movement: Pick<TokenMovement, 'rules' | 'speedOf' | 'prepare'>;
}

export interface RangeMarksDeps {
  viewport: Viewport;
  store: RangeStore;
  /** What measurements are drawn by now: the zoom, the grid, the map's rules and the accent. */
  look: () => MeasureLook;
  /** A measurement is being made: nothing is hovered meanwhile. */
  measuring: () => boolean;
  /** The tokens under the pointer and their speeds; without them nothing is hovered and movement steps have no rings. */
  sources: () => RangeSources | null;
}

/** What the rings stand around: a token, by its id and as it was when they were drawn, or a point. */
type RingTarget = { readonly token: TokenEntity } | { readonly point: Point };

const shownTokens = (state: RangeState): Readonly<Record<string, TokenEntity>> => mapTokens(levelObjects(state));

/**
 * The measure tool's marks that are no measurements: the range check (with one token selected,
 * a dashed line and the distance to the token under the pointer) and the rings of the Ranges
 * mode (a press on a token or a point shows its bands or its movement steps around it; a press on
 * the same token, Escape, another mode, level or scene, or the tool put away takes them off).
 * Nothing here writes the store or starts a measurement, and both are the GM's own: `view` is
 * shown on the GM's view of the canvas alone (`MeasurePartsVisibility`), never in a players'
 * frame, the session view, a peek or a picture of the scene. Rings follow their token when it
 * moves and go with it; neither is drawn again while nothing changes.
 */
export class RangeMarks {
  /** Everything the marks draw, for what shows and hides it. */
  readonly view = new Container({ label: 'range-marks', zIndex: MAP_LAYER_Z.measure, eventMode: 'none', interactiveChildren: false });
  private readonly ink = new MeasureInkLayer('range-ink');
  private readonly labels = new Container({ label: 'range-labels', eventMode: 'none', interactiveChildren: false });
  private readonly check: RangeCheck;
  private readonly rings: RangeRings;
  private enabled = false;
  private hovered: string | null = null;
  private target: RingTarget | null = null;
  private readonly stopStore: () => void;

  constructor(private readonly deps: RangeMarksDeps) {
    this.view.addChild(this.ink.view, this.labels);
    this.rings = new RangeRings(this.ink, this.labels);
    // Made after the rings: the check's line and label lie above them.
    this.check = new RangeCheck(this.ink, this.labels);
    deps.viewport.addChild(this.view);
    this.stopStore = deps.store.subscribe((state, previous) => this.follow(state, previous));
    this.setEnabled(deps.store.getState().activeTool === 'measure');
  }

  /** The texts on the map now: the check's distance, and the rings' names from the innermost; for tests. */
  get texts(): { readonly check: string; readonly rings: readonly string[] } {
    return { check: this.check.text, rings: this.rings.texts };
  }

  /** Escape takes the rings off; false when there were none. */
  handleEscape(): boolean {
    if (!this.rings.shown) return false;
    this.clearRings();
    return true;
  }

  /** Draws what is shown again where it is: the zoom or the theme changed. */
  redraw(): void {
    if (!this.check.shown && !this.rings.shown) return;
    const look = this.deps.look();
    this.check.redraw(this.grid(look), look);
    this.rings.redraw(look);
  }

  /** The map's rules may be others: rings are worked out again, and the check's distance written again. */
  rulesChanged(): void {
    this.showRings();
    this.showCheck(true);
  }

  destroy(): void {
    this.stopStore();
    this.setEnabled(false);
    this.check.destroy();
    this.rings.destroy();
    this.ink.destroy();
    destroyTree(this.view);
  }

  /** The canvas the viewport takes its pointer from; a viewport that was given no event system has none. */
  private get canvas(): HTMLElement | undefined {
    const options: Partial<Viewport['options']> | undefined = this.deps.viewport.options;
    return options?.events?.domElement;
  }

  /** Listens to the pointer while the measure tool is chosen; put away, nothing of it stays. */
  private setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    const { viewport } = this.deps;
    const change = enabled ? 'on' : 'off';
    viewport[change]('pointermove', this.onPointerMove);
    viewport[change]('pointerdown', this.onPointerDown);
    if (enabled) this.canvas?.addEventListener('pointerleave', this.onPointerLeave);
    else this.canvas?.removeEventListener('pointerleave', this.onPointerLeave);
    if (!enabled) {
      this.hover(null);
      this.clearRings();
    }
  }

  private readonly onPointerMove = (e: FederatedPointerEvent): void => {
    // Hidden, the marks are not the GM's to see (the canvas shows the players' view): nothing is worked out.
    if (!this.view.visible || this.deps.measuring()) {
      this.hover(null);
      return;
    }
    const world = this.deps.viewport.toWorld(e.global);
    this.hover(this.deps.sources()?.tokenAt(world.x, world.y) ?? null);
  };

  /** A press ends the check until the pointer moves again (a measurement may start with it), and in the Ranges mode picks what the rings stand around. */
  private readonly onPointerDown = (e: FederatedPointerEvent): void => {
    if (e.button !== 0) return;
    this.hover(null);
    // A kept measurement's handle, a pin, a door badge or a light marker may have taken the press.
    if (isHandled(e) || !this.view.visible || this.deps.store.getState().measureTool.mode !== 'ranges') return;
    e.stopPropagation();
    this.pick(this.deps.viewport.toWorld(e.global));
  };

  private readonly onPointerLeave = (): void => this.hover(null);

  private follow(state: RangeState, previous: RangeState): void {
    this.setEnabled(state.activeTool === 'measure');
    if (!this.enabled) return;
    const sameScene = state.mapPath === previous.mapPath && state.viewedLevel === previous.viewedLevel;
    if (!sameScene || state.measureTool.mode !== 'ranges') this.clearRings();
    if (!sameScene) this.hover(null);
    // With nothing on the map, a store write is none of the marks' business.
    if (!this.target && this.hovered === null) return;
    const tokens = shownTokens(state);
    const moved = tokens !== shownTokens(previous);
    const grid = state.grid !== previous.grid;
    if (this.target && (grid || (moved && 'token' in this.target && tokens[this.target.token.id] !== this.target.token))) this.showRings();
    if (this.hovered !== null && (grid || moved || state.selectedIds !== previous.selectedIds)) this.showCheck(grid);
  }

  /** The token under the pointer is `id` now: the check runs to it, and its speed is asked for ahead of a press. */
  private hover(id: string | null): void {
    if (id === this.hovered) return;
    this.hovered = id;
    const token = id === null ? undefined : shownTokens(this.deps.store.getState())[id];
    if (token) this.deps.sources()?.movement.prepare([token]);
    this.showCheck();
  }

  /**
   * Draws the check between the selected token and the hovered one, or takes it off where there is
   * no such pair. Asked for by every store write that may have moved a token, it draws the pair it
   * already shows only when told to (`again`: the grid or the rules are others).
   */
  private showCheck(again = false): void {
    const state = this.deps.store.getState();
    const pair = this.hovered === null ? null : rangeCheckPair(state.selectedIds, this.hovered, shownTokens(state));
    if (!pair) {
      this.check.clear();
      return;
    }
    const shown = this.check.shown;
    if (!again && shown?.from === pair.from && shown.to === pair.to) return;
    const look = this.deps.look();
    this.check.show(pair, this.grid(look), look);
  }

  /** A press of the Ranges mode at `world`: the token there, else the point; the token the rings already stand around loses them. */
  private pick(world: Point): void {
    const id = this.deps.sources()?.tokenAt(world.x, world.y) ?? null;
    const token = id === null ? undefined : shownTokens(this.deps.store.getState())[id];
    if (token && this.target && 'token' in this.target && this.target.token.id === token.id) {
      this.clearRings();
      return;
    }
    this.target = token ? { token } : { point: { x: world.x, y: world.y } };
    this.showRings();
  }

  /** Works the rings out again around their target as it is now; a target that is gone, or has no rings by the map's rules, has none. */
  private showRings(): void {
    const target = this.target;
    if (!target) return;
    const look = this.deps.look();
    const movement = this.deps.sources()?.movement;
    const rules = movement?.rules() ?? NO_MOVEMENT_RULES;
    if ('point' in target) {
      this.ring(target.point, rangeRings(look.settings, rules, null), look);
      return;
    }
    const token = shownTokens(this.deps.store.getState())[target.token.id];
    if (!token) {
      this.clearRings();
      return;
    }
    this.target = { token };
    this.ring({ x: token.x, y: token.y, size: token.size || 1 }, rangeRings(look.settings, rules, movement?.speedOf(token) ?? null), look);
  }

  /** Shows `rings` around `origin`; without any, nothing stays, and the next press starts anew. */
  private ring(origin: RangeOrigin, rings: readonly RangeRing[], look: MeasureLook): void {
    if (rings.length === 0) this.clearRings();
    else this.rings.show(origin, rings, this.grid(look), look);
  }

  private clearRings(): void {
    this.target = null;
    this.rings.clear();
  }

  /** The grid tokens stand on, with its Snap setting. */
  private grid(look: MeasureLook): TokenGrid {
    return { ...look.grid, snapToGrid: this.deps.store.getState().grid?.snapToGrid };
  }
}
