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
  MEASURE_END_HANDLE_RADIUS,
  MEASURE_HANDLE_GLYPH_SIZE,
  MEASURE_HANDLE_RADIUS,
  handlesAtPoints,
  measureHandleAt,
  measureHandleLook,
  sameHandleLook,
  type MeasureHandleLook,
  type MeasureHandlePart,
  type MeasureHandlePlacer,
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

/** One thing to grab: its drawing, and what eases its hover and drag lift (made on the first lift). */
interface Grip {
  readonly view: Container;
  lift: ValueTransition | null;
}

interface Handle extends Grip {
  readonly badge: Graphics;
  glyph: Sprite | null;
  /** The dot at an area's far end; null for a ruler. */
  end: (Grip & { readonly view: Graphics }) | null;
  measure: KeptMeasure;
  look: MeasureHandleLook;
  /** The theme its badge was drawn in. */
  theme: CanvasBadgeTheme;
}

const partOf = (ref: MeasureHandleRef | null, id: string): MeasureHandlePart | null => (ref?.id === id ? ref.part : null);
const sameRef = (a: MeasureHandleRef | null, b: MeasureHandleRef | null): boolean => a?.id === b?.id && a?.part === b?.part;

function sameTheme(a: CanvasBadgeTheme, b: CanvasBadgeTheme): boolean {
  return a.background === b.background && a.stroke === b.stroke && a.accent === b.accent;
}

/**
 * A handle on every kept measurement of the level shown, at its origin: a badge in the light
 * markers' language and a size smaller, with the shape's glyph and a thin ring in the
 * measurement's colour. An area has a second one at its far end, a plain dot with the same ring,
 * which resizes and turns it. They are all of a kept measurement that takes the pointer. Handles
 * keep their size on screen, move in place when their measurement changes or, an aura's, when its
 * token moves (`place` says where they stand; `moved` asks again), and are drawn again only when
 * their look is another. They are the GM's controls: `MeasurePartsVisibility` shows the
 * layer on the GM's canvas alone.
 */
export class MeasureHandles {
  readonly view = new Container({ label: 'measure-handles', zIndex: MAP_LAYER_Z.measure, eventMode: 'none', interactiveChildren: false });
  /** The dots at the areas' far ends, beneath every badge. */
  private readonly ends = new Container({ label: 'measure-end-handles' });
  private readonly badges = new Container({ label: 'measure-origin-handles' });
  private readonly handles = new Map<string, Handle>();
  private readonly glyphs = new Map<MeasureShapeKind, Texture | null>();
  private list: readonly KeptMeasure[] = [];
  private theme: CanvasBadgeTheme;
  private hovered: MeasureHandleRef | null = null;
  private dragging: MeasureHandleRef | null = null;
  private selected: string | null = null;

  /** Added to `parent` after the measurements' labels, so the handles stand above them. */
  constructor(
    parent: Container,
    private readonly zoom: () => number,
    private readonly place: MeasureHandlePlacer = handlesAtPoints,
    private readonly readTheme: () => CanvasBadgeTheme = canvasBadgeTheme,
  ) {
    this.theme = readTheme();
    this.view.addChild(this.ends, this.badges);
    parent.addChild(this.view);
  }

  /** The kept measurements to give a handle, in order: a later one's handle lies over an earlier one's. */
  setKept(list: readonly KeptMeasure[]): void {
    if (list === this.list) return;
    this.list = list;
    this.sync();
  }

  /** The handles may stand elsewhere: the tokens that auras follow moved. */
  moved(): void {
    this.sync();
  }

  setHovered(handle: MeasureHandleRef | null): void {
    if (sameRef(this.hovered, handle)) return;
    this.hovered = handle;
    this.sync();
  }

  setDragging(handle: MeasureHandleRef | null): void {
    if (sameRef(this.dragging, handle)) return;
    this.dragging = handle;
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
      for (const handle of this.handles.values()) {
        this.applyScale(handle);
        if (handle.end) this.applyScale(handle.end);
      }
      return;
    }
    this.theme = theme;
    this.sync();
  }

  /** The handle at the world point, while the handles show. */
  hitTest(point: Point): MeasureHandleRef | null {
    return this.view.visible ? measureHandleAt(this.list, point, this.zoom(), this.place) : null;
  }

  destroy(): void {
    for (const handle of this.handles.values()) this.stopLifts(handle);
    this.handles.clear();
    destroyTree(this.view);
    for (const texture of this.glyphs.values()) {
      if (texture && !texture.destroyed) texture.destroy(true);
    }
    this.glyphs.clear();
  }

  private sync(): void {
    const places = new Map(this.list.flatMap((measure) => {
      const at = this.place(measure);
      return at ? [[measure.id, at] as const] : [];
    }));
    for (const [id, handle] of this.handles) {
      if (places.has(id)) continue;
      this.remove(handle);
      this.handles.delete(id);
    }
    let index = 0;
    for (const measure of this.list) {
      const at = places.get(measure.id);
      if (!at) continue;
      const state = { hovered: partOf(this.hovered, measure.id), selected: this.selected === measure.id, dragging: partOf(this.dragging, measure.id) };
      const look = measureHandleLook(measure, state, this.theme);
      const known = this.handles.get(measure.id);
      const handle = known ?? this.create(measure, look);
      // The badge takes the theme's colours whatever its look: one drawn in another theme is drawn again.
      const redrawn = !known || known.theme !== this.theme || !sameHandleLook(known.look, look);
      if (redrawn) this.draw(handle, look);
      this.lift(handle, look.lift);
      if (handle.view.position.x !== at.origin.x || handle.view.position.y !== at.origin.y) handle.view.position.set(at.origin.x, at.origin.y);
      this.syncEnd(handle, at.end, look, redrawn);
      // One that undo brought back takes its old place among the others.
      if (this.badges.children[index] !== handle.view) this.badges.setChildIndex(handle.view, index);
      index++;
      handle.measure = measure;
      handle.look = look;
      handle.theme = this.theme;
    }
  }

  private create(measure: KeptMeasure, look: MeasureHandleLook): Handle {
    const view = this.badges.addChild(new Container());
    const handle: Handle = { view, badge: view.addChild(new Graphics()), glyph: null, end: null, measure, look, theme: this.theme, lift: null };
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

  /** The dot at an area's far end: made with the area, moved with it, and gone when the measurement is a ruler. */
  private syncEnd(handle: Handle, at: Point | null, look: MeasureHandleLook, redrawn: boolean): void {
    if (!at) {
      if (handle.end) this.removeGrip(handle.end);
      handle.end = null;
      return;
    }
    const made = handle.end === null;
    handle.end ??= { view: this.ends.addChild(new Graphics()), lift: null };
    const end = handle.end;
    if (made || redrawn) {
      end.view.clear();
      end.view.circle(0, 0, MEASURE_END_HANDLE_RADIUS + 0.5).stroke({ width: 1, color: 0x000000, alpha: 0.35 });
      end.view.circle(0, 0, MEASURE_END_HANDLE_RADIUS).fill({ color: this.theme.background, alpha: 0.95 });
      end.view.circle(0, 0, MEASURE_END_HANDLE_RADIUS - 1.25).stroke({ width: 1.5, color: look.ringColor, alpha: 0.9 });
    }
    if (made) this.applyScale(end);
    end.view.position.set(at.x, at.y);
    this.lift(end, look.endLift);
  }

  private remove(handle: Handle): void {
    if (handle.end) this.removeGrip(handle.end);
    this.removeGrip(handle);
  }

  private removeGrip(grip: Grip): void {
    grip.lift?.cancel();
    destroyTree(grip.view);
  }

  private stopLifts(handle: Handle): void {
    handle.lift?.cancel();
    handle.end?.lift?.cancel();
  }

  private glyphTexture(shape: MeasureShapeKind): Texture | null {
    if (!this.glyphs.has(shape)) this.glyphs.set(shape, createLineGlyphTexture(SHAPE_GLYPHS[shape]));
    return this.glyphs.get(shape) ?? null;
  }

  private applyScale(grip: Grip): void {
    grip.view.scale.set(mapMarkerScale(this.zoom()) * (grip.lift?.value ?? 1));
  }

  /** Eases the grip to its lift; reduced motion takes it there at once. */
  private lift(grip: Grip, lift: number): void {
    if ((grip.lift?.targetValue ?? 1) === lift) return;
    grip.lift ??= new ValueTransition(1, MOTION_NORMAL_MS, () => {
      if (!grip.view.destroyed) this.applyScale(grip);
    });
    if (prefersReducedMotion(document.body)) grip.lift.jumpTo(lift);
    else grip.lift.animateTo(lift);
  }
}
