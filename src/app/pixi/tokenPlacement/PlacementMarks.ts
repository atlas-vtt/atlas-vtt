import { Container, Graphics } from 'pixi.js';
import { easeOut } from '../../utils/motion';
import { destroyTree } from '../utils/destroyTree';
import { Spring, type SpringFeel } from './placementSpring';
import type { Point } from './placementLayout';

/** A cell lights up quickly under a token and dims a little slower once the token moves on. */
const CELL_IN: SpringFeel = { frequency: 30, damping: 1 };
const CELL_OUT: SpringFeel = { frequency: 18, damping: 1 };
/** How strongly a cell under a held token is filled and outlined. */
const CELL_FILL = 0.14;
const CELL_EDGE = 0.55;
/** A cell a token was just put on flashes brighter, then fades away. */
const FLASH_FILL = 0.32;
/** Line widths in screen pixels. */
const CELL_LINE_PX = 1.5;
const RIPPLE_LINE_PX = 3;
const RIPPLE_S = 0.55;
/** How far a ripple spreads past the token's edge, as a share of its radius. */
const RIPPLE_SPREAD = 0.55;

interface LitCell {
  outline: Point[];
  level: Spring;
  /** What is left of the flash of a token put down on the cell: 1 when put down, 0 once faded. */
  flash: number;
}

interface Ripple {
  centre: Point;
  radius: number;
  /** Seconds since it began; negative while it waits for its turn. */
  age: number;
}

/**
 * What the map shows under the tokens in the GM's hand: the cells they would cover, lit in the
 * theme's accent, and when they are put down a flash of those cells and a ripple around each token.
 * Drawn in world space with lines of a constant width on screen.
 */
export class PlacementMarks {
  readonly container = new Container();
  private readonly cellGraphics = new Graphics();
  private readonly rippleGraphics = new Graphics();
  private readonly cells = new Map<string, LitCell>();
  private readonly ripples: Ripple[] = [];
  private dirty = false;

  constructor(private readonly colour: () => number, private readonly zoom: () => number, private readonly reducedMotion: boolean) {
    this.container.eventMode = 'none';
    this.container.addChild(this.cellGraphics, this.rippleGraphics);
  }

  /** Lights `cells` (outlines keyed by their centre) and dims every other. */
  light(cells: ReadonlyMap<string, Point[]>): void {
    for (const [key, outline] of cells) {
      const cell = this.cells.get(key) ?? { outline, level: new Spring(0, CELL_IN), flash: 0 };
      cell.level.feel = CELL_IN;
      cell.level.target = 1;
      this.cells.set(key, cell);
    }
    for (const [key, cell] of this.cells) {
      if (cells.has(key)) continue;
      cell.level.feel = CELL_OUT;
      cell.level.target = 0;
    }
    this.dirty = true;
  }

  /** The cells under tokens just put down flash; `centres` start a ripple each, in turn after `delays` seconds. */
  land(cells: ReadonlyMap<string, Point[]>, tokens: ReadonlyArray<{ centre: Point; radius: number; delay: number }>): void {
    for (const [key, outline] of cells) {
      const cell = this.cells.get(key) ?? { outline, level: new Spring(0, CELL_OUT), flash: 0 };
      cell.flash = 1;
      cell.level.feel = CELL_OUT;
      cell.level.target = 0;
      this.cells.set(key, cell);
    }
    if (!this.reducedMotion) {
      for (const { centre, radius, delay } of tokens) this.ripples.push({ centre, radius, age: -delay });
    }
    this.dirty = true;
  }

  /** Dims every cell. */
  clear(): void {
    this.light(new Map());
  }

  /** Moves the marks `seconds` on and draws them; whether they still change. */
  step(seconds: number): boolean {
    let moving = false;
    for (const [key, cell] of this.cells) {
      if (this.reducedMotion) cell.level.jump(cell.level.target);
      cell.level.step(seconds, 0.01);
      cell.flash = Math.max(0, cell.flash - seconds / (this.reducedMotion ? 0.2 : 0.6));
      if (cell.level.value <= 0.001 && cell.level.target === 0 && cell.flash === 0) this.cells.delete(key);
      else if (!cell.level.atRest || cell.flash > 0) moving = true;
    }
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const ripple = this.ripples[i]!;
      ripple.age += seconds;
      if (ripple.age >= RIPPLE_S) this.ripples.splice(i, 1);
    }
    moving ||= this.ripples.length > 0;
    if (moving || this.dirty) this.draw();
    this.dirty = false;
    return moving;
  }

  get idle(): boolean {
    return this.cells.size === 0 && this.ripples.length === 0;
  }

  destroy(): void {
    destroyTree(this.container);
  }

  private draw(): void {
    const colour = this.colour();
    const perPixel = 1 / Math.max(0.0001, this.zoom());
    const cells = this.cellGraphics.clear();
    for (const { outline, level, flash } of this.cells.values()) {
      const shown = Math.max(0, Math.min(1, level.value));
      const fill = CELL_FILL * shown + FLASH_FILL * easeOut(flash);
      const edge = CELL_EDGE * Math.max(shown, flash);
      if (fill <= 0.002 && edge <= 0.002) continue;
      cells.poly(outline.flatMap(({ x, y }) => [x, y]), true);
      cells.fill({ color: colour, alpha: fill });
      cells.stroke({ color: colour, alpha: edge, width: CELL_LINE_PX * perPixel, alignment: 1 });
    }
    const ripples = this.rippleGraphics.clear();
    for (const { centre, radius, age } of this.ripples) {
      if (age < 0) continue;
      const progress = easeOut(age / RIPPLE_S);
      ripples.circle(centre.x, centre.y, radius * (1 + RIPPLE_SPREAD * progress));
      ripples.stroke({ color: colour, alpha: 0.8 * (1 - progress), width: RIPPLE_LINE_PX * (1 - 0.6 * progress) * perPixel });
    }
  }
}
