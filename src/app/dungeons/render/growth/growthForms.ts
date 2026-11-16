import type { CellPoint, DungeonGrowth, TerrainKind } from '../../model';
import type { Rng } from '../../rng';
import { valueNoise } from '../art/noise';
import { smoothstep } from '../art/paths';
import type { Vec } from '../geometry';
import type { RenderEnv } from '../renderEnv';
import { shownPieces } from '../terrain/pieces';
import { growClimber, type ClimberKind } from './climbers';
import { bramble, fern, fungi, grassClump, root } from './floorPlants';
import { emptyForm, type PlantForm, type PlantPalette } from './forms';
import { runFrame } from './runFrame';

/**
 * Every plant of the floor as drawn, worked out once per picture from the floor's growth and its
 * undergrowth: climbers on walls and columns, plants and moss on the floor. Each growth draws from
 * a stream of its own, so one plant never moves when another changes.
 */
export interface GrowthPicture {
  /** On the floor, under light and shade: grass, ferns, fungi, roots, undergrowth. */
  ground: PlantForm[];
  /** On the walls, over their foot and top. */
  climbers: PlantForm[];
  /** Round columns, over them. */
  columns: PlantForm[];
  /** Soft spots of moss, in cells, in clusters that lie together. */
  moss: MossSpot[][];
}

export interface MossSpot {
  x: number;
  y: number;
  radius: number;
  /** 0..1 */
  strength: number;
}

export const UNDERGROWTH: ReadonlySet<TerrainKind> = new Set(['brambles', 'thicket', 'tangled-roots']);

const key = (c: CellPoint): string => `${c.x},${c.y}`;

/** Points spread over a patch of cells about `spacing` apart, thinning towards its edge, each with how far inside it lies. */
function scatter(rng: Rng, cells: readonly CellPoint[], spacing: number, soft: number): { p: Vec; depth: number }[] {
  const inside = new Set(cells.map(key));
  const seed = Math.floor(rng() * 1e6);
  const out: { p: Vec; depth: number }[] = [];
  const n = Math.max(1, Math.round(1 / spacing));
  for (const c of cells) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const p = { x: c.x + (i + 0.15 + rng() * 0.7) / n, y: c.y + (j + 0.15 + rng() * 0.7) / n };
        const fx = p.x - c.x;
        const fy = p.y - c.y;
        const depth = Math.min(
          inside.has(key({ x: c.x - 1, y: c.y })) ? 1 : fx,
          inside.has(key({ x: c.x + 1, y: c.y })) ? 1 : 1 - fx,
          inside.has(key({ x: c.x, y: c.y - 1 })) ? 1 : fy,
          inside.has(key({ x: c.x, y: c.y + 1 })) ? 1 : 1 - fy,
        );
        const ragged = depth + (valueNoise(p.x * 2.6, p.y * 2.6, seed) - 0.5) * soft;
        if (rng() < smoothstep(0, soft, ragged)) out.push({ p, depth });
      }
    }
  }
  return out;
}

/** The point moved onto the nearest joint between flagstones (half cells), where weeds take root. */
function onJoint(p: Vec): Vec {
  const jx = Math.round(p.x * 2) / 2;
  const jy = Math.round(p.y * 2) / 2;
  return Math.abs(jx - p.x) < Math.abs(jy - p.y) ? { x: jx, y: p.y } : { x: p.x, y: jy };
}

/** The way up a wall at a point of its foot: away from the floor. */
function upFrom(env: RenderEnv): (p: Vec) => Vec {
  return p => env.dungeon.field.gradient(p.x, p.y);
}

const CLIMBERS: ReadonlySet<string> = new Set(['ivy', 'vine', 'creeper']);

function wallGrowth(env: RenderEnv, g: DungeonGrowth, rng: Rng, picture: GrowthPicture): void {
  const points = g.wall!;
  if (points.length < 2) return;
  const frame = runFrame(points, upFrom(env));
  if (CLIMBERS.has(g.kind)) {
    picture.climbers.push(growClimber(rng, frame, { kind: g.kind as ClimberKind, density: g.density }));
    // Moss gathers at a climber's foot.
    const foot: MossSpot[] = [];
    for (let s = 0; s < frame.length; s += 0.18) if (rng() < 0.4) foot.push({ ...frame.at(s, -0.03 - rng() * 0.08), radius: 0.06 + rng() * 0.08, strength: 0.35 * g.density });
    picture.moss.push(foot);
    return;
  }
  if (g.kind === 'moss') {
    const seed = Math.floor(rng() * 1e6);
    const spots: MossSpot[] = [];
    for (let s = 0; s < frame.length; s += 0.07) {
      // In cushions and runs along the foot, with bare stone between them.
      const full = smoothstep(0, 0.5, s) * smoothstep(0, 0.5, frame.length - s) * (valueNoise(s * 2.3, 0, seed) * 0.7 + valueNoise(s * 6, 3, seed) * 0.3);
      if (full > 0.38) spots.push({ ...frame.at(s, (rng() - 0.75) * 0.22), radius: 0.05 + (full - 0.38) * 0.3, strength: (0.5 + full) * (0.5 + 0.5 * g.density) });
    }
    picture.moss.push(spots);
    return;
  }
  const form = emptyForm(g.kind === 'roots' ? 'root' : 'grass', g.kind === 'roots' ? 0.03 : 0.05);
  if (g.kind === 'roots') {
    for (let s = 0.2 + rng() * 0.4; s < frame.length - 0.1; s += 0.5 + rng() * 0.9) {
      const a = frame.at(s, 0.04);
      const b = frame.at(s, -0.2);
      root(form, rng, a, Math.atan2(b.y - a.y, b.x - a.x) + (rng() - 0.5) * 1.1, 0.5 + rng() * 1.2 * g.density, 0.05 + rng() * 0.035, { dives: true });
    }
  } else {
    for (let s = rng() * 0.3; s < frame.length; s += 0.25 + rng() * 0.45) if (rng() < 0.4 + 0.5 * g.density) grassClump(form, rng, frame.at(s, -0.03 - rng() * 0.08), 0.09 + rng() * 0.07);
  }
  picture.ground.push(form);
}

const PATCH_PALETTE: Partial<Record<DungeonGrowth['kind'], PlantPalette>> = { grass: 'grass', fern: 'fern', fungi: 'fungus' };

function patchGrowth(env: RenderEnv, g: DungeonGrowth, rng: Rng, picture: GrowthPicture): void {
  if (g.kind === 'moss') {
    // Thickest against the wall the patch leans on, thinning out across the floor.
    const wallward = (p: Vec): number => Math.max(0, 0.6 + env.dungeon.field.distance(p.x, p.y)) / 0.6;
    picture.moss.push(scatter(rng, g.cells, 0.2, 0.6).map(({ p }) => ({ ...p, radius: 0.1 + rng() * 0.16, strength: (0.35 + 0.65 * wallward(p)) * (0.6 + 0.4 * g.density) })));
    return;
  }
  const palette = PATCH_PALETTE[g.kind] ?? 'grass';
  const form = emptyForm(palette, g.kind === 'fern' ? 0.1 : 0.03);
  if (g.kind === 'fern') for (const { p, depth } of scatter(rng, g.cells, 0.5, 0.3)) fern(form, rng, p, (0.26 + 0.14 * rng()) * Math.min(1, 0.6 + depth));
  else if (g.kind === 'fungi') for (const { p } of scatter(rng, g.cells, 0.55, 0.35)) fungi(form, rng, p, 0.14 + rng() * 0.12 * (0.5 + g.density));
  else for (const { p } of scatter(rng, g.cells, 0.7, 0.45)) if (rng() < 0.45 + 0.5 * g.density) grassClump(form, rng, rng() < 0.7 ? onJoint(p) : p, 0.1 + rng() * 0.08);
  picture.ground.push(form);
}

function crackGrowth(g: DungeonGrowth, rng: Rng, picture: GrowthPicture): void {
  const form = emptyForm('grass', 0.03);
  const line = g.crack!;
  for (let i = 0; i < line.length; i++) if (rng() < 0.3 + 0.35 * g.density) grassClump(form, rng, line[i]!, 0.05 + rng() * 0.05);
  picture.ground.push(form);
}

function columnGrowth(env: RenderEnv, g: DungeonGrowth, rng: Rng, picture: GrowthPicture): void {
  const column = env.dungeon.floor.columns[g.column!];
  if (!column || column.shattered || env.dungeon.field.distance(column.x, column.y) >= 0 || !CLIMBERS.has(g.kind)) return;
  const r = column.radius + 0.01;
  const start = rng() * Math.PI * 2;
  const sweep = Math.PI * 2 * (0.55 + 0.45 * g.density);
  const n = Math.max(8, Math.round((sweep * r) / 0.05));
  const points = Array.from({ length: n + 1 }, (_, k) => {
    const a = start + (sweep * k) / n;
    const c = Math.cos(a);
    const s = Math.sin(a);
    // A square column's outline: the circle pushed out to its square.
    const k2 = column.square ? 1 / Math.max(Math.abs(c), Math.abs(s)) : 1;
    return { x: column.x + c * r * k2, y: column.y + s * r * k2 };
  });
  const frame = runFrame(points, p => ({ x: column.x - p.x, y: column.y - p.y }));
  picture.columns.push(growClimber(rng, frame, { kind: g.kind as ClimberKind, density: g.density, reach: Math.min(1, column.radius * 2.2), closed: sweep > 6 }));
}

function undergrowth(env: RenderEnv, picture: GrowthPicture): void {
  for (const piece of shownPieces(env, UNDERGROWTH)) {
    const rng = env.rng(`undergrowth:${piece.id}`);
    if (piece.kind === 'thicket') {
      const form = emptyForm('fern', 0.14);
      for (const { p, depth } of scatter(rng, piece.cells, 0.4, 0.2)) fern(form, rng, p, (0.36 + 0.14 * rng()) * Math.min(1, 0.75 + depth));
      picture.ground.push(form);
    } else if (piece.kind === 'brambles') {
      const form = emptyForm('bramble', 0.18);
      for (const { p } of scatter(rng, piece.cells, 0.32, 0.25)) bramble(form, rng, p, 0.3 + rng() * 0.25);
      picture.ground.push(form);
    } else {
      const form = emptyForm('root', 0.05);
      // The roots of one tangle run roughly one way, weaving over and under each other.
      const flow = rng() * Math.PI * 2;
      for (const { p } of scatter(rng, piece.cells, 0.5, 0.2)) {
        const a = flow + (rng() - 0.5) * 1.1;
        root(form, rng, { x: p.x - Math.cos(a) * 0.3, y: p.y - Math.sin(a) * 0.3 }, a, 0.75 + rng() * 0.6, 0.05 + rng() * 0.035, { dives: true });
      }
      picture.ground.push(form);
    }
  }
}

const pictures = new WeakMap<RenderEnv, GrowthPicture>();

/** The floor's plants as the picture shows them (rooms it hides have none). */
export function growthPicture(env: RenderEnv): GrowthPicture {
  const known = pictures.get(env);
  if (known) return known;
  const picture: GrowthPicture = { ground: [], climbers: [], columns: [], moss: [] };
  const { floor, roomShapes } = env.dungeon;
  floor.growth.forEach((g, index) => {
    if (!roomShapes.has(g.room)) return;
    const rng = env.rng(`growth:${index}`);
    if (g.column !== undefined) columnGrowth(env, g, rng, picture);
    else if (g.wall) wallGrowth(env, g, rng, picture);
    else if (g.crack) crackGrowth(g, rng, picture);
    else patchGrowth(env, g, rng, picture);
  });
  undergrowth(env, picture);
  pictures.set(env, picture);
  return picture;
}
