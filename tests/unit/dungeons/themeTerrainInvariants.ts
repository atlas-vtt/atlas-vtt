import type { CellPoint, DungeonFloor, DungeonModel, DungeonTerrain, TerrainKind } from '../../../src/app/dungeons/model';
import { PROP_SPECS } from '../../../src/app/dungeons/props/catalogue';
import { FEATURES } from '../../../src/app/dungeons/themes/features';
import type { ArenaSetPiece, ArenaSpec, RoomProgramme, RoomTypeSpec } from '../../../src/app/dungeons/themes/themeTypes';
import { floorsBelow, opensAbove } from './holeInvariants';
import { isHazard } from './terrainInvariants';

/**
 * Checks of a themed dungeon's terrain against its rooms' types and the reasons they give
 * (design: "Every feature has a reason"), written apart from the generator. A boss room's arena
 * is its climax type's reason for its platform, set pieces, cover and hazards.
 */

const key = (c: CellPoint): string => `${c.x},${c.y}`;
const LIQUID: ReadonlySet<TerrainKind> = new Set(['deep-water', 'channel', 'pool']);
const OPENINGS: ReadonlySet<TerrainKind> = new Set(['chasm', 'shaft', 'gallery', 'pit', 'murder-hole']);
/** What decay brings into a ruin. */
const RUIN: ReadonlySet<TerrainKind> = new Set(['rubble-heap', 'rubble-field', 'broken-floor', 'tangled-roots', 'wall-fragment']);
/** The structure a room that can hold a fight is given where it has no cover: fallen stone, pillars, a statue. */
const FALLBACK_COVER: ReadonlySet<TerrainKind> = new Set(['rubble-heap', 'pillar', 'statue']);
/** Natural or broken features, never a plain square and never mirrored. */
const NATURAL: ReadonlySet<TerrainKind> = new Set(['chasm', 'rubble-field', 'rubble-heap', 'broken-floor', 'chasm-floor', 'brambles', 'thicket', 'tangled-roots']);

function specIn(programme: RoomProgramme, floor: DungeonFloor, room: number): RoomTypeSpec | undefined {
  const type = floor.rooms[room]?.type;
  return type ? programme.rooms.find((s) => s.id === type) : undefined;
}

const checked = (floor: DungeonFloor, room: number): boolean => floor.rooms[room]?.type !== undefined;

const SET_PIECE_KINDS: Readonly<Record<ArenaSetPiece, TerrainKind>> = { statues: 'statue', ring: 'portal-ring', pillars: 'pillar', mosaic: 'mosaic' };

/** What an arena may hold: its platform, its set pieces, its cover and its hazards. */
function arenaKinds(arena: ArenaSpec): TerrainKind[] {
  const hazards: TerrainKind[] = arena.hazards.map((h) => h);
  return ['platform', ...arena.setPieces.map(([p]) => SET_PIECE_KINDS[p]), ...arena.mirrored, ...hazards];
}

/** The kinds a type's reasons, its allowed terrain, a boss room's arena and (in a ruin) decay give it. */
function reasonKinds(programme: RoomProgramme, spec: RoomTypeSpec, boss: boolean, ruined: boolean): Set<TerrainKind> {
  const reasons = (spec.terrain.features ?? []).map((r) => FEATURES[r]).filter((r) => ruined || !r.ruinedOnly);
  const arena = boss ? programme.climax.find((c) => c.type === spec.id)?.arena : undefined;
  return new Set<TerrainKind>([...(spec.terrain.allows ?? []), ...reasons.flatMap((r) => r.kinds), ...(arena ? arenaKinds(arena) : []), ...(ruined ? RUIN : []), ...FALLBACK_COVER]);
}

/** Every terrain piece of a typed room stands for a reason of its type; water only in rooms with water; falls only into rooms that take them. */
export function reasonProblems(model: DungeonModel, programme: RoomProgramme): string[] {
  const ruined = model.tags.includes('ruined');
  return model.floors.flatMap((floor, f) => {
    const out: string[] = [];
    for (const piece of floor.terrain) {
      if (!checked(floor, piece.room) || piece.kind === 'bridge') continue;
      const spec = specIn(programme, floor, piece.room)!;
      const fromAbove = piece.opening !== undefined && model.floors.some((above, a) => floorsBelow(model, a).includes(f) && above.terrain.some((p) => p.opening?.link === piece.opening?.link));
      // An opening cut for the room below stands for that room's reason.
      const under = piece.opening?.bottom === floorsBelow(model, f)[0] ? model.floors[piece.opening?.bottom ?? -1]?.rooms.find((r) => r.kind === 'room' && piece.cells.every((c) => c.x >= r.x && c.x < r.x + r.w && c.y >= r.y && c.y < r.y + r.h)) : undefined;
      if (under && opensAbove(model, under, piece.kind)) continue;
      if (piece.kind === 'chasm-floor' || fromAbove) {
        if (!(spec.terrain.hazards?.length || spec.id === 'collapsed-room' || !floor.props.some((p) => p.room === piece.room))) out.push(`floor ${f}: a fall into a furnished ${spec.id}`);
        continue;
      }
      if (piece.kind === 'shallow-water') {
        if (!(spec.terrain.features ?? []).some((r) => FEATURES[r].water && (ruined || !FEATURES[r].ruinedOnly))) out.push(`floor ${f}: shallow water in a ${spec.id}`);
        continue;
      }
      if (!reasonKinds(programme, spec, floor.rooms[piece.room]?.boss === true, ruined).has(piece.kind)) out.push(`floor ${f}: ${piece.kind} in a ${spec.id}`);
    }
    for (const c of floor.waterCells) {
      const room = floor.rooms.find((r) => c.x >= r.x && c.x < r.x + r.w && c.y >= r.y && c.y < r.y + r.h);
      const spec = room?.type ? programme.rooms.find((s) => s.id === room.type) : undefined;
      if (!spec || !(spec.terrain.features ?? []).some((r) => FEATURES[r].water && (ruined || !FEATURES[r].ruinedOnly))) out.push(`floor ${f}: water at ${key(c)} in a ${room?.type ?? room?.kind ?? 'wall'}`);
    }
    return [...new Set(out)];
  });
}

/** No hole, pit or shaft within a cell of water or a liquid; no lava or acid beside water. */
export function physicsProblems(model: DungeonModel): string[] {
  return model.floors.flatMap((floor, f) => {
    const wet = new Set([...floor.waterCells.map(key), ...floor.terrain.filter((p) => LIQUID.has(p.kind) && p.traits.hazard !== 'lava' && p.traits.hazard !== 'acid').flatMap((p) => p.cells.map(key))]);
    const near = (cells: readonly CellPoint[]): boolean => cells.some((c) => [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => wet.has(key({ x: c.x + dx, y: c.y + dy })))));
    const holes = floor.terrain.filter((p) => OPENINGS.has(p.kind) && p.kind !== 'chasm-floor');
    const molten = floor.terrain.filter((p) => p.traits.hazard === 'lava' || p.traits.hazard === 'acid');
    return [
      ...holes.filter((p) => near(p.cells)).map((p) => `floor ${f}: ${p.kind} ${p.id} beside water`),
      ...molten.filter((p) => near(p.cells)).map((p) => `floor ${f}: ${p.traits.hazard} ${p.id} beside water`),
    ];
  });
}

const isRectangle = (cells: readonly CellPoint[]): boolean => {
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const w = Math.max(...xs) - Math.min(...xs) + 1;
  const h = Math.max(...ys) - Math.min(...ys) + 1;
  return w * h === new Set(cells.map(key)).size;
};

/** Natural openings are never plain squares or rectangles; built ones (a gaol's oubliette, a cistern's basin, a gallery) follow the walls. */
export function shapeProblems(model: DungeonModel, programme: RoomProgramme): string[] {
  return model.floors.flatMap((floor, f) => floor.terrain.flatMap((piece): string[] => {
    if (!checked(floor, piece.room)) return [];
    const spec = specIn(programme, floor, piece.room)!;
    const built = (spec.terrain.features ?? []).some((r) => FEATURES[r].shape === 'built' && FEATURES[r].kinds.includes(piece.kind));
    if (piece.kind === 'chasm' && piece.cells.length >= 4 && isRectangle(piece.cells) && !built) return [`floor ${f}: a rectangular chasm in a ${spec.id}`];
    if (built && OPENINGS.has(piece.kind) && !isRectangle(piece.cells)) return [`floor ${f}: a ${piece.kind} not along the walls in a ${spec.id}`];
    return [];
  }));
}

/** No natural feature has a mirror image across its room's middle. */
export function mirrorProblems(model: DungeonModel): string[] {
  return model.floors.flatMap((floor, f) => floor.rooms.flatMap((room) => {
    if (!checked(floor, room.id)) return [];
    const pieces = floor.terrain.filter((p) => p.room === room.id && (NATURAL.has(p.kind) || isHazard(p)));
    const mirrored = (a: DungeonTerrain, b: DungeonTerrain, flip: (c: CellPoint) => CellPoint): boolean => a.kind === b.kind && a.cells.length === b.cells.length && a.cells.every((c) => b.cells.some((d) => key(flip(c)) === key(d)));
    const flips = [(c: CellPoint) => ({ x: 2 * room.x + room.w - 1 - c.x, y: c.y }), (c: CellPoint) => ({ x: c.x, y: 2 * room.y + room.h - 1 - c.y })];
    return pieces.flatMap((a, i) => pieces.slice(i + 1).filter((b) => flips.some((flip) => mirrored(a, b, flip))).map(() => `floor ${f}: mirrored ${a.kind} in a ${room.type}`));
  }));
}

/** A room that took a hazard holds no pieces but nature's. */
export function hazardFurnitureProblems(model: DungeonModel): string[] {
  return model.floors.flatMap((floor, f) => floor.rooms.flatMap((room) => {
    if (!checked(floor, room.id) || !floor.terrain.some((p) => p.room === room.id && isHazard(p))) return [];
    return floor.props.filter((p) => p.room === room.id && !PROP_SPECS[p.kind].natural).map((p) => `floor ${f}: a ${p.kind} in a ${room.type} with a hazard`);
  }));
}
