import { Container } from 'pixi.js';
import { outlinePointAt, rangeOutline, type RangeOrigin, type RangeOutline } from '../../measure/rangeOutline';
import type { RangeRing } from '../../measure/rangeRings';
import type { TokenGrid } from '../../measure/tokenDistance';
import type { Point } from '../../types/visionTypes';
import { INK_SHADE_REACH } from '../utils/canvasInk';
import { cssColorToHexNumber } from '../utils/colorUtils';
import { destroyTree } from '../utils/destroyTree';
import { MeasureInk, type InkTrace, type MeasureInkLayer } from '../utils/measureInk';
import { MeasureLabel } from '../utils/measureLabel';
import type { MeasureLook } from './DrawnMeasure';

/** A ring's label beside a measurement's distance: the same pill, smaller. */
const LABEL_SIZE = 0.8;
/** Where the first ring's label stands on its ring: up and to the right. */
const FIRST_LABEL = -Math.PI / 3;
/** Each further ring's label stands this much further round, so the labels of neighbouring rings stand apart. */
const LABEL_STEP = (24 * Math.PI) / 180;

/** How many steps further a label goes at most to keep clear of the labels before it. */
const MAX_LABEL_STEPS = 12;

/** A label with its shade in world units: its middle, and half its width and height. */
interface LabelBox {
  readonly x: number;
  readonly y: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
}

/** The box a label takes up at `zoom`: its pill and the soft shade around it, which is as wide on screen at every zoom. */
function boxOf({ view, pillSize }: MeasureLabel, zoom: number): LabelBox {
  const shade = INK_SHADE_REACH / zoom;
  return { x: view.x, y: view.y, halfWidth: (pillSize.width * view.scale.x) / 2 + shade, halfHeight: (pillSize.height * view.scale.y) / 2 + shade };
}

const covers = (a: LabelBox, b: LabelBox): boolean => Math.abs(a.x - b.x) < a.halfWidth + b.halfWidth && Math.abs(a.y - b.y) < a.halfHeight + b.halfHeight;

/** A ring as it is drawn: what it says, and where its line runs. */
interface DrawnRing {
  readonly ring: RangeRing;
  readonly outline: RangeOutline;
}

/** The outline in the ink's screen pixels (`screen` takes a world point there), ready to stroke. */
function traceOf(outline: RangeOutline, screen: (point: Point) => Point): InkTrace {
  if (outline.kind === 'circle') {
    const { x, y } = screen(outline.centre);
    const radius = screen({ x: outline.radius, y: 0 }).x;
    // Canvas 2D (the renderer without WebGL) throws on a negative arc radius.
    return (g) => { if (radius > 0) g.circle(x, y, radius); };
  }
  const loops = outline.loops.map((loop) => loop.map(screen));
  return (g) => {
    for (const loop of loops) {
      loop.forEach((point, index) => {
        if (index === 0) g.moveTo(point.x, point.y);
        else g.lineTo(point.x, point.y);
      });
      g.closePath();
    }
  };
}

/**
 * The rings of Ranges around one token or point: each ring's outline in the measure ink, in its
 * step's colour or the accent, and its name on a small measure label on its line. The outlines
 * are worked out when the rings are shown (`show`); a new zoom or theme only inks them again
 * (`redraw`), so lines and labels keep their size on screen.
 */
export class RangeRings {
  private readonly ink: MeasureInk;
  private readonly labelLayer = new Container({ label: 'range-ring-labels', eventMode: 'none', interactiveChildren: false });
  private readonly labels: MeasureLabel[] = [];
  private rings: DrawnRing[] = [];
  private gridSize = 0;

  /** Their lines go onto `shapes`, their labels into `labels`. */
  constructor(shapes: MeasureInkLayer, labels: Container) {
    this.ink = new MeasureInk(shapes);
    labels.addChild(this.labelLayer);
  }

  /** Whether rings are on the map. */
  get shown(): boolean {
    return this.rings.length > 0;
  }

  /** What the labels read, innermost ring first; for tests. */
  get texts(): string[] {
    return this.rings.map(({ ring }) => ring.label);
  }

  /** Shows `rings` around `origin`, in place of what was shown; a ring without an outline (no reach) is left out. */
  show(origin: RangeOrigin, rings: readonly RangeRing[], grid: TokenGrid, look: MeasureLook): void {
    const drawn = rings.flatMap((ring) => {
      const outline = rangeOutline(origin, ring.reach, grid, look.settings.diagonalRule);
      return outline ? [{ ring, outline }] : [];
    });
    if (drawn.length === 0) {
      this.clear();
      return;
    }
    this.rings = drawn;
    this.gridSize = grid.size;
    this.redraw(look);
  }

  /** Inks the rings again where they are: the zoom or the theme changed. */
  redraw(look: MeasureLook): void {
    if (this.rings.length === 0) return;
    const zoom = Number.isFinite(look.zoom) && look.zoom > 0 ? look.zoom : 1;
    this.ink.begin(zoom);
    const screen = (point: Point): Point => this.ink.screen(point);
    this.fitLabels(this.rings.length);
    const placed: LabelBox[] = [];
    this.rings.forEach(({ ring, outline }, index) => {
      this.ink.stroke(traceOf(outline, screen), ring.color === null ? look.accent : cssColorToHexNumber(ring.color));
      placed.push(this.placeLabel(this.labels[index]!, ring.label, outline, FIRST_LABEL + index * LABEL_STEP, placed, zoom));
    });
  }

  clear(): void {
    if (this.rings.length === 0) return;
    this.rings = [];
    this.ink.clear();
    this.fitLabels(0);
  }

  destroy(): void {
    this.ink.destroy();
    destroyTree(this.labelLayer);
  }

  /**
   * Puts a ring's label on its line at `angle`. Labels keep their size on screen while rings
   * shrink with the map, so where it would cover one placed before, it goes further round.
   */
  private placeLabel(label: MeasureLabel, text: string, outline: RangeOutline, angle: number, placed: readonly LabelBox[], zoom: number): LabelBox {
    for (let step = 0; ; step++) {
      label.show(text, { over: outlinePointAt(outline, angle + step * LABEL_STEP) }, zoom, this.gridSize);
      const box = boxOf(label, zoom);
      if (step >= MAX_LABEL_STEPS || !placed.some((other) => covers(box, other))) return box;
    }
  }

  /** As many labels as rings to name. */
  private fitLabels(count: number): void {
    while (this.labels.length > count) this.labels.pop()?.destroy();
    while (this.labels.length < count) {
      const label = new MeasureLabel(LABEL_SIZE);
      this.labelLayer.addChild(label.view);
      this.labels.push(label);
    }
  }
}
