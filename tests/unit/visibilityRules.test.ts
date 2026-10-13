// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { TokenEntity } from '../../src/app/types';
import type { Point } from '../../src/app/types/visionTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { GENERIC_SIGHT_RULES } from '../../src/app/vision/sightRules';
import { computeSight, lightReach, sightSources, type AmbientLight, type LightReach } from '../../src/app/vision/sight';
import { perceive, seenSpots } from '../../src/app/vision/perception';
import { darknessAt, lightLevelAt } from '../../src/app/vision/lightLevels';
import { quenched, sourcesInDarkness } from '../../src/app/vision/magicalDarkness';
import { doorMiddle, doorsInSight } from '../../src/app/vision/doorSight';
import { tokenPerception } from '../../src/app/vision/tokenPerception';
import { visionCone } from '../../src/app/vision/visionCone';
import { rng } from '../../src/app/pixi/lighting/engine/__tests__/fuzzRooms';
import { firstDifference } from '../helpers/visibilityCompare';
import { gridMapTrial } from '../helpers/visibilityMaps';
import { roomsTrial, wallKindsTrial, type VisibilityTrial } from '../helpers/visibilityScenes';

const route = vi.hoisted(() => ({ full: false, fullCalls: 0 }));

vi.mock('../../src/app/vision/visibility', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/app/vision/visibility')>();
  const full = await import('../oracles/visibilityBaseline/visibility');
  return {
    ...actual,
    computeVisibility: (...args: Parameters<typeof actual.computeVisibility>) => {
      if (!route.full) return actual.computeVisibility(...args);
      route.fullCalls++;
      return full.computeVisibility(...args);
    },
  };
});

const SCALE = { unitDistance: 5, cellSize: 70 };
const CONDITIONS = [{ id: 'unseen', name: 'Unseen', color: '#ffffff', effect: 'invisible' as const }];

/** Vision tokens at a trial's first origins (some with darkvision, a cone, or light), and plain tokens elsewhere. */
function tokensOf(trial: VisibilityTrial, rand: () => number): Record<string, TokenEntity> {
  const tokens: Record<string, TokenEntity> = {};
  trial.calls.slice(0, 12).forEach(({ origin }, i) => {
    const id = `t${i}`;
    tokens[id] = {
      id, kind: 'token', imagePath: '', x: origin.x, y: origin.y, size: 1, layer: 0, rotation: rand() * 360, isHidden: false,
      ...(i % 3 !== 2 && { vision: { enabled: true, ...(i % 2 ? { range: 60 } : {}), ...(i % 4 === 1 ? { angle: 90 } : {}), ...(i % 3 === 1 ? { senses: [{ id: 'darkvision', range: 30 }] } : {}) } }),
      ...(i % 5 === 3 && { conditions: ['unseen'] }),
    };
  });
  return tokens;
}

/** Lights at a trial's origins: bright and dim, beams, and magical darkness that may outrank or be outranked. */
function lightsOf(trial: VisibilityTrial, walls: readonly WallSegment[], rand: () => number): LightReach[] {
  return trial.calls.slice(0, 10).map(({ origin }, i) => {
    const dim = 100 + rand() * 600;
    const cone = i % 4 === 2 ? visionCone(rand() * 360, 60, 17.5) : undefined;
    return lightReach(origin, dim, walls, dim / 2, { ...(i % 5 === 4 && { darkness: true }), ...(i % 7 === 3 && { priority: 1 }), ...(cone && { cone }) });
  });
}

/** Points where coverage is decided at float precision: on and a hair beside polygon edges, on walls, on grid lines, beside doors. */
function samples(polygons: readonly (readonly Point[])[], walls: readonly WallSegment[], rand: () => number): Point[] {
  const points: Point[] = [];
  for (const polygon of polygons) {
    for (let k = 0; k < 60 && polygon.length > 1; k++) {
      const i = Math.floor(rand() * polygon.length), a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
      const f = rand(), len = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
      const on = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      points.push(a, on, { x: on.x + nx * 1e-9, y: on.y + ny * 1e-9 }, { x: on.x - nx * 1e-9, y: on.y - ny * 1e-9 });
    }
  }
  for (let k = 0; k < 200; k++) {
    const w = walls[Math.floor(rand() * walls.length)]!, f = rand();
    points.push({ x: w.p1.x + (w.p2.x - w.p1.x) * f, y: w.p1.y + (w.p2.y - w.p1.y) * f });
    const gx = Math.floor(rand() * 60) * 35, gy = Math.floor(rand() * 60) * 35;
    points.push({ x: gx, y: gy });
  }
  for (const door of walls.filter((w) => w.type === 'door')) {
    const m = doorMiddle(door);
    for (const [dx, dy] of [[4, 0], [-4, 0], [0, 4], [0, -4]] as const) points.push({ x: m.x + dx, y: m.y + dy });
  }
  return points;
}

/** Every rule answer the sweep feeds, worked out under one route, at `at` or at points sampled from this route's polygons. */
function answers(trial: VisibilityTrial, seed: number, full: boolean, at?: Point[]): { text: string; polygons: Point[][]; points: Point[] } {
  route.full = full;
  const rand = rng(seed * 7);
  const walls = trial.walls, tokens = tokensOf(trial, rand), rules = { ...GENERIC_SIGHT_RULES, conditions: CONDITIONS };
  const lights = lightsOf(trial, walls, rand);
  const ambient: AmbientLight = { ambient: [0, 0.4, 1][seed % 3]! };
  const bounds = { width: 2048, height: 2048 };
  const sources = sourcesInDarkness(sightSources(tokens, SCALE, bounds, rules), ambient, lights);
  const sight = computeSight(sources, walls);
  const polygons = [...sight.regions.flatMap((r) => (r.polygon ? [r.polygon] : [])), ...lights.map((l) => l.polygon)];
  const points = at ?? samples(polygons, walls, rng(seed * 11));
  const levelAt = (p: Point): ReturnType<typeof lightLevelAt> => lightLevelAt(p, ambient, lights);
  const perception = tokenPerception(sight, ambient, lights, tokens, { conditions: CONDITIONS });
  const spots = seenSpots(sight, ambient, lights, tokens, SCALE.cellSize, walls, { conditions: CONDITIONS });
  const text = JSON.stringify({
    sources: sources.map((s) => [s.tokenId, s.blinded ?? false, s.senses.length]),
    perceive: points.map((p) => [perceive(p, sight, () => levelAt(p)), perceive(p, sight, () => levelAt(p), { invisible: true })]),
    levels: points.map((p) => [levelAt(p), darknessAt(p, lights), quenched(p, 0, lights), quenched(p, 1, lights)]),
    tokens: Object.keys(tokens).map(perception),
    doors: [...doorsInSight(walls, sight, ambient, lights)].sort(),
    spots: spots.map((s) => [s.x, s.y, s.radius, s.polygon.length]),
  });
  return { text, polygons: [...polygons, ...spots.map((s) => s.polygon)], points };
}

describe('rule answers through the culled sweep', { timeout: 600_000 }, () => {
  const trials: [string, (seed: number) => VisibilityTrial][] = [['rooms', roomsTrial], ['wall kinds', wallKindsTrial], ['grid maps', (seed) => gridMapTrial(seed * 4, 12)]];

  it.each(trials)('answers every rule as the full sweep does on %s', (_, make) => {
    for (let seed = 1; seed <= 6; seed++) {
      const trial = make(seed);
      const before = route.fullCalls;
      const theirs = answers(trial, seed, true);
      expect(route.fullCalls).toBeGreaterThan(before);
      const mine = answers(trial, seed, false, theirs.points);
      mine.polygons.forEach((polygon, i) => expect(firstDifference(polygon, theirs.polygons[i]!)).toBeNull());
      expect(mine.text).toBe(theirs.text);
    }
  });
});
