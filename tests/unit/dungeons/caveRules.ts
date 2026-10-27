import { cellsOf, floorCellsOf, holdsCell, roomArea } from '../../../src/app/dungeons/geometry';
import { caveSites } from '../../../src/app/dungeons/layout/cavern/caveSites';
import type { CellPoint, DungeonFloor, DungeonModel } from '../../../src/app/dungeons/model';
import { doorApproaches } from '../../../src/app/dungeons/floors/stairSpots';
import { isAbove, stackOf } from '../../../src/app/dungeons/floors/floorStack';
import { PROP_SPECS } from '../../../src/app/dungeons/props/catalogue';
import { roomCellsOf, standsOffWays } from './coverInvariants';
import { neighbours } from '../../../src/app/dungeons/roomGraph';
import { stairApproaches, stairCells } from './terrainInvariants';

/**
 * The believability rules of a Cavern, recomputed from the finished model (the spec's "Every
 * feature has a reason"): what each room type, hazard and liquid needs of the cave around it.
 */

/** Rule 8: a roost lies within a hop of the mouth, a fungus grove within a hop of water or a roost, the den deep. */
export function lifeProblems(model: DungeonModel): string[] {
  const sites = caveSites(model.floors);
  return model.floors.flatMap((floor, f) => {
    const site = sites[f]!;
    const near = neighbours(floor.rooms.length, floor.doors);
    return floor.rooms.flatMap((room) => {
      if (room.type === 'roost' && (site.hopsFromMouth[room.id] ?? Infinity) > 1) return [`floor ${f}: a roost ${site.hopsFromMouth[room.id]} hops from the mouth`];
      if (room.type === 'fungus-grove' && !site.nearWater(room.id, 1) && !(near[room.id] ?? []).some((n) => floor.rooms[n]?.type === 'roost')) return [`floor ${f}: a fungus grove far from water and roosts`];
      if (room.type === 'den' && !site.deep(room.id)) return [`floor ${f}: a den that is not deep`];
      return [];
    });
  });
}

/** A room that takes a hazard holds no furniture but what nature made in it; a hole from the floor above is that floor's. */
export function hazardFurnishProblems(model: DungeonModel, f: number): string[] {
  const floor = model.floors[f]!;
  const fromAbove = new Set(model.floors.slice(0, f).flatMap((above) => above.terrain.flatMap((p) => (p.opening ? [p.opening.link] : []))));
  const hazarded = new Set(floor.terrain.filter((p) => p.traits.hazard && !(p.opening && fromAbove.has(p.opening.link))).map((p) => p.room));
  return floor.props.filter((p) => hazarded.has(p.room) && !PROP_SPECS[p.kind].natural).map((p) => `a ${p.kind} in hazard room ${p.room}`);
}

type Liquid = 'water' | 'lava' | 'acid';

const LIQUID_OF: Readonly<Partial<Record<string, Liquid>>> = { 'deep-water': 'water', lava: 'lava', acid: 'acid' };

/** At most one liquid in a room: water, lava or acid. */
export function liquidProblems(floor: DungeonFloor): string[] {
  return floor.rooms.flatMap((room) => {
    const liquids = new Set<Liquid>();
    for (const piece of floor.terrain.filter((p) => p.room === room.id)) {
      const liquid = piece.kind === 'shallow-water' || piece.kind === 'pool' ? 'water' : LIQUID_OF[piece.traits.hazard ?? ''];
      if (liquid) liquids.add(liquid);
    }
    if (floor.waterCells.some((c) => holdsCell(room, c.x, c.y))) liquids.add('water');
    return liquids.size > 1 ? [`room ${room.id} holds ${[...liquids].join(' and ')}`] : [];
  });
}

const keyOf = (c: CellPoint): string => `${c.x},${c.y}`;
const within = (a: CellPoint, cells: readonly CellPoint[], d: number): boolean => cells.some((b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= d);

/** The direction cells run along, in [0, π), and how many times longer than wide they lie; worked out apart from the generator. */
function runOf(cells: readonly CellPoint[]): { angle: number; ratio: number } {
  const n = cells.length;
  const mx = cells.reduce((s, c) => s + c.x, 0) / n;
  const my = cells.reduce((s, c) => s + c.y, 0) / n;
  const sxx = cells.reduce((s, c) => s + (c.x - mx) ** 2, 0);
  const syy = cells.reduce((s, c) => s + (c.y - my) ** 2, 0);
  const sxy = cells.reduce((s, c) => s + (c.x - mx) * (c.y - my), 0);
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const big = tr / 2 + Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const small = Math.max(1e-9, tr - big);
  const angle = (((Math.atan2(2 * sxy, sxx - syy) / 2) % Math.PI) + Math.PI) % Math.PI;
  return { angle, ratio: Math.sqrt(big / small) };
}

const lineGap = (a: number, b: number): number => {
  const d = Math.abs((((a - b) % Math.PI) + Math.PI) % Math.PI);
  return Math.min(d, Math.PI - d);
};

/** Rule 2, 3 and 4: lava deep with its ledge, acid deep on a fault ringed by crust, every chasm along a fault. */
export function geologyProblems(model: DungeonModel, crust: boolean): string[] {
  const sites = caveSites(model.floors);
  const tags = new Set(model.tags);
  return model.floors.flatMap((floor, f) => {
    const site = sites[f]!;
    const out: string[] = [];
    const faults = model.cave?.faults ?? [];
    for (const piece of floor.terrain) {
      if (piece.traits.hazard === 'lava') {
        if (!tags.has('lava')) out.push(`floor ${f}: lava without the lava tag`);
        if (!site.deep(piece.room)) out.push(`floor ${f}: lava in room ${piece.room}, which is not deep`);
        if (!floor.terrain.some((p) => p.room === piece.room && p.kind === 'ledge')) out.push(`floor ${f}: lava in room ${piece.room} without a ledge`);
      }
      if (piece.traits.hazard === 'acid') {
        if (!tags.has('acid')) out.push(`floor ${f}: acid without the acid tag`);
        if (!site.deep(piece.room) || !site.faultOf(piece.room)) out.push(`floor ${f}: acid in room ${piece.room}, not deep on a fault`);
        if (crust && !floor.terrain.some((p) => p.room === piece.room && p.kind === 'sulphur-crust')) out.push(`floor ${f}: acid in room ${piece.room} without its crust`);
      }
      if (piece.kind === 'sulphur-crust' && !floor.terrain.some((p) => p.traits.hazard === 'acid' && piece.cells.every((c) => within(c, p.cells, 1)))) out.push(`floor ${f}: sulphur crust away from acid`);
      if (piece.kind === 'chasm' && piece.cells.length >= 4) {
        const { angle } = runOf(piece.cells);
        if (!faults.some((fault) => lineGap(angle, fault) <= Math.PI / 12)) out.push(`floor ${f}: chasm ${piece.id} runs at ${Math.round((angle * 180) / Math.PI)}°, along no fault`);
      }
    }
    return out;
  });
}

const BREAKDOWN = new Set(['rubble-heap', 'rubble-field']);

/** The cells whose middles lie in the middle third of the room's cells both ways. */
function middleThird(cells: readonly CellPoint[]): CellPoint[] {
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const third = (at: number, lo: number, hi: number): boolean => at + 0.5 >= lo + (hi - lo + 1) / 3 && at + 0.5 <= lo + ((hi - lo + 1) * 2) / 3;
  return cells.filter((c) => third(c.x, Math.min(...xs), Math.max(...xs)) && third(c.y, Math.min(...ys), Math.max(...ys)));
}

/** Rule 6: breakdown under the largest span of each floor; rubble at the foot of every pitch and shaft; boulder chokes only at a collapse chamber's door, walked. */
export function breakdownProblems(model: DungeonModel): { problems: string[]; spans: number; held: number } {
  const stack = stackOf(model);
  let spans = 0;
  let held = 0;
  const problems = model.floors.flatMap((floor, f) => {
    const out: string[] = [];
    const rooms = floor.rooms.filter((r) => r.kind === 'room');
    const largest = rooms.reduce((best, r) => (roomArea(r) > roomArea(best) ? r : best), rooms[0]!);
    spans++;
    const middle = new Set(middleThird(floorCellsOf(largest)).map(keyOf));
    if (floor.terrain.some((p) => p.room === largest.id && BREAKDOWN.has(p.kind) && p.cells.some((c) => middle.has(keyOf(c))))) held++;
    const rubble = floor.terrain.filter((p) => BREAKDOWN.has(p.kind)).flatMap((p) => p.cells);
    const inRoom = (cells: readonly CellPoint[]): boolean => rooms.some((r) => cells.every((c) => holdsCell(r, c.x, c.y)));
    const feet = [
      ...floor.stairs.filter((s) => s.way === 'pitch' && isAbove(stack, s.to, f)).map((s) => cellsOf({ x0: s.x, y0: s.y, x1: s.x + s.w - 1, y1: s.y + s.h - 1 })).filter(inRoom),
      ...floor.terrain.filter((p) => p.kind === 'chasm-floor' && p.name === 'dungeon.terrain.shaftFloor').map((p) => p.cells),
    ];
    // A foot with no floor to spare round it (a pitch filling a small chamber) has nowhere for rubble to lie.
    const kept = new Set([...stairCells(floor), ...stairApproaches(floor, f, stack), ...rooms.flatMap((r) => doorApproaches(r, floor.doors))].map(keyOf));
    const spare = (foot: readonly CellPoint[]): boolean => rooms.some((r) => foot.every((c) => holdsCell(r, c.x, c.y)) && floorCellsOf(r).some((c) => !kept.has(keyOf(c)) && within(c, foot, 2) && !foot.some((d) => keyOf(d) === keyOf(c))));
    for (const foot of feet) if (spare(foot) && !rubble.some((c) => within(c, foot, 2))) out.push(`floor ${f}: no rubble at the foot at ${keyOf(foot[0]!)}`);
    for (const choke of floor.terrain.filter((p) => p.kind === 'boulder-choke')) {
      const room = floor.rooms[choke.room];
      const doors = floor.doors.filter((d) => d.from === choke.room || d.to === choke.room);
      if (room?.type !== 'collapse-chamber') out.push(`floor ${f}: a boulder choke in a ${room?.type}`);
      if (!choke.cells.every((c) => doors.some((d) => Math.abs(d.x - c.x) + Math.abs(d.y - c.y) <= 3))) out.push(`floor ${f}: a boulder choke away from its door`);
      if (!choke.traits.difficult || choke.traits.cover || choke.traits.hazard) out.push(`floor ${f}: a boulder choke that is not walked`);
    }
    return out;
  });
  return { problems, spans, held };
}

/** Rule 5: rimstone only where water steps down: beside water, a stream's way in, or steps. */
export function rimstoneProblems(model: DungeonModel): string[] {
  return model.floors.flatMap((floor, f) => floor.terrain.filter((p) => p.kind === 'rimstone').flatMap((piece) => {
    const room = piece.room;
    const water = [...floor.waterCells, ...floor.terrain.filter((p) => p.traits.hazard === 'deep-water' || p.kind === 'pool' || p.kind === 'shallow-water').flatMap((p) => p.cells)];
    const upstream = (floor.cave?.streams ?? []).flatMap((chain) => chain.flatMap((id, i) => (chain[i + 1] === room ? [id] : [])));
    const doors = floor.doors.filter((d) => (d.from === room || d.to === room) && (d.kind === 'steps' || upstream.includes((d.from === room ? d.to : d.from) ?? -1)));
    return piece.cells.every((c) => within(c, water, 1) || doors.some((d) => Math.max(Math.abs(d.x - c.x), Math.abs(d.y - c.y)) <= 2)) ? [] : [`floor ${f}: rimstone in room ${room} where no water steps down`];
  }));
}

const BLOCKING_FOOTING = (p: DungeonFloor['terrain'][number]): boolean => p.traits.hazard !== undefined || p.traits.cover !== undefined || ['pool', 'portal-ring', 'altar', 'statue', 'obelisk'].includes(p.kind);

/** Nothing that blocks, no hazard and no furniture on the lane; no furniture on a hazard or on blocking terrain. */
export function laneProblems(floor: DungeonFloor): string[] {
  const lane = new Set((floor.cave?.lane ?? []).map(keyOf));
  const blocked = new Set(floor.terrain.filter(BLOCKING_FOOTING).flatMap((p) => p.cells.map(keyOf)));
  const out: string[] = [];
  for (const piece of floor.terrain.filter(BLOCKING_FOOTING)) if (piece.cells.some((c) => lane.has(keyOf(c)))) out.push(`${piece.kind} ${piece.id} on the lane`);
  for (const prop of floor.props) {
    const at = `${Math.floor(prop.x)},${Math.floor(prop.y)}`;
    if (lane.has(at) && PROP_SPECS[prop.kind].footing === 'block') out.push(`a ${prop.kind} on the lane at ${at}`);
    if (blocked.has(at) && !PROP_SPECS[prop.kind].wallPiece && !floor.terrain.some((p) => p.kind === 'platform' && p.cells.some((c) => keyOf(c) === at))) out.push(`a ${prop.kind} on blocking terrain at ${at}`);
  }
  return out;
}

const WATER_TYPES = new Set(['lake-cavern', 'stream-passage', 'sump']);

/** Rule 1: water stands only where it gathers, runs only downhill, never on raised rock; a dry cave has none. */
export function waterProblems(model: DungeonModel): string[] {
  const dry = model.tags.includes('dry');
  return model.floors.flatMap((floor, f) => {
    const out: string[] = [];
    const cave = floor.cave;
    const boss = floor.rooms.find((r) => r.boss);
    const standing = new Set([...(cave?.basins ?? []), ...(boss?.type === 'lake-cavern' ? [boss.id] : [])]);
    const running = new Set((cave?.streams ?? []).flat());
    const roomOf = (c: CellPoint): number | undefined => floor.rooms.find((r) => holdsCell(r, c.x, c.y))?.id;
    for (const c of floor.waterCells) {
      const room = roomOf(c);
      if (room === undefined || (!standing.has(room) && !running.has(room))) out.push(`floor ${f}: water at ${keyOf(c)} in room ${room}, where none gathers`);
    }
    for (const piece of floor.terrain) {
      if (piece.traits.hazard === 'deep-water' && piece.kind !== 'channel' && !standing.has(piece.room)) out.push(`floor ${f}: deep water in room ${piece.room}, no basin`);
      if (piece.kind === 'channel' && piece.traits.hazard === 'deep-water') {
        const chain = cave?.streams.find((s) => s.slice(0, -1).includes(piece.room));
        const next = chain ? floor.rooms[chain[chain.indexOf(piece.room) + 1]!] : undefined;
        const here = floor.rooms[piece.room]!;
        const down = next ? (next.x + next.w / 2 - here.x - here.w / 2) * (piece.facing?.x ?? 0) + (next.y + next.h / 2 - here.y - here.h / 2) * (piece.facing?.y ?? 0) : -1;
        if (down <= 0) out.push(`floor ${f}: a stream in room ${piece.room} that does not run downhill`);
      }
    }
    const raised = new Set(floor.terrain.filter((p) => p.kind === 'ledge' || p.kind === 'platform').flatMap((p) => p.cells.map(keyOf)));
    if (floor.waterCells.some((c) => raised.has(keyOf(c)))) out.push(`floor ${f}: water on raised rock`);
    if (dry && (floor.waterCells.length > 0 || floor.terrain.some((p) => p.traits.hazard === 'deep-water'))) out.push(`floor ${f}: water in a dry cave`);
    if (dry && floor.rooms.some((r) => WATER_TYPES.has(r.type ?? '') || (r.boss && r.type === 'lake-cavern'))) out.push(`floor ${f}: a water room in a dry cave`);
    return out;
  });
}

/** The share of a floor's cells under water, standing or running. */
export function waterShare(floor: DungeonFloor): number {
  const cells = floor.rooms.reduce((s, r) => s + roomArea(r), 0);
  const wet = floor.waterCells.length + floor.terrain.filter((p) => p.traits.hazard === 'deep-water').reduce((s, p) => s + p.cells.length, 0);
  return wet / Math.max(1, cells);
}

const HOLLOWS = new Set(['lived-in-hollow', 'fire-hollow', 'pen', 'store-hollow']);

/** Rule 8 of a lived-in cave: a guard post at its mouth, its chief's den at the end, hollows near the mouth and near water, a fire by every sleeping hollow; no story objects in any cave. */
export function livedInProblems(model: DungeonModel): string[] {
  const sites = caveSites(model.floors);
  const all = model.floors.flatMap((f) => f.rooms);
  // Fire pits and stones only: nothing that tells what a hollow is for.
  const out: string[] = model.floors.flatMap((floor) => floor.props.filter((p) => !PROP_SPECS[p.kind].natural && p.kind !== 'campfire').map((p) => `a ${p.kind} in a cave`));
  const guarded = all.some((r) => r.type === 'guard-post');
  if (all.some((r) => r.type === 'cave-mouth') && (guarded || all.some((r) => r.type === 'chief-den' || HOLLOWS.has(r.type ?? '')))) out.push('a wild cave mouth in a lived-in cave');
  const boss = model.floors.at(-1)!.rooms.find((r) => r.boss);
  if (guarded && boss?.type && boss.type !== 'chief-den') out.push(`a lived-in cave ending in a ${boss.type}`);
  model.floors.forEach((floor, f) => {
    const site = sites[f]!;
    const near = neighbours(floor.rooms.length, floor.doors);
    for (const room of floor.rooms) {
      if (!HOLLOWS.has(room.type ?? '')) continue;
      if ((site.hopsFromMouth[room.id] ?? Infinity) > 2 || !site.nearWater(room.id, 1)) out.push(`floor ${f}: a ${room.type} far from the mouth or from water`);
      const fireIn = (id: number): boolean => floor.props.some((p) => p.room === id && p.kind === 'campfire');
      // A hollow that is a crossing, every cell of it a way through, has no place for a fire.
      if (room.type === 'lived-in-hollow' && !fireIn(room.id) && !(near[room.id] ?? []).some(fireIn) && standsOffWays(model, f, room, roomCellsOf(model, f, room))) out.push(`floor ${f}: a sleeping hollow without a fire near it`);
    }
  });
  return out;
}

const CALCITE = new Set(['stalagmites', 'column-formation', 'flowstone', 'curtain', 'crystals']);
const DRIPSTONE = new Set(['stalagmites', 'column-formation']);
/** What dripping and flowing water builds where there is air: crystals grow under water and are left out. */
const DRIPPED = new Set(['stalagmites', 'column-formation', 'flowstone', 'curtain']);

/** Rule 5: formations where drips, flow and air make them. */
export function formationProblems(model: DungeonModel): string[] {
  return model.floors.flatMap((floor, f) => {
    const out: string[] = [];
    const cave = floor.cave;
    const streams = new Set((cave?.streams ?? []).flat());
    const basins = new Set(cave?.basins ?? []);
    const lava = new Set(floor.terrain.filter((p) => p.traits.hazard === 'lava').map((p) => p.room));
    const acid = floor.terrain.filter((p) => p.traits.hazard === 'acid').flatMap((p) => p.cells);
    const water = [...floor.waterCells, ...floor.terrain.filter((p) => p.traits.hazard === 'deep-water' || p.kind === 'pool').flatMap((p) => p.cells)];
    const cellOf = (p: { x: number; y: number }): CellPoint => ({ x: Math.floor(p.x), y: Math.floor(p.y) });
    const stalagmites = floor.props.filter((p) => p.kind === 'stalagmites');
    for (const prop of floor.props) {
      if (!CALCITE.has(prop.kind)) continue;
      const type = floor.rooms[prop.room]?.type;
      if (DRIPSTONE.has(prop.kind) && (streams.has(prop.room) || basins.has(prop.room))) out.push(`floor ${f}: ${prop.kind} in a ${streams.has(prop.room) ? 'stream' : 'flooded'} room`);
      if (prop.kind === 'column-formation' && !stalagmites.some((s) => s.room === prop.room && Math.hypot(s.x - prop.x, s.y - prop.y) <= 2.5)) out.push(`floor ${f}: a column outside a stalagmite cluster`);
      if (prop.kind === 'crystals' && type !== 'crystal-grotto' && !within(cellOf(prop), water, 1)) out.push(`floor ${f}: crystals in a ${type} away from water`);
      if (lava.has(prop.room)) out.push(`floor ${f}: ${prop.kind} where lava runs`);
      if (prop.kind === 'stalagmites' && within(cellOf(prop), acid, 3)) out.push(`floor ${f}: stalagmites by acid`);
    }
    return out;
  });
}

/** Dripped formations per ten floor cells in each room, with what the room is: the mouth, an upper-floor dry dead end, a wet room of the deepest floor. */
export function formationDensity(model: DungeonModel): { mouth: number[]; dryDeadEnds: number[]; wetDeep: number[]; others: number[] } {
  const sites = caveSites(model.floors);
  const out = { mouth: [] as number[], dryDeadEnds: [] as number[], wetDeep: [] as number[], others: [] as number[] };
  model.floors.forEach((floor, f) => {
    const site = sites[f]!;
    const wet = new Set([...(floor.cave?.basins ?? []), ...(floor.cave?.streams ?? []).flat()]);
    for (const room of floor.rooms.filter((r) => r.kind === 'room' && !r.boss)) {
      const density = (10 * floor.props.filter((p) => p.room === room.id && DRIPPED.has(p.kind)).length) / roomArea(room);
      const deadEnd = floor.doors.filter((d) => d.from === room.id || d.to === room.id).length <= 1;
      if (f === 0 && site.hopsFromMouth[room.id] === 0) out.mouth.push(density);
      else if (!site.deepest && deadEnd && !wet.has(room.id)) out.dryDeadEnds.push(density);
      else if (site.deepest && wet.has(room.id)) out.wetDeep.push(density);
      else out.others.push(density);
    }
  });
  return out;
}

const UNDERGROWTH = new Set(['brambles', 'thicket', 'tangled-roots']);

/** Rule 8: green growth only by the mouth, fungi only by water or a roost, nothing where lava runs. */
export function lifeZoneProblems(model: DungeonModel): string[] {
  const sites = caveSites(model.floors);
  return model.floors.flatMap((floor, f) => {
    const site = sites[f]!;
    const near = neighbours(floor.rooms.length, floor.doors);
    const lava = new Set(floor.terrain.filter((p) => p.traits.hazard === 'lava').map((p) => p.room));
    const roost = (id: number): boolean => floor.rooms[id]?.type === 'roost';
    const daylight = (id: number): boolean => f === 0 && (site.hopsFromMouth[id] ?? Infinity) <= 1;
    const living = [...floor.growth.map((g) => ({ kind: g.kind as string, room: g.room })), ...floor.terrain.filter((p) => UNDERGROWTH.has(p.kind)).map((p) => ({ kind: p.kind as string, room: p.room }))];
    return living.flatMap(({ kind, room }) => {
      if (lava.has(room)) return [`floor ${f}: ${kind} where lava runs`];
      if (kind === 'fungi') return site.nearWater(room, 1) || roost(room) || (near[room] ?? []).some(roost) ? [] : [`floor ${f}: fungi far from water and roosts`];
      return daylight(room) ? [] : [`floor ${f}: ${kind} in room ${room}, out of the daylight`];
    });
  });
}

/** The reasons whose hazard a room type is named for: a chasm hall without its chasm is no chasm hall. */
const NAMED_FOR: Readonly<Record<string, (p: DungeonFloor['terrain'][number]) => boolean>> = {
  'chasm-hall': (p) => p.kind === 'chasm',
  'stream-passage': (p) => p.kind === 'channel' && p.traits.hazard === 'deep-water',
  sump: (p) => p.traits.hazard === 'deep-water',
  'lava-tube': (p) => p.traits.hazard === 'lava',
  'sulphur-spring': (p) => p.traits.hazard === 'acid',
};

/** Every room named for its hazard holds it; a cave's boss room is no built dais. */
export function namedHazardProblems(model: DungeonModel): string[] {
  return model.floors.flatMap((floor, f) => floor.rooms.flatMap((room) => {
    const out: string[] = [];
    const holds = NAMED_FOR[room.type ?? ''];
    if (holds && !floor.terrain.some((p) => p.room === room.id && holds(p))) out.push(`floor ${f}: a ${room.type} without its hazard`);
    if (room.type === 'lake-cavern' && !room.boss && !floor.terrain.some((p) => p.room === room.id && p.traits.hazard === 'deep-water')) out.push(`floor ${f}: a lake cavern without its lake`);
    if (room.boss && floor.terrain.some((p) => p.room === room.id && p.kind === 'platform')) out.push(`floor ${f}: a dais in the ${room.type}`);
    return out;
  }));
}
