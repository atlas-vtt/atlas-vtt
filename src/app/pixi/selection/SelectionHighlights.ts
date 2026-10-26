import { Container, Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { MOTION_NORMAL_MS } from '../../utils/motion';
import { destroyTree } from '../utils/destroyTree';
import { ValueTransition } from '../utils/ValueTransition';
import { MAP_LAYER_Z } from '../mapLayerOrder';
import {
  SELECTION_LOOK, groupFrame, highlightBox, highlightPath, roundedBoxContains, unionBox,
  type Box, type HighlightPath, type Notch, type RoundedBox, type SelectionOutline,
} from './selectionGeometry';
import { drawGroupFrame, drawHighlight } from './selectionInk';
import type { FrameTurn } from './GroupRotation';

/** One selected thing as the highlights see it, in world units. */
export interface SelectionTarget {
  readonly id: string;
  /** The thing's middle. */
  readonly x: number;
  readonly y: number;
  readonly outline: SelectionOutline;
  /** What else of the thing the group frame holds (a token's bars). */
  readonly extent?: Box | undefined;
  /** Handles standing on the highlight, relative to the thing's middle: the highlight passes behind them. */
  readonly handles?: readonly Notch[] | undefined;
  /**
   * Whether a group drag moves the thing, so the group frame holds it (tokens, drawings). A fog area
   * keeps its outline but neither widens the frame nor counts towards one: the frame is what a press
   * takes hold of.
   */
  readonly grouped: boolean;
}

export interface SelectionHighlightDeps {
  /** The world the highlights stand in; its scale is the zoom. */
  readonly viewport: Viewport;
  /**
   * Shows the selection again from what the canvas holds now: what is selected may measure differently
   * at another zoom (a selected token's bars keep their size on screen).
   */
  refresh(): void;
  reducedMotion(): boolean;
  /** The theme's accent. */
  accent(): number;
}

/** Runs `transition` from 0 to 1, or sets it to 1 at once. */
function fadeIn(transition: ValueTransition, animate: boolean): void {
  transition.jumpTo(animate ? 0 : 1);
  if (animate) transition.animateTo(1);
}

/**
 * Drawn in screen pixels inside a container scaled back to the world, so the line keeps its width at
 * every zoom and PIXI builds its curves from as many pieces as the circle has on screen.
 */
class Highlight {
  readonly view = new Container({ label: 'selectionHighlight', eventMode: 'none' });
  private readonly ink = new Graphics();
  private drawn = '';
  private zoom = 1;
  private appearance = 1;
  private readonly appear = new ValueTransition(1, MOTION_NORMAL_MS, (value) => {
    this.appearance = value;
    this.view.alpha = value;
    this.applyScale();
  });

  constructor() {
    this.view.addChild(this.ink);
  }

  place(x: number, y: number, zoom: number): void {
    this.view.position.set(x, y);
    if (zoom === this.zoom) return;
    this.zoom = zoom;
    this.applyScale();
  }

  draw(path: HighlightPath, handles: readonly Notch[], accent: number): void {
    const key = `${JSON.stringify(path)}|${JSON.stringify(handles)}|${accent}`;
    if (key === this.drawn) return;
    this.drawn = key;
    this.ink.clear();
    drawHighlight(this.ink, path, handles, accent);
  }

  /** Lands on its thing from a little larger as it fades in, or shows at once. */
  enter(animate: boolean): void {
    fadeIn(this.appear, animate);
  }

  destroy(): void {
    this.appear.cancel();
    destroyTree(this.view);
  }

  private applyScale(): void {
    const grow = 1 + (SELECTION_LOOK.appearFrom - 1) * (1 - this.appearance);
    this.view.scale.set(grow / this.zoom);
  }
}

/**
 * The GM's selection on the map: a highlight following the shape of each selected thing (a token's
 * ring, its art where it has none, the box of a drawing or fog area), and a quiet frame around what a
 * group drag moves once two or more such are selected. Everything is redrawn only when the selection, a selected
 * thing, the zoom or the theme changes; a newly selected thing lands with a short motion.
 */
export class SelectionHighlights {
  readonly layer = new Container({ label: 'selectionHighlights', eventMode: 'none', interactiveChildren: false, zIndex: MAP_LAYER_Z.selection });
  private readonly highlights = new Map<string, Highlight>();
  private readonly group = new Graphics({ label: 'selectionGroupFrame' });
  private readonly groupFade = new ValueTransition(1, MOTION_NORMAL_MS, (value) => { this.group.alpha = value; });
  private groupDrawn = '';
  /** The group frame as drawn, in screen pixels at `frameZoom`; null while there is none. */
  private frame: RoundedBox | null = null;
  private frameZoom = 1;
  private targets: readonly SelectionTarget[] = [];
  /** While a group is turned as one, its frame turns with it and holds still otherwise. */
  private turn: FrameTurn | null = null;
  private zoom = 1;
  private accent = 0;
  private readonly themeObserver: MutationObserver | null;

  constructor(private readonly deps: SelectionHighlightDeps) {
    this.layer.addChild(this.group);
    deps.viewport.on('zoomed', this.onViewChange);
    deps.viewport.on('zoomed-end', this.onViewChange);
    deps.viewport.on('moved', this.onViewChange);
    this.themeObserver = typeof MutationObserver === 'function' ? new MutationObserver(() => this.refreshTheme()) : null;
    this.themeObserver?.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  /** Shows `targets` selected: new ones land, gone ones leave at once, the others follow their things. */
  show(targets: readonly SelectionTarget[]): void {
    const changed = targets.length !== this.highlights.size || targets.some((target) => !this.highlights.has(target.id));
    this.targets = targets;
    if (changed) this.accent = this.deps.accent();
    this.zoom = this.deps.viewport.scale.x || 1;
    // Asked only when something appears: a drag calls this on every move
    const animate = (): boolean => !this.deps.reducedMotion();
    const wanted = new Set(targets.map((target) => target.id));
    for (const [id, highlight] of this.highlights) {
      if (wanted.has(id)) continue;
      highlight.destroy();
      this.highlights.delete(id);
    }
    const boxes: Box[] = [];
    for (const target of targets) {
      let highlight = this.highlights.get(target.id);
      const isNew = highlight === undefined;
      if (!highlight) {
        highlight = new Highlight();
        this.highlights.set(target.id, highlight);
        this.layer.addChild(highlight.view);
      }
      const path = highlightPath(target.outline, this.zoom);
      highlight.place(target.x, target.y, this.zoom);
      const handles = (target.handles ?? []).map((handle) => ({ x: handle.x * this.zoom, y: handle.y * this.zoom, radius: handle.radius * this.zoom }));
      highlight.draw(path, handles, this.accent);
      if (isNew) highlight.enter(animate());
      if (target.grouped) boxes.push(this.screenBox(target, path));
    }
    this.showGroup(groupFrame(boxes), animate);
  }

  /** Whether the world point lies inside the group frame as it is drawn; false while none is. */
  groupFrameContains(worldX: number, worldY: number): boolean {
    if (!this.frame) return false;
    return roundedBoxContains(this.frame, { x: worldX * this.frameZoom, y: worldY * this.frameZoom }, SELECTION_LOOK.groupStroke);
  }

  /** The group frame as drawn, in world units; null while there is none. */
  groupFrameBox(): Box | null {
    const frame = this.frame;
    if (!frame) return null;
    return { x: frame.x / this.frameZoom, y: frame.y / this.frameZoom, width: frame.width / this.frameZoom, height: frame.height / this.frameZoom };
  }

  /**
   * Turns the group frame `degrees` about `centre` (world units) as the group turns, keeping it as it
   * was drawn; null lets it follow what it holds again.
   */
  turnGroup(turn: FrameTurn | null): void {
    this.turn = turn;
    if (turn) {
      this.group.pivot.set(turn.centre.x * this.frameZoom, turn.centre.y * this.frameZoom);
      this.group.position.set(turn.centre.x, turn.centre.y);
      this.group.rotation = (turn.degrees * Math.PI) / 180;
      return;
    }
    this.group.pivot.set(0, 0);
    this.group.position.set(0, 0);
    this.group.rotation = 0;
  }

  /** Reads the theme's accent again and redraws what is shown in it. */
  refreshTheme(): void {
    if (this.targets.length === 0) return;
    this.accent = this.deps.accent();
    this.deps.refresh();
  }

  destroy(): void {
    this.deps.viewport.off('zoomed', this.onViewChange);
    this.deps.viewport.off('zoomed-end', this.onViewChange);
    this.deps.viewport.off('moved', this.onViewChange);
    this.themeObserver?.disconnect();
    this.groupFade.cancel();
    for (const highlight of this.highlights.values()) highlight.destroy();
    this.highlights.clear();
    destroyTree(this.layer);
  }

  /** The screen box a target's highlight and what else of it the group holds cover. */
  private screenBox(target: SelectionTarget, path: HighlightPath): Box {
    const box = highlightBox(path, { x: target.x * this.zoom, y: target.y * this.zoom });
    const extent = target.extent;
    if (!extent) return box;
    const scaled = { x: extent.x * this.zoom, y: extent.y * this.zoom, width: extent.width * this.zoom, height: extent.height * this.zoom };
    return unionBox([box, scaled]) ?? box;
  }

  /** The group frame lies in screen pixels about the world's origin, scaled back like the highlights. */
  private showGroup(frame: RoundedBox | null, animate: () => boolean): void {
    if (this.turn) return;
    this.frame = frame;
    this.frameZoom = this.zoom;
    const key = frame ? `${JSON.stringify(frame)}|${this.accent}` : '';
    if (key === this.groupDrawn) return;
    const appearing = this.groupDrawn === '' && frame !== null;
    this.groupDrawn = key;
    this.group.clear();
    if (!frame) return;
    this.group.scale.set(1 / this.zoom);
    drawGroupFrame(this.group, frame, this.accent);
    if (appearing) fadeIn(this.groupFade, animate());
  }

  private readonly onViewChange = (): void => {
    if (this.targets.length > 0 && this.deps.viewport.scale.x !== this.zoom) this.deps.refresh();
  };
}
