import type { DungeonTerrain, TerrainKind } from '../../model';
import { roundedRect } from '../glyphPen';
import type { PathFn } from '../art/paths';
import { cellBox } from './cellRings';

/**
 * Where standing terrain stands, in cells: the shapes its drawing fills and the scene's object
 * outlines lie inside (`scene/objectShadows.ts` reads these numbers), and how tall it stands
 * against a wall (1), for the shadows it casts.
 */

/** How far inside its cells a block-shaped piece is drawn. */
export const INSET = { pillar: 0.1, obelisk: 0.14, statue: 0.18 } as const satisfies Partial<Record<TerrainKind, number>>;

const insetOf = (kind: TerrainKind): number => (INSET as Partial<Record<TerrainKind, number>>)[kind] ?? 0.12;
/** A wall fragment: half its thickness, and how far its broken ends stop short of its cells. */
export const FRAGMENT = { half: 0.17, ends: 0.12 };
/** A low wall's thickness. */
export const LOW_WALL = 0.3;
/** The standing stones of a portal ring, and each one's radius. */
export const RING_STONES = 8;
export const RING_STONE = 0.2;

/** How tall each piece stands, a wall's height being 1. */
export const HEIGHT: Readonly<Partial<Record<TerrainKind, number>>> = {
  'low-wall': 0.4,
  'rubble-heap': 0.42,
  pillar: 1,
  statue: 0.85,
  'wall-fragment': 1,
  obelisk: 1,
  pool: 0.14,
  'portal-ring': 0.6,
};

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

export function boxOf(piece: DungeonTerrain, inset: number): Box {
  const b = cellBox(piece.cells);
  return { x: b.x + inset, y: b.y + inset, w: b.w - inset * 2, h: b.h - inset * 2, cx: b.x + b.w / 2, cy: b.y + b.h / 2 };
}

/** Whether a piece lies along x (wider than deep). */
export function lengthX(piece: DungeonTerrain): boolean {
  const b = cellBox(piece.cells);
  return b.w >= b.h;
}

/** A wall fragment's slab, along its longer side. */
export function fragmentBox(piece: DungeonTerrain): Box {
  const box = boxOf(piece, 0);
  const along = lengthX(piece);
  const w = along ? box.w - FRAGMENT.ends * 2 : FRAGMENT.half * 2;
  const h = along ? FRAGMENT.half * 2 : box.h - FRAGMENT.ends * 2;
  return { x: box.cx - w / 2, y: box.cy - h / 2, w, h, cx: box.cx, cy: box.cy };
}

/** A low wall's band, along its longer side. */
export function lowWallBox(piece: DungeonTerrain): Box {
  const box = boxOf(piece, 0.05);
  const along = lengthX(piece);
  const w = along ? box.w : LOW_WALL;
  const h = along ? LOW_WALL : box.h;
  return { x: box.cx - w / 2, y: box.cy - h / 2, w, h, cx: box.cx, cy: box.cy };
}

/** The portal ring's radius in its box. */
export function ringRadius(piece: DungeonTerrain): number {
  const box = boxOf(piece, 0.04);
  return Math.min(box.w, box.h) / 2 - 0.24;
}

const rectPath = (box: Box, r = 0.03): PathFn => path => roundedRect(path, box.cx, box.cy, box.w, box.h, r);

/** The shape a standing piece fills, for its shadow; none for what lies on the ground. */
export function footprint(piece: DungeonTerrain): PathFn | null {
  switch (piece.kind) {
    case 'rubble-heap':
      return path => {
        for (const c of piece.cells) {
          path.moveTo(c.x + 0.86, c.y + 0.5);
          path.arc(c.x + 0.5, c.y + 0.5, 0.36, 0, Math.PI * 2);
        }
      };
    case 'low-wall':
      return rectPath(lowWallBox(piece), 0.02);
    case 'wall-fragment':
      return rectPath(fragmentBox(piece), 0.02);
    case 'pool': {
      const box = boxOf(piece, 0.1);
      return path => {
        path.moveTo(box.cx + Math.min(box.w, box.h) / 2, box.cy);
        path.arc(box.cx, box.cy, Math.min(box.w, box.h) / 2, 0, Math.PI * 2);
      };
    }
    case 'portal-ring': {
      const box = boxOf(piece, 0.04);
      const r = ringRadius(piece);
      return path => {
        for (let k = 0; k < RING_STONES; k++) {
          const a = (k / RING_STONES) * Math.PI * 2;
          path.moveTo(box.cx + Math.cos(a) * r + RING_STONE, box.cy + Math.sin(a) * r);
          path.arc(box.cx + Math.cos(a) * r, box.cy + Math.sin(a) * r, RING_STONE, 0, Math.PI * 2);
        }
      };
    }
    case 'pillar':
    case 'obelisk':
    case 'statue':
      return rectPath(boxOf(piece, insetOf(piece.kind)));
    default:
      return null;
  }
}
