import type { Bounds, Vec } from '../geometry';
import type { LeafShape } from './leafShapes';

/**
 * A plant as both directions draw it: stems, leaves, blades, blossoms and caps in cells, each with
 * a tone (−1 darker .. 1 lighter, its own variation) and a layer (0 under everything of its plant ..
 * 1 on top, so lower leaves lie in the shade of upper ones). Stone & shadow paints them, Engraved
 * cuts them; neither decides where a leaf is.
 */

/** What a plant is, for its colours: green leaves, flowering, dead and dry, or a fungus. */
export type PlantPalette = 'green' | 'fern' | 'grass' | 'flowering' | 'dead' | 'fungus' | 'root' | 'bramble';

export interface Stem {
  points: Vec[];
  /** Width at its first and last point, in cells. */
  from: number;
  to: number;
  layer: number;
  tone: number;
  /** Width at every point, where it swells and thins along the way (overrides `from` and `to`). */
  widths?: number[];
  /** A bramble's cane: thorns along it. */
  thorns?: true;
}

/** Where a root dives under the floor or breaks out of it: a dark gap in the floor. */
export interface Hole {
  x: number;
  y: number;
  radius: number;
  angle: number;
}

export interface Leaf {
  /** Where its stalk meets the stem. */
  x: number;
  y: number;
  /** The way its rib points, radians on screen. */
  angle: number;
  /** Rib length, in cells. */
  length: number;
  /** Across, as a share of the shape's own width (1 the shape as drawn). */
  breadth: number;
  shape: LeafShape;
  lobes: number;
  serration: number;
  curl: number;
  layer: number;
  tone: number;
}

export interface Blossom {
  x: number;
  y: number;
  radius: number;
  petals: number;
  angle: number;
  tone: number;
  layer: number;
}

/** A fungus's cap, seen from above. */
export interface Cap {
  x: number;
  y: number;
  radius: number;
  /** How much longer than broad, along `angle`. */
  stretch: number;
  angle: number;
  tone: number;
  layer: number;
}

export interface PlantForm {
  palette: PlantPalette;
  stems: Stem[];
  leaves: Leaf[];
  blossoms: Blossom[];
  caps: Cap[];
  holes: Hole[];
  /** Its height above the floor for its shadow, in cells. */
  lift: number;
  bounds: Bounds;
}

export function emptyForm(palette: PlantPalette, lift: number): PlantForm {
  return { palette, stems: [], leaves: [], blossoms: [], caps: [], holes: [], lift, bounds: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity } };
}

/** Grows the form's bounds round a point and a reach. */
export function cover(form: PlantForm, p: Vec, reach: number): void {
  const b = form.bounds;
  b.minX = Math.min(b.minX, p.x - reach);
  b.minY = Math.min(b.minY, p.y - reach);
  b.maxX = Math.max(b.maxX, p.x + reach);
  b.maxY = Math.max(b.maxY, p.y + reach);
}

export function addLeaf(form: PlantForm, leaf: Leaf): void {
  form.leaves.push(leaf);
  cover(form, leaf, leaf.length * 1.1);
}

export function addStem(form: PlantForm, stem: Stem): void {
  form.stems.push(stem);
  for (const p of stem.points) cover(form, p, stem.from);
}

/** Whether the form lies (partly) in `view`. */
export function inView(form: PlantForm, view: Bounds): boolean {
  const b = form.bounds;
  return b.maxX >= view.minX && b.minX <= view.maxX && b.maxY >= view.minY && b.minY <= view.maxY;
}
