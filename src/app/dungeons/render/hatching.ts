import { shapeBounds, unionBounds, type Vec } from './geometry';
import { inPocket, filledPockets } from './pockets';
import { bandSeeds, poissonDisc } from './poisson';
import { strokeWidth, type RenderEnv } from './renderEnv';
import { SegmentHash } from './segmentHash';

/** Stroke weights from the wall outwards: the pen presses hardest where the rock meets the wall. */
const WEIGHTS = [1.15, 0.9, 0.65];

/**
 * Hand-inked hatching around the walls: clusters of parallel strokes, each cluster turned
 * across its nearest neighbour, and every stroke stopping where it meets one drawn before, so
 * the clusters interlock without crossing. Strokes lighten away from the wall, so the rock
 * reads deepest against it.
 */
export function drawHatching(env: RenderEnv): void {
  const strokes = hatchStrokes(env);
  const { ctx, palette, dungeon, style } = env;
  const reach = style.surround.reach;
  const bandOf = (i: number): number => {
    const d = dungeon.field.distance((strokes[i]! + strokes[i + 2]!) / 2, (strokes[i + 1]! + strokes[i + 3]!) / 2);
    return Math.min(WEIGHTS.length - 1, Math.max(0, Math.floor((d / reach) * WEIGHTS.length)));
  };
  const bands: number[] = [];
  for (let i = 0; i < strokes.length; i += 4) bands.push(bandOf(i));
  ctx.save();
  ctx.strokeStyle = palette.ink;
  ctx.lineCap = 'round';
  WEIGHTS.forEach((weight, band) => {
    ctx.beginPath();
    for (let i = 0; i < strokes.length; i += 4) {
      if (bands[i / 4] !== band) continue;
      ctx.moveTo(strokes[i]!, strokes[i + 1]!);
      ctx.lineTo(strokes[i + 2]!, strokes[i + 3]!);
    }
    ctx.lineWidth = strokeWidth(env, style.surround.stroke * weight);
    ctx.stroke();
  });
  ctx.restore();
}

/** The strokes as x0, y0, x1, y1 quadruples, in cells. */
export function hatchStrokes(env: RenderEnv): number[] {
  const { dungeon, style } = env;
  const size = style.surround.size;
  const distance = style.surround.reach;
  const count = Math.round(style.surround.strokes);
  const rng = env.rng('hatching');
  const field = dungeon.field;
  const pockets = filledPockets(dungeon, distance);
  const inner = -(2 / 3) * size;
  const boxes = dungeon.floors.map(shape => shapeBounds(shape));
  const bounds = unionBounds(boxes.map(b => ({ minX: b.minX - distance - 1, minY: b.minY - distance - 1, maxX: b.maxX + distance + 1, maxY: b.maxY + distance + 1 })));
  const samples = poissonDisc(
    bounds,
    size,
    (x, y) => {
      const d = field.distance(x, y);
      return d > inner && (d < distance || inPocket(pockets, x, y));
    },
    bandSeeds(dungeon, boxes, distance / 2),
    rng,
  );

  const angles = clusterAngles(samples, size, rng);
  const hash = new SegmentHash(Math.max(size, 0.25));
  const out: number[] = [];
  const width = 0.875 * size;
  const gap = strokeWidth(env, style.surround.stroke) * 0.4;
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i]!;
    const angle = angles[i]!;
    const tx = Math.cos(angle);
    const ty = Math.sin(angle);
    // A stroke runs on until it meets a neighbour's, up to 1.5 to 3.5 half-sizes; one that meets
    // none stays at the square root of that, so strokes grow into the gaps between clusters.
    const half = size / 2;
    const cap = (1.5 + rng() * 2) * half;
    const free = Math.sqrt(cap / half) * half;
    const cluster: number[] = [];
    for (let k = 0; k < count; k++) {
      const offset = (count === 1 ? 0 : k / (count - 1) - 0.5) * width;
      const cx = p.x - ty * offset;
      const cy = p.y + tx * offset;
      const jitter = 0.85 + rng() * 0.3;
      const ahead = reachOf(hash.firstHit(cx, cy, tx, ty, cap * jitter), cap * jitter, free * jitter, gap);
      const behind = reachOf(hash.firstHit(cx, cy, -tx, -ty, cap * jitter), cap * jitter, free * jitter, gap);
      if (ahead + behind < size * 0.25) continue;
      cluster.push(cx - tx * behind, cy - ty * behind, cx + tx * ahead, cy + ty * ahead);
    }
    for (let k = 0; k < cluster.length; k += 4) {
      hash.add(cluster[k]!, cluster[k + 1]!, cluster[k + 2]!, cluster[k + 3]!);
      out.push(cluster[k]!, cluster[k + 1]!, cluster[k + 2]!, cluster[k + 3]!);
    }
  }
  return out;
}

/** A stroke that meets another stops just short of it; a free end stays short. */
function reachOf(hit: number, cap: number, free: number, gap: number): number {
  if (hit < cap) return Math.max(0, hit - gap);
  return Math.min(cap, free);
}

/**
 * Each cluster turns across the line to its nearest earlier neighbour, by 45° to 135°, so
 * neighbours differ while the field keeps some flow.
 */
function clusterAngles(samples: readonly Vec[], size: number, rng: () => number): number[] {
  const angles: number[] = [];
  const cell = size * 2;
  const grid = new Map<number, number[]>();
  const key = (x: number, y: number): number => (Math.floor(x / cell) + 32768) * 65536 + (Math.floor(y / cell) + 32768);
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i]!;
    let best = -1;
    let bestD = Infinity;
    const gx = Math.floor(p.x / cell);
    const gy = Math.floor(p.y / cell);
    for (let j = gy - 1; j <= gy + 1; j++) {
      for (let k = gx - 1; k <= gx + 1; k++) {
        for (const other of grid.get((k + 32768) * 65536 + (j + 32768)) ?? []) {
          const q = samples[other]!;
          const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
          if (d < bestD) {
            bestD = d;
            best = other;
          }
        }
      }
    }
    const away = best < 0 ? rng() * Math.PI : Math.atan2(p.y - samples[best]!.y, p.x - samples[best]!.x);
    angles.push(away + (Math.PI / 4) * (1 + 2 * rng()));
    const list = grid.get(key(p.x, p.y));
    if (list) list.push(i);
    else grid.set(key(p.x, p.y), [i]);
  }
  return angles;
}
