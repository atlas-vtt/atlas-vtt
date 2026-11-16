import { Container, Graphics } from 'pixi.js';
import { readDrawing } from '../../annotations/annotationList';
import type { CellMark, DotMark, PlacingMark, StampMark } from '../../annotations/placingPreview';
import { createStampSprite, placeStamp, type StampTextures } from '../drawingLayer';
import { destroyTree } from '../utils/destroyTree';
import { paintClearing, paintFilling } from './cellMarks';

export interface PlacingPreviewDeps {
  /** The symbols of stamps, as whoever draws the stamps of the map holds them: one texture a symbol. */
  readonly stamps: StampTextures;
  /** Screen pixels to a world pixel now. */
  zoom(): number;
  /** The picture changed in a way PIXI does not see: a stamp's symbol came in. */
  changed(): void;
}

/**
 * What a press of the Draw tool will place, drawn under the pointer (`placingMark` says what): the
 * stamp itself, see-through; a dot as wide as the line that will start there; the cell that will
 * be filled or cleared. It takes the place of the cursor, so its owner hides the cursor while one
 * shows. A pointer move only moves it: it is drawn again when its look is another. The GM's own:
 * its `view` belongs among the tool's marks, which no other picture shows.
 */
export class PlacingPreview {
  readonly view = new Container({ label: 'annotation-placing', eventMode: 'none', interactiveChildren: false });
  private readonly dot = new Graphics({ label: 'placing-dot' });
  private readonly cell = new Graphics({ label: 'placing-cell' });
  private readonly stamp = createStampSprite();
  /** What each mark was last drawn as. */
  private drawn = { dot: '', cell: '', stamp: '' };
  private kind: PlacingMark['kind'] | null = null;

  constructor(private readonly deps: PlacingPreviewDeps) {
    this.stamp.label = 'placing-stamp';
    this.view.addChild(this.cell, this.stamp, this.dot);
    for (const child of this.view.children) child.visible = false;
  }

  /** The kind of mark that shows; null while none does. */
  get shown(): PlacingMark['kind'] | null {
    return this.kind;
  }

  /** Shows `mark`, or nothing for null. Whether the picture is another than before. */
  show(mark: PlacingMark | null): boolean {
    const kind = mark?.kind ?? null;
    let changed = kind !== this.kind;
    this.kind = kind;
    this.dot.visible = kind === 'dot';
    this.cell.visible = kind === 'cell';
    this.stamp.visible = kind === 'stamp';
    if (mark?.kind === 'dot') changed = this.showDot(mark) || changed;
    else if (mark?.kind === 'cell') changed = this.showCell(mark) || changed;
    else if (mark) changed = this.showStamp(mark) || changed;
    return changed;
  }

  destroy(): void {
    destroyTree(this.view);
  }

  private showDot({ at, radius, color, alpha, ring }: DotMark): boolean {
    const look = `${radius}|${color}|${alpha}|${ring.color}|${ring.width}|${ring.alpha}`;
    const moved = this.dot.position.x !== at.x || this.dot.position.y !== at.y;
    if (moved) this.dot.position.set(at.x, at.y);
    if (look === this.drawn.dot) return moved;
    this.drawn.dot = look;
    this.dot.clear();
    this.dot.circle(0, 0, radius).fill({ color, alpha });
    // Outside the dot: the dot stays as wide as the line it stands for.
    this.dot.circle(0, 0, radius + ring.width / 2).stroke({ color: ring.color, width: ring.width, alpha: ring.alpha });
    return true;
  }

  private showCell({ key, parts, color, unfill }: CellMark): boolean {
    const zoom = this.deps.zoom();
    const look = `${key}|${color}|${unfill}|${zoom}`;
    if (look === this.drawn.cell) return false;
    this.drawn.cell = look;
    if (unfill) paintClearing(this.cell, parts, zoom);
    else paintFilling(this.cell, parts, color, zoom);
    return true;
  }

  private showStamp({ stamp, alpha }: StampMark): boolean {
    const at = stamp.points[0]!;
    const look = `${stamp.icon}|${stamp.color}|${stamp.width}|${alpha}`;
    if (look === this.drawn.stamp) {
      const moved = this.stamp.position.x !== at.x || this.stamp.position.y !== at.y;
      if (moved) this.stamp.position.set(at.x, at.y);
      return moved;
    }
    const drawing = readDrawing('placing', { id: 'placing', kind: 'drawing', timestamp: 0, ...stamp });
    this.drawn.stamp = drawing ? look : '';
    if (!drawing) {
      this.stamp.visible = false;
      return true;
    }
    placeStamp(this.stamp, drawing, this.deps.stamps, () => this.deps.changed());
    this.stamp.alpha = alpha;
    return true;
  }
}
