import { ambientLevelOn, ambientRaster } from '../../src/app/lighting/ambientRaster';
import { stackGrid } from '../../src/app/levels/levelStack';
import { pieceAt, piecesTransform, piecesUnder, roofPieces, roofPlacement, type PiecesTransform, type RoofPieces } from '../../src/app/levels/roofs';
import type { MapStretch } from '../../src/app/grid/mapStretch';
import type { TokenEntity } from '../../src/app/types';
import type { Point } from '../../src/app/types/visionTypes';
import { roofSeenAt, roofViewers } from '../../src/app/vision/roofSight';
import type { AmbientLight, Sight } from '../../src/app/vision/sight';
import type { MapBounds } from '../../src/app/vision/visibility';
import { rng, type P } from '../../src/app/pixi/lighting/engine/__tests__/fuzzRooms';
import { paintedRgbaTexture, type FakeMap } from './levelsView';

/** Pieces of the roofs' leak fuzz (`leakFuzzRoofs.gpu.test.ts`): roof images, their hues, and the rule worked out on its own. */

/** The viewed level's roof: green, which nothing else in the picture is (at night the cool grey of low light takes part of it). */
export const green = (pixels: Uint8ClampedArray, o: number): boolean => pixels[o + 1]! > Math.max(pixels[o]!, pixels[o + 2]!) + 15;
/** A roof of the level below: orange. */
export const orange = (pixels: Uint8ClampedArray, o: number): boolean => pixels[o]! > pixels[o + 1]! + 30 && pixels[o + 1]! > pixels[o + 2]! + 30;

/** A roof image of `side` px over a map of `map` px: rectangles in `boxes` (world px, as the roof is scaled onto the map), each with a faint rim, and faint shadows away from them. */
export function roofMap(side: number, map: number, boxes: readonly [number, number, number, number][], hue: 'green' | 'orange', seed: number): FakeMap {
  const scale = side / map;
  const alpha = new Uint8Array(side * side);
  for (const [x0, y0, x1, y1] of boxes) {
    const [ax, ay, bx, by] = [x0, y0, x1, y1].map((v) => Math.round(v * scale)) as [number, number, number, number];
    for (let y = Math.max(0, ay - 1); y <= Math.min(side - 1, by); y++) {
      for (let x = Math.max(0, ax - 1); x <= Math.min(side - 1, bx); x++) {
        const rim = x < ax || y < ay || x === bx || y === by;
        alpha[y * side + x] = Math.max(alpha[y * side + x]!, rim ? 60 : 255);
      }
    }
  }
  // Faint shadows (a quarter opaque) that touch no roof: they belong to no piece and are never drawn.
  const rand = rng(seed);
  for (let i = 0; i < 3; i++) {
    const [cx, cy] = [Math.floor(rand() * side), Math.floor(rand() * side)];
    for (let y = Math.max(0, cy - 6); y < Math.min(side, cy + 6); y++) {
      for (let x = Math.max(0, cx - 6); x < Math.min(side, cx + 6); x++) {
        if (alpha[y * side + x] === 0 && nothingNear(alpha, side, x, y, 4)) alpha[y * side + x] = 64;
      }
    }
  }
  const texture = paintedRgbaTexture(side, side, (x, y) => {
    const n = ((x * 2654435761) ^ (y * 40503)) >>> 0;
    const a = alpha[y * side + x]!;
    return hue === 'green' ? [30 + (n % 20), 200 + (n % 50), 40, a] : [235, 150 + (n % 30), 20, a];
  });
  return { texture, width: side, height: side, roofAlpha: alpha };
}

function nothingNear(alpha: Uint8Array, side: number, x: number, y: number, reach: number): boolean {
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const [nx, ny] = [x + dx, y + dy];
      if (nx >= 0 && ny >= 0 && nx < side && ny < side && alpha[ny * side + nx]! > 64) return false;
    }
  }
  return true;
}

/** A rectangle around `p` of half-sides `w` × `h`, clamped to the map. */
export function boxAround([x, y]: P, w: number, h: number, map: number): [number, number, number, number] {
  return [Math.max(0, x - w), Math.max(0, y - h), Math.min(map - 1, x + w), Math.min(map - 1, y + h)];
}

/** The rule of a roof, worked out here on its own from the same image: where it is drawn in the players' picture. */
export interface RoofRule {
  pieces: RoofPieces;
  transform: PiecesTransform;
  faded: Set<number>;
  drawnAt(p: Point): boolean;
  /** Whether the roof's pixel at `p` and those around it are wholly opaque: the roof is all there is to see there. */
  solidAt(p: Point): boolean;
}

/**
 * The players' rule of the roof `roof` drawn by `placement` over a map of `background`: faded where
 * the party stands (`party`), seen where `sight`'s senses see it from above in the ambient light of
 * `light` over `bounds` (everywhere where `sight` is null: an unlit scene).
 */
export function roofRule(roof: FakeMap, placement: MapStretch, background: MapBounds, party: readonly Point[], sight: Sight | null, tokens: Record<string, TokenEntity>, light: AmbientLight, bounds: MapBounds): RoofRule {
  const pieces = roofPieces(roof.roofAlpha!, roof.width, roof.height);
  const transform = piecesTransform(pieces, roof, roofPlacement(placement, background, roof));
  const faded = piecesUnder(pieces, transform, party);
  const viewers = sight && roofViewers(sight, tokens);
  const raster = ambientRaster(light, stackGrid(bounds));
  return {
    pieces, transform, faded,
    drawnAt: (p) => {
      const id = pieceAt(pieces, transform, p);
      return id !== 0 && !faded.has(id) && (!viewers || roofSeenAt(p, viewers, ambientLevelOn(raster, light, p)));
    },
    solidAt: (p) => {
      const { a, b, c, d, tx, ty } = transform;
      const [u, v] = [Math.floor(a * p.x + c * p.y + tx), Math.floor(b * p.x + d * p.y + ty)];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const [x, y] = [u + dx, v + dy];
          if (x < 0 || y < 0 || x >= roof.width || y >= roof.height || roof.roofAlpha![y * roof.width + x] !== 255) return false;
        }
      }
      return true;
    },
  };
}

/** Whether `decide` says the same at `p` and at eight points `reach` around it: the pixel lies clear of every edge of the decision. */
export function decided(decide: (p: Point) => boolean, p: Point, reach: number): boolean {
  const here = decide(p);
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    if (decide({ x: p.x + Math.cos(angle) * reach, y: p.y + Math.sin(angle) * reach }) !== here) return false;
  }
  return true;
}
