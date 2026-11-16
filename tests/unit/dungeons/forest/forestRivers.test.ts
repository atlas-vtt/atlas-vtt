import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import type { DungeonModel } from '../../../../src/app/dungeons/model';
import { roadField } from '../../../../src/app/dungeons/forest/forestRoads';
import { bends, floorWater, waterField, waterStretches } from '../../../../src/app/dungeons/forest/riverShape';
import { pointInPolygon, signedArea2 } from '../../../../src/app/dungeons/render/geometry';
import { mapLayout } from '../../../../src/app/dungeons/render/layoutSize';
import { loneTrees } from '../../../../src/app/dungeons/render/forest/loneTrees';
import { visibleDungeon } from '../../../../src/app/dungeons/render/visibleDungeon';
import { dungeonScene } from '../../../../src/app/dungeons/scene/toScene';
import { DEFAULT_VIEW } from '../../../../src/app/dungeons/style';
import { dungeonStyle } from '../../../../src/app/dungeons/styleCatalog';

const SEEDS = Array.from({ length: 40 }, (_, k) => k + 1);
const forest = (seed: number, tags: string[] = []): DungeonModel => generateDungeon({ seed, theme: 'forest', tags, floors: 1 });
const area = (rings: readonly (readonly { x: number; y: number }[])[]): number => rings.reduce((sum, ring) => sum + signedArea2(ring) / 2, 0);

// Each test lays the water and roads of dozens of forests: more than the default allows beside a full suite.
describe('a Forest’s rivers', { timeout: 30000 }, () => {
  it('run through most woods, every wet one, never a dry one, and come out the same for the same request', () => {
    expect(SEEDS.filter((seed) => forest(seed, ['dry']).floors[0]!.rivers).length).toBe(0);
    expect(SEEDS.filter((seed) => forest(seed, ['wet']).floors[0]!.rivers).length).toBeGreaterThanOrEqual(36);
    expect(SEEDS.filter((seed) => forest(seed).floors[0]!.rivers).length).toBeGreaterThan(20);
    expect(forest(7, ['wet'])).toEqual(forest(7, ['wet']));
  });

  it('meander as rivers do, no bend tighter than the banks allow, and sometimes flow into a lake', () => {
    let lakes = 0;
    let sinuous = 0;
    for (const seed of SEEDS) {
      const floor = forest(seed, ['wet']).floors[0]!;
      lakes += floor.lakes?.length ?? 0;
      for (const river of floor.rivers ?? []) {
        // Banks half a width out fold where a bend's radius is under half the width: hold it well clear.
        bends(river.points).forEach((bend, i) => expect(Math.abs(bend) * river.widths[i]!).toBeLessThan(1.25));
        const along = river.points.reduce((sum, p, i) => sum + (i ? Math.hypot(p.x - river.points[i - 1]!.x, p.y - river.points[i - 1]!.y) : 0), 0);
        const first = river.points[0]!;
        const last = river.points[river.points.length - 1]!;
        if (along / Math.hypot(last.x - first.x, last.y - first.y) > 1.15) sinuous += 1;
      }
    }
    expect(lakes).toBeGreaterThan(8);
    expect(sinuous).toBeGreaterThan(20);
  });

  it('come in every size, widen below the streams that join them, and part round islands now and then', () => {
    const ends: number[] = [];
    let islands = 0;
    for (const seed of SEEDS) {
      const rivers = forest(seed, seed % 2 ? ['wet'] : []).floors[0]!.rivers ?? [];
      const [main, ...streams] = rivers;
      if (!main) continue;
      ends.push(main.widths[main.widths.length - 1]!);
      islands += main.islands?.length ?? 0;
      for (const stream of streams) {
        // A stream carries a share of the river below it: narrower than the river, which is narrower above the confluence.
        const end = stream.points[stream.points.length - 1]!;
        const at = main.points.findIndex((p) => Math.hypot(p.x - end.x, p.y - end.y) < 0.01);
        expect(at).toBeGreaterThan(0);
        expect(stream.widths[stream.widths.length - 1]!).toBeLessThan(main.widths[Math.min(main.widths.length - 1, at + 20)]!);
        expect(main.widths[Math.max(0, at - 4)]!).toBeLessThan(main.widths[Math.min(main.widths.length - 1, at + 20)]! * 1.05);
      }
    }
    expect(Math.min(...ends)).toBeLessThan(1);
    expect(Math.max(...ends)).toBeGreaterThan(2.4);
    expect(islands).toBeGreaterThan(1);
  });

  it('have meadows along their banks: open ground no room holds, beside the water, inside the rooms\' extent', () => {
    let meadows = 0;
    for (const seed of SEEDS.slice(0, 16)) {
      const floor = forest(seed, ['wet']).floors[0]!;
      if (!floor.rivers) continue;
      const field = waterField(floor.rivers, floor.lakes);
      const minX = Math.min(...floor.rooms.map((r) => r.x));
      const maxX = Math.max(...floor.rooms.map((r) => r.x + r.w));
      meadows += floor.openGround?.length ?? 0;
      const road = roadField(floor.roads);
      for (const c of floor.openGround ?? []) {
        // Beside the water, or on a road's ground.
        expect(Math.min(field.distance(c.x + 0.5, c.y + 0.5) - 3.6, road.distance(c.x + 0.5, c.y + 0.5) - 1.3)).toBeLessThanOrEqual(0);
        expect(c.x).toBeGreaterThanOrEqual(minX);
        expect(c.x).toBeLessThan(maxX);
      }
    }
    expect(meadows).toBeGreaterThan(400);
  });

  it('vary in width, fork now and then, and a tributary ends in the river it joins', () => {
    let forks = 0;
    for (const seed of SEEDS) {
      const rivers = forest(seed, ['wet']).floors[0]!.rivers ?? [];
      for (const river of rivers) {
        expect(river.widths).toHaveLength(river.points.length);
        // Steady along a reach as rivers are, but never one width from end to end.
        expect(Math.max(...river.widths) / Math.min(...river.widths)).toBeGreaterThan(1.08);
      }
      const [main, ...tributaries] = rivers;
      for (const tributary of tributaries) {
        forks += 1;
        const end = tributary.points[tributary.points.length - 1]!;
        expect(waterField([main!]).distance(end.x, end.y)).toBeLessThan(0);
      }
    }
    expect(forks).toBeGreaterThan(10);
  });

  it('keep off stairs and the ways down, and nothing stands in them', () => {
    for (const seed of SEEDS) {
      const floor = forest(seed, ['wet']).floors[0]!;
      const field = waterField(floor.rivers, floor.lakes);
      for (const s of floor.stairs) expect(field.distance(s.x + s.w / 2, s.y + s.h / 2)).toBeGreaterThan(1);
      for (const piece of floor.terrain.filter((p) => p.opening)) for (const c of piece.cells) expect(field.distance(c.x + 0.5, c.y + 0.5)).toBeGreaterThan(1);
      for (const prop of floor.props) expect(field.distance(prop.x, prop.y)).toBeGreaterThan(0.8);
      for (const tree of loneTrees(visibleDungeon(forest(seed, ['wet']), DEFAULT_VIEW, 0))) expect(field.distance(tree.x, tree.y)).toBeGreaterThan(tree.radius);
    }
  });

  it('are crossed by roads that lead from edge to edge, on the map\'s only bridges, two at most, never through a lake', () => {
    let roads = 0;
    let bridges = 0;
    for (const seed of SEEDS) {
      const floor = forest(seed, ['wet']).floors[0]!;
      const minX = Math.min(...floor.rooms.map((r) => r.x));
      const maxX = Math.max(...floor.rooms.map((r) => r.x + r.w));
      const minY = Math.min(...floor.rooms.map((r) => r.y));
      const maxY = Math.max(...floor.rooms.map((r) => r.y + r.h));
      const beyond = (p: { x: number; y: number }): boolean => p.x < minX - 3 || p.x > maxX + 3 || p.y < minY - 3 || p.y > maxY + 3;
      const all = (floor.rivers ?? []).flatMap((river) => river.bridges);
      expect(all.length).toBeLessThanOrEqual(2);
      bridges += all.length;
      const [main, ...branches] = floor.roads ?? [];
      if (main) {
        roads += 1;
        // A road leads somewhere: off the map at both ends; a branch leaves the map at its one end and meets the road at its other.
        expect(beyond(main.points[0]!)).toBe(true);
        expect(beyond(main.points[main.points.length - 1]!)).toBe(true);
        // A path off it leaves the map at one end or joins the road there: every way leads somewhere.
        const joins = (p: { x: number; y: number }): boolean => main.points.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 1.5);
        for (const branch of branches) {
          const ends = [branch.points[0]!, branch.points[branch.points.length - 1]!];
          expect(ends.some(beyond) || ends.some(joins)).toBe(true);
        }
      }
      const water = waterField(floor.rivers, floor.lakes);
      for (const road of floor.roads ?? []) {
        for (const p of road.points) {
          for (const lake of floor.lakes ?? []) expect(pointInPolygon(lake.outline, p.x, p.y)).toBe(false);
          // In a river only on a bridge.
          if (water.distance(p.x, p.y) < -0.2) expect(all.some((b) => Math.hypot(p.x - b.at.x, p.y - b.at.y) <= b.length / 2 + 0.3)).toBe(true);
        }
      }
      for (const bridge of all) expect((floor.roads ?? []).some((road) => road.points.some((p) => Math.hypot(p.x - bridge.at.x, p.y - bridge.at.y) < road.width))).toBe(true);
    }
    expect(roads).toBeGreaterThan(SEEDS.length * 0.6);
    expect(bridges).toBeGreaterThan(5);
  });

  it('lead their trails somewhere: every map with entrances has a road, through its entrances and on to the map\'s edge', () => {
    let reached = 0;
    let total = 0;
    for (const seed of SEEDS) {
      const model = forest(seed, seed % 2 ? ['wet'] : []);
      const ways = visibleDungeon(model, DEFAULT_VIEW, 0).ways;
      if (!ways.length) continue;
      const roads = model.floors[0]!.roads ?? [];
      expect(roads.length).toBeGreaterThan(0);
      // Every entrance's trail is a road's, as far as a road can be laid within two bridges.
      // (Where rivers lie between the entrances so that reaching both would take a third bridge, the road keeps to two and a trail may stay its own.)
      const led = ways.filter(({ mouth }) => roads.some((road) => road.points.some((p) => Math.hypot(p.x - mouth.at.x, p.y - mouth.at.y) < 2.5)));
      reached += led.length;
      total += ways.length;
    }
    expect(reached / total).toBeGreaterThan(0.9);
  });

  it('flow in stretches that hold all their water once', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const rivers = forest(seed, ['wet']).floors[0]!.rivers ?? [];
      if (!rivers.length) continue;
      const floor = forest(seed, ['wet']).floors[0]!;
      const stretches = waterStretches(rivers, floor.lakes);
      const whole = area(floorWater(rivers, floor.lakes));
      expect(Math.abs(area(stretches.flatMap((s) => s.rings)) - whole) / whole).toBeLessThan(0.01);
      for (const { flow } of stretches) if (flow) expect(Math.hypot(flow.x, flow.y)).toBeCloseTo(1);
    }
  });

  it('move as water, are waded as difficult ground and crossed dry on their footbridges in the scene', () => {
    let rivers = 0;
    for (const seed of SEEDS.slice(0, 12)) {
      const model = forest(seed, ['wet']);
      if (!model.floors[0]!.rivers) continue;
      rivers += 1;
      const layout = mapLayout(model, 70, DEFAULT_VIEW);
      const parts = dungeonScene(model, dungeonStyle('crayon'), DEFAULT_VIEW, { originCell: layout.originCell, pxPerCell: 70 }, { width: layout.widthPx, height: layout.heightPx }, { unitType: 'feet', ruleDistance: 5 })!;
      const flowing = Object.values(parts.scene.liquids ?? {}).filter((liquid) => liquid.flow);
      // Each river whole, never in stretches (a bridge's deck or a lake may part it), flowing along its course, its ends at the map's edge open.
      const coursed = flowing.filter((liquid) => liquid.course);
      expect(coursed.length).toBeGreaterThan(0);
      for (const liquid of coursed) for (const k of liquid.openEdges ?? []) expect(k).toBeLessThan(liquid.polygon.length);
      // An open edge lies where water goes on: on the map's edge, or against another surface.
      const atEdge = (p: { x: number; y: number }): boolean => Math.min(Math.abs(p.x), Math.abs(p.y), Math.abs(p.x - layout.widthPx), Math.abs(p.y - layout.heightPx)) < 0.5;
      expect(coursed.some((liquid) => (liquid.openEdges ?? []).some((k) => atEdge(liquid.polygon[k]!) && atEdge(liquid.polygon[(k + 1) % liquid.polygon.length]!)))).toBe(true);
      const features = Object.values(parts.scene.mapFeatures ?? {});
      for (const water of features.filter((f) => f.name === 'River' || f.name === 'Lake')) expect(water.terrain?.difficult).toBe(true);
      const decks = model.floors[0]!.rivers!.flatMap((river) => river.bridges).length;
      expect(features.filter((f) => f.name === 'Bridge')).toHaveLength(decks);
    }
    expect(rivers).toBeGreaterThan(8);
  });
});
