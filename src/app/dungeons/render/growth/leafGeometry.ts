import { SHADOW_DIR } from '../art/light';
import type { PathFn } from '../art/paths';
import type { Vec } from '../geometry';
import type { Leaf, PlantForm, Stem } from './forms';
import { leafHalves, ribOf, veinAngles, type LeafHalves, type LeafShape } from './leafShapes';

/** A leaf placed on the map: its halves (each closed through the rib), rib and veins, in cells. */
export interface PlacedLeaf {
  left: Vec[];
  right: Vec[];
  rib: Vec[];
  veins: Vec[][];
  /** −1..1: how much its left half faces the light (its right faces it the other way). */
  facing: number;
}

const shapes = new Map<string, LeafHalves>();

/** The shape's halves, from a cache of slightly rounded variations. */
function halvesOf(shape: LeafShape, lobes: number, serration: number, curl: number): LeafHalves {
  const key = `${shape}:${Math.round(lobes * 6)}:${Math.round(serration * 4)}:${Math.round(curl * 4)}`;
  let found = shapes.get(key);
  if (!found) {
    found = leafHalves(shape, Math.round(lobes * 6) / 6, Math.round(serration * 4) / 4, Math.round(curl * 4) / 4);
    shapes.set(key, found);
  }
  return found;
}

export function placeLeaf(leaf: Leaf): PlacedLeaf {
  const cos = Math.cos(leaf.angle);
  const sin = Math.sin(leaf.angle);
  const l = leaf.length;
  const b = leaf.length * leaf.breadth;
  const place = (p: Vec): Vec => ({ x: leaf.x + p.x * l * cos - p.y * b * sin, y: leaf.y + p.x * l * sin + p.y * b * cos });
  const halves = halvesOf(leaf.shape, leaf.lobes, leaf.serration, leaf.curl);
  const origin = { x: leaf.x, y: leaf.y };
  const rib = ribOf(leaf.shape, Math.round(leaf.curl * 4) / 4).map(place);
  const veins = veinAngles(leaf.shape).map(a => [origin, place({ x: Math.cos(a) * 0.62, y: Math.sin(a) * 0.62 })]);
  // The left half's outward side, (0, −1) in the leaf's frame, on the map; light falls against the shadow's way.
  const nx = sin;
  const ny = -cos;
  return {
    left: [origin, ...halves.left.map(place)],
    right: [origin, ...halves.right.map(place)],
    rib,
    veins,
    facing: -(nx * SHADOW_DIR.x + ny * SHADOW_DIR.y),
  };
}

/** A stem as a ribbon tapering from its first point's width to its last's. */
export function stemRibbon(stem: Stem): Vec[] {
  const { points } = stem;
  const n = points.length;
  const left: Vec[] = [];
  const right: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)]!;
    const b = points[Math.min(n - 1, i + 1)]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const w = (stem.widths?.[i] ?? stem.from + (stem.to - stem.from) * (i / Math.max(1, n - 1))) / 2;
    const nx = (-(b.y - a.y) / len) * w;
    const ny = ((b.x - a.x) / len) * w;
    left.push({ x: points[i]!.x + nx, y: points[i]!.y + ny });
    right.push({ x: points[i]!.x - nx, y: points[i]!.y - ny });
  }
  return [...left, ...right.reverse()];
}

/** Everything of a form as one silhouette, for the shadow it casts: leaves as ovals, stems as ribbons, caps as discs. */
export function silhouette(form: PlantForm): PathFn {
  return path => {
    for (const leaf of form.leaves) {
      const r = leaf.length * 0.5;
      const cx = leaf.x + Math.cos(leaf.angle) * r;
      const cy = leaf.y + Math.sin(leaf.angle) * r;
      path.moveTo(cx + Math.cos(leaf.angle) * r, cy + Math.sin(leaf.angle) * r);
      path.ellipse(cx, cy, r, r * 0.7 * leaf.breadth, leaf.angle, 0, Math.PI * 2);
    }
    for (const stem of form.stems) {
      if (stem.from < 0.01) continue;
      const ring = stemRibbon(stem);
      path.moveTo(ring[0]!.x, ring[0]!.y);
      for (const p of ring) path.lineTo(p.x, p.y);
      path.closePath();
    }
    for (const cap of form.caps) {
      path.moveTo(cap.x + cap.radius, cap.y);
      path.arc(cap.x, cap.y, cap.radius, 0, Math.PI * 2);
    }
  };
}

/**
 * For a picture that records every path (the SVG export): every third leaf, each as one outline
 * through every sixth point of its halves, so an overgrown map stays a file of a few megabytes.
 */
export function plainLeaves(leaves: readonly Leaf[]): { leaf: Leaf; outline: Vec[] }[] {
  return leaves.filter((_, i) => i % 3 === 0).map(leaf => {
    const { left, right } = placeLeaf(leaf);
    const every = (points: readonly Vec[]): Vec[] => points.filter((_, i) => i % 6 === 0 || i === points.length - 1);
    return { leaf, outline: [...every(left), ...every(right).reverse()] };
  });
}
