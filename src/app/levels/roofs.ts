/**
 * A level's roof (its `foreground`): the image drawn above its tokens, in pieces. A piece is one
 * roof or canopy, a group of the image's pixels that holds together, and fades as one while a
 * token stands under it. The pieces are worked out once per image from its overview, in the tile
 * worker (`roofPieces`), and the rules (`roofDrawnAt`) and the picture read the same bytes.
 */

import { worldToImage, type MapStretch } from '../grid/mapStretch';
import type { TokenEntity } from '../types';
import type { Point } from '../types/visionTypes';
import { PLAYER_SIGHT_POLICY } from '../vision/tokenSightPolicy';
import { OPEN_ALPHA_BYTE } from './artRaster';

/** A pixel of a roof at least this opaque (of 255) belongs to a piece. */
export const ROOF_ALPHA_BYTE = 128;
/** How far (overview pixels) a fainter pixel of the image, an anti-aliased edge, joins the nearest piece. */
export const ROOF_EDGE_JOIN = 2;
/** The ids a piece may have; the pieces past the last share it, and fade together. */
export const MAX_ROOF_PIECES = 0xffff;

/**
 * The pieces of a roof image, over its overview (`width` × `height`, the whole image fit within
 * 2,048 px): one id per pixel, row by row, 0 where the pixel belongs to no piece (transparent, or
 * a faint pixel away from every piece), which is never drawn. Ids run from 1 to `count`.
 */
export interface RoofPieces {
  width: number;
  height: number;
  ids: Uint16Array;
  count: number;
}

/**
 * The pieces of an image whose overview has `alpha` (one byte per pixel, row by row): the
 * 8-connected groups of pixels at least `ROOF_ALPHA_BYTE` opaque, numbered in reading order. A
 * fainter pixel that holds anything (above `OPEN_ALPHA_BYTE`) joins the piece nearest to it, through
 * other such pixels, up to `ROOF_EDGE_JOIN` pixels away, so a piece fades with its own soft edge.
 */
export function roofPieces(alpha: Uint8Array, width: number, height: number): RoofPieces {
  const ids = new Uint16Array(width * height);
  const count = labelCores(alpha, width, height, ids);
  joinEdges(alpha, width, height, ids);
  return { width, height, ids, count };
}

/** Numbers the 8-connected groups of opaque pixels into `ids`; returns how many there are, at most `MAX_ROOF_PIECES`. */
function labelCores(alpha: Uint8Array, width: number, height: number, ids: Uint16Array): number {
  // Union-find over pixel indices: each opaque pixel points at another of its group, a root at itself.
  const parent = new Int32Array(width * height).fill(-1);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root]!;
    while (parent[i] !== root) {
      const next = parent[i]!;
      parent[i] = root;
      i = next;
    }
    return root;
  };
  const join = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (alpha[i]! < ROOF_ALPHA_BYTE) continue;
      parent[i] = i;
      // The neighbours already seen: left, and the three above.
      if (x > 0 && parent[i - 1]! >= 0) join(i, i - 1);
      if (y === 0) continue;
      const above = i - width;
      if (parent[above]! >= 0) join(i, above);
      if (x > 0 && parent[above - 1]! >= 0) join(i, above - 1);
      if (x < width - 1 && parent[above + 1]! >= 0) join(i, above + 1);
    }
  }
  const numbers = new Map<number, number>();
  for (let i = 0; i < parent.length; i++) {
    if (parent[i]! < 0) continue;
    const root = find(i);
    let id = numbers.get(root);
    if (id === undefined) {
      id = Math.min(numbers.size + 1, MAX_ROOF_PIECES);
      numbers.set(root, id);
    }
    ids[i] = id;
  }
  return Math.min(numbers.size, MAX_ROOF_PIECES);
}

/** Gives the faint pixels near a piece that piece's id, nearest first, one ring of pixels at a time. */
function joinEdges(alpha: Uint8Array, width: number, height: number, ids: Uint16Array): void {
  let ring: number[] = [];
  for (let i = 0; i < ids.length; i++) if (ids[i] !== 0 && touchesFaint(alpha, ids, width, height, i)) ring.push(i);
  for (let step = 0; step < ROOF_EDGE_JOIN && ring.length > 0; step++) {
    const next: number[] = [];
    for (const i of ring) {
      const x = i % width;
      const y = (i - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const n = ny * width + nx;
          if (ids[n] !== 0 || alpha[n]! <= OPEN_ALPHA_BYTE) continue;
          ids[n] = ids[i]!;
          next.push(n);
        }
      }
    }
    ring = next;
  }
}

/** Whether pixel `i` of a piece has a faint neighbour without a piece. */
function touchesFaint(alpha: Uint8Array, ids: Uint16Array, width: number, height: number, i: number): boolean {
  const x = i % width;
  const y = (i - x) / width;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (ids[n] === 0 && alpha[n]! > OPEN_ALPHA_BYTE) return true;
    }
  }
  return false;
}

/** World pixels to the pixels of a roof's pieces: `u = a·x + c·y + tx`, `v = b·x + d·y + ty`. */
export interface PiecesTransform {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

/**
 * How world pixels map onto `pieces` for a roof image of `image`'s size drawn by `placement` (the
 * level's, `levelImagePlacement`): affine, so turned and stretched levels work. The rule and the
 * picture use these very numbers.
 */
export function piecesTransform(pieces: Pick<RoofPieces, 'width' | 'height'>, image: { width: number; height: number }, placement: MapStretch): PiecesTransform {
  const toPieces = (x: number, y: number): Point => {
    const at = worldToImage({ x, y }, image, placement);
    return { x: (at.x * pieces.width) / image.width, y: (at.y * pieces.height) / image.height };
  };
  const origin = toPieces(0, 0);
  const across = toPieces(1, 0);
  const down = toPieces(0, 1);
  return { a: across.x - origin.x, b: across.y - origin.y, c: down.x - origin.x, d: down.y - origin.y, tx: origin.x, ty: origin.y };
}

/** The piece at world `point`: 0 where the roof has none (also outside its image). */
export function pieceAt(pieces: RoofPieces, transform: PiecesTransform, point: Point): number {
  const { a, b, c, d, tx, ty } = transform;
  const u = Math.floor(a * point.x + c * point.y + tx);
  const v = Math.floor(b * point.x + d * point.y + ty);
  if (u < 0 || v < 0 || u >= pieces.width || v >= pieces.height) return 0;
  return pieces.ids[v * pieces.width + u]!;
}

/** The pieces under `points`: those that fade. */
export function piecesUnder(pieces: RoofPieces, transform: PiecesTransform, points: Iterable<Point>): Set<number> {
  const under = new Set<number>();
  for (const point of points) {
    const id = pieceAt(pieces, transform, point);
    if (id !== 0) under.add(id);
  }
  return under;
}

/** What decides whether a roof covers a point in a picture: its pieces, those faded, and where it can be seen. */
export interface RoofCover {
  pieces: RoofPieces;
  transform: PiecesTransform;
  faded: ReadonlySet<number>;
  /** Where the roof is seen (`roofSeenAt`); null where it is seen everywhere (an unlit scene, the GM). */
  seen: ((point: Point) => boolean) | null;
}

/**
 * Whether the roof is drawn over `point`: a piece lies there, it is not faded, and the roof is seen
 * there. A token whose centre it covers is not seen by the players: the roof hides it in the picture.
 */
export function roofDrawnAt(cover: RoofCover, point: Point): boolean {
  const id = pieceAt(cover.pieces, cover.transform, point);
  return id !== 0 && !cover.faded.has(id) && (cover.seen?.(point) ?? true);
}

/**
 * How a roof image is drawn: as its level's map is (`levelImagePlacement`), scaled onto that map's
 * size where it has another (a roof exported at another resolution), so both cover the same world.
 */
export function roofPlacement(placement: MapStretch, background: { width: number; height: number } | null, roof: { width: number; height: number }): MapStretch {
  if (!background || (background.width === roof.width && background.height === roof.height)) return placement;
  return { ...placement, x: (placement.x * background.width) / roof.width, y: (placement.y * background.height) / roof.height };
}

/** Where the tokens that fade the players' roofs stand: those that give the players sight. */
export function partyPlaces(tokens: Readonly<Record<string, TokenEntity>>): Point[] {
  return Object.values(tokens).filter((token) => PLAYER_SIGHT_POLICY.givesSight(token)).map((token) => ({ x: token.x, y: token.y }));
}
