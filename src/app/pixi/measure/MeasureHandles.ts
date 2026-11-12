import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { KeptMeasure, MeasureShapeKind } from '../../measure/measureTypes';
import type { Point } from '../../types/visionTypes';
import { MOTION_NORMAL_MS, prefersReducedMotion } from '../../utils/motion';
import { MAP_LAYER_Z } from '../mapLayerOrder';
import { canvasBadgeTheme, type CanvasBadgeTheme } from '../utils/canvasBadgeColors';
import { destroyTree } from '../utils/destroyTree';
import { mapMarkerScale } from '../utils/mapMarkerScale';
import { createLineGlyphTexture } from '../utils/pinIconTexture';
import { ValueTransition } from '../utils/ValueTransition';
import {
  MEASURE_HANDLE_GLYPH_SIZE,
  MEASURE_HANDLE_RADIUS,
  measureHandleAt,
  measureHandleLook,
  measureHandlePoint,
  sameHandleLook,
  type MeasureHandleLook,
  type MeasureHandleRef,
} from './measureHandle';

/** The paths of the Lucide icons the measure tool's bar shows for each shape (a line: `slash`). */
const SHAPE_GLYPHS: Record<MeasureShapeKind, readonly string[]> = {
  ruler: [
    'M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z',
    'm14.5 12.5 2-2', 'm11.5 9.5 2-2', 'm8.5 6.5 2-2', 'm17.5 15.5 2-2',
  ],
  circle: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z'],
  cone: ['M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z'],
  square: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z'],
  line: ['M22 2 2 22'],
};

interface Handle {
  readonly view: Container;
  readonly badge: Graphics;
  glyph: Sprite | null;
  measure: KeptMeasure;
  look: MeasureHandleLook;
  /** The theme its badge was drawn in. */
  theme: CanvasBadgeTheme;
  /** Eases the hover and drag lift; made on the first lift. */
  lift: ValueTransition | null;
}

function sameTheme(a: CanvasBadgeTheme, b: CanvasBadgeTheme): boolean {
  return a.background === b.background && a.stroke === b.stroke && a.accent === b.accent;
}

/**
 * A handle on every kept measurement of the level shown, at its origin: a badge in the light
 * markers' language and a size smaller, with the shape's glyph and a thin ring in the
 * measurement's colour. It is all of a kept measurement that takes the pointer. Handles keep
 * their size on screen, move in place when their measurement changes, and are drawn again only
 * when their look is another. They are the GM's controls: `MeasurePartsVisibility` shows the layer
 * on the GM's canvas alone.
 */
export class MeasureHandles {
  readonly view = new Container({ label: 'measure-handles', zIndex: MAP_LAYER_Z.measure, eventMode: 'none', interactiveChildren: false });
  private readonly handles = new Map<string, Handle>();
  private readonly glyphs = new Map<MeasureShapeKind, Texture | null>();
  private list: readonly KeptMeasure[] = [];
  private theme: CanvasBadgeTheme;
  private hovered: string | null = null;
  private dragging: string | null = null;
  private selected: string | null = null;

  /** Added to `parent` after the measurements' labels, so the handles stand above them. */
  constructor(parent: Container, private readonly zoom: () => number, private readonly readTheme: () => CanvasBadgeTheme = canvasBadgeTheme) {
    this.theme = readTheme();
    parent.addChild(this.view);
  }

  /** The kept measurements to give a handle, in order: a later one's handle lies over an earlier one's. */
  setKept(list: readonly KeptMeasure[]): void {
    if (list === this.list) return;
    this.list = list;
    this.sync();
  }

  setHovered(id: string | null): void {
    if (this.hovered === id) return;
    this.hovered = id;
    this.sync();
  }

  setDragging(id: string | null): void {
    if (this.dragging === id) return;
    this.dragging = id;
    this.sync();
  }

  /** The measurement whose popover is open. */
  setSelected(id: string | null): void {
    if (this.selected === id) return;
    this.selected = id;
    this.sync();
  }

  /** The zoom or the theme changed: every handle takes its size on screen, and the theme's colours. */
  redraw(): void {
    const theme = this.readTheme();
    if (sameTheme(theme, this.theme)) {
      for (const handle of this.handles.values()) this.applyScale(handle);
      return;
    }
    this.theme = theme;
    this.sync();
  }

  /** The handle at the world point, while the handles show. */
  hitTest(point: Point): MeasureHandleRef | null {
    return this.view.visible ? measureHandleAt(this.list, point, this.zoom()) : null;
  }

  destroy(): void {
    for (const handle of this.handles.values()) handle.lift?.cancel();
    this.handles.clear();
    destroyTree(this.view);
    for (const texture of this.glyphs.values()) {
      if (texture && !texture.destroyed) texture.destroy(true);
    }
    this.glyphs.clear();
  }

  private sync(): void {
    const ids = new Set(this.list.map((measure) => measure.id));
    for (const [id, handle] of this.handles) {
      if (ids.has(id)) continue;
      handle.lift?.cancel();
      destroyTree(handle.view);
      this.handles.delete(id);
    }
    this.list.forEach((measure, index) => {
      const look = measureHandleLook(measure, { hovered: this.hovered === measure.id, selected: this.selected === measure.id, dragging: this.dragging === measure.id }, this.theme);
      const known = this.handles.get(measure.id);
      const handle = known ?? this.create(measure, look);
      // The badge takes the theme's colours whatever its look: one drawn in another theme is drawn again.
      if (!known || known.theme !== this.theme || !sameHandleLook(known.look, look)) this.draw(handle, look);
      this.lift(handle, look.lift);
      if (known?.measure !== measure) {
        const at = measureHandlePoint(measure);
        handle.view.position.set(at.x, at.y);
      }
      // One that undo brought back takes its old place among the others.
      if (this.view.children[index] !== handle.view) this.view.setChildIndex(handle.view, index);
      handle.measure = measure;
      handle.look = look;
      handle.theme = this.theme;
    });
  }

  private create(measure: KeptMeasure, look: MeasureHandleLook): Handle {
    const view = this.view.addChild(new Container());
    const handle: Handle = { view, badge: view.addChild(new Graphics()), glyph: null, measure, look, theme: this.theme, lift: null };
    this.handles.set(measure.id, handle);
    this.applyScale(handle);
    return handle;
  }

  private draw(handle: Handle, look: MeasureHandleLook): void {
    const g = handle.badge;
    g.clear();
    // A dark hairline keeps the badge's edge on a map as light as the badge.
    g.circle(0, 0, MEASURE_HANDLE_RADIUS + 0.5).stroke({ width: 1, color: 0x000000, alpha: 0.35 });
    g.circle(0, 0, MEASURE_HANDLE_RADIUS).fill({ color: this.theme.background, alpha: 0.95 });
    g.circle(0, 0, MEASURE_HANDLE_RADIUS - 1.25).stroke({ width: 1.5, color: look.ringColor, alpha: 0.9 });
    if (look.accent !== null) g.circle(0, 0, MEASURE_HANDLE_RADIUS + 3).stroke({ width: 2, color: look.accent });
    const texture = this.glyphTexture(look.shape);
    if (!texture) return;
    // The shape's glyph, rasterised once in white and tinted in the badge's ink.
    handle.glyph ??= handle.view.addChild(new Sprite({ anchor: 0.5 }));
    handle.glyph.texture = texture;
    handle.glyph.setSize(MEASURE_HANDLE_GLYPH_SIZE);
    handle.glyph.tint = look.glyphTint;
  }

  private glyphTexture(shape: MeasureShapeKind): Texture | null {
    if (!this.glyphs.has(shape)) this.glyphs.set(shape, createLineGlyphTexture(SHAPE_GLYPHS[shape]));
    return this.glyphs.get(shape) ?? null;
  }

  private applyScale(handle: Handle): void {
    handle.view.scale.set(mapMarkerScale(this.zoom()) * (handle.lift?.value ?? 1));
  }

  /** Eases the handle to its lift; reduced motion takes it there at once. */
  private lift(handle: Handle, lift: number): void {
    if ((handle.lift?.targetValue ?? 1) === lift) return;
    handle.lift ??= new ValueTransition(1, MOTION_NORMAL_MS, () => {
      if (!handle.view.destroyed) this.applyScale(handle);
    });
    if (prefersReducedMotion(document.body)) handle.lift.jumpTo(lift);
    else handle.lift.animateTo(lift);
  }
}
