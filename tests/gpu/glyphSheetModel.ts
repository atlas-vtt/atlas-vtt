import type { CellPoint, DungeonModel, DungeonProp, DungeonTerrain, TerrainKind } from '../../src/app/dungeons/model';
import { DUNGEON_GENERATOR_VERSION } from '../../src/app/dungeons/model';
import { PROP_SPECS, propReach } from '../../src/app/dungeons/props/catalogue';
import { glyphFit, type GlyphFit } from '../../src/app/dungeons/render/propShapes';
import { draft } from '../../src/app/dungeons/terrain/catalog';
import { addRoom, emptyFloor } from '../fixtures/dungeonModelBuilder';
import type { SpecimenPiece } from './glyphSheets/types';

/**
 * Rooms for the glyph sheets, built from a family's specimen: pieces against the wall their back
 * faces, free pieces in rows in the middle, the crowded group at the bottom wall, and the reference
 * strip (props and terrain the family is judged beside).
 */

export interface PlacedPiece {
  piece: SpecimenPiece;
  prop: DungeonProp;
  fit: GlyphFit;
}

export interface SheetRoom {
  model: DungeonModel;
  placed: PlacedPiece[];
  /** The room's floor, in cells from (0, 0). */
  w: number;
  h: number;
}

/** What every family's sheet shows beside its pieces (style guide §10). */
const REFERENCE_PROPS: readonly SpecimenPiece[] = (['statue', 'fountain', 'well'] as const).map(kind => ({ kind, rotation: 0 }));
const REFERENCE_TERRAIN: readonly { kind: TerrainKind; w: number }[] = [{ kind: 'rubble-heap', w: 1 }, { kind: 'low-wall', w: 2 }];
/** Discs whose centre lies on their wall (`arrange.ts` seats a dais there). */
const ON_THE_WALL = new Set(['dais']);
/** The widest a row of free pieces runs, in cells. */
const ROW = 14;

type Side = 'bottom' | 'left' | 'top' | 'right';
const SIDES: readonly Side[] = ['bottom', 'left', 'top', 'right'];

/** Quarter turns of a rotation, 0..3. */
function quarters(rotation: number): number {
  return ((Math.round(rotation / (Math.PI / 2)) % 4) + 4) % 4;
}

const isDisc = (piece: SpecimenPiece): boolean => 'reach' in PROP_SPECS[piece.kind].footprint;
const onWall = (piece: SpecimenPiece): boolean => piece.against === 'wall' || PROP_SPECS[piece.kind].wallPiece === true;

/** The cells a piece takes on the map, turned: its fit (a wall piece one cell deep), a disc's whole cells. */
function cellsTaken(piece: SpecimenPiece): { w: number; h: number } {
  const fit = glyphFit({ kind: piece.kind, scale: 1, ...(piece.size && { size: piece.size }) });
  if (isDisc(piece)) {
    const side = Math.max(1, Math.ceil(propReach(piece.kind) * 2));
    return ON_THE_WALL.has(piece.kind) ? { w: Math.ceil(fit.along), h: Math.ceil(fit.out / 2) } : { w: side, h: side };
  }
  const along = Math.max(1, Math.ceil(fit.along));
  const out = Math.max(1, Math.ceil(fit.out));
  return quarters(piece.rotation) % 2 ? { w: out, h: along } : { w: along, h: out };
}

/** The piece as a prop whose cells start at `corner`, its back against `wall` if it has one. */
function propAt(piece: SpecimenPiece, corner: CellPoint, wall: Side | null): PlacedPiece {
  const { w, h } = cellsTaken(piece);
  let x = corner.x + w / 2;
  let y = corner.y + h / 2;
  if (wall && (PROP_SPECS[piece.kind].wallPiece || isDisc(piece))) {
    const off = offWall(piece);
    if (wall === 'bottom') y = corner.y + h - off;
    if (wall === 'top') y = corner.y + off;
    if (wall === 'left') x = corner.x + off;
    if (wall === 'right') x = corner.x + w - off;
  }
  return propCentred(piece, { x, y });
}

/** How far a piece's centre stands off the wall behind it: a wall piece hangs 0.1 off it (`hangPiece`), a disc stands before it (`beforeBackWall`). */
function offWall(piece: SpecimenPiece): number {
  if (PROP_SPECS[piece.kind].wallPiece) return 0.1;
  if (ON_THE_WALL.has(piece.kind)) return 0;
  return Math.max(0.5, propReach(piece.kind) + 0.1);
}

function propCentred(piece: SpecimenPiece, centre: CellPoint): PlacedPiece {
  const prop: DungeonProp = { kind: piece.kind, ...centre, rotation: piece.rotation, scale: 1, room: 0, ...(piece.size && { size: piece.size }) };
  return { piece, prop, fit: glyphFit(prop) };
}

/** The wall a piece's back faces at its rotation: 0 the bottom wall, a quarter turn the left. */
function wallBehind(piece: SpecimenPiece): Side {
  return SIDES[quarters(piece.rotation)]!;
}

/** Rows of `pieces` from `corner`, a cell apart, wrapped at `width`: their places and the height they take. */
function rows(pieces: readonly SpecimenPiece[], corner: CellPoint, width: number): { placed: PlacedPiece[]; w: number; h: number } {
  const placed: PlacedPiece[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  let w = 0;
  for (const piece of pieces) {
    const size = cellsTaken(piece);
    if (x > 0 && x + size.w > width) {
      y += rowH + 1;
      x = 0;
      rowH = 0;
    }
    placed.push(propAt(piece, { x: corner.x + x, y: corner.y + y }, null));
    x += size.w + 1;
    w = Math.max(w, x - 1);
    rowH = Math.max(rowH, size.h);
  }
  return { placed, w, h: placed.length ? y + rowH : 0 };
}

/** How deep a crowded piece reaches from the group's corner: what stands on the wall as deep as it stands off it, anything else from its place. */
function crowdedDepth(piece: SpecimenPiece): number {
  const y = piece.at?.y ?? 0;
  if (isDisc(piece)) return (onWall(piece) ? offWall(piece) : y) + propReach(piece.kind);
  return (onWall(piece) ? 0 : y) + cellsTaken(piece).h;
}

/** How deep the crowded group reaches from its corner towards the bottom wall. */
function groupDepth(crowded: readonly SpecimenPiece[]): number {
  return Math.ceil(Math.max(0, ...crowded.map(crowdedDepth)) - 1e-9);
}

/**
 * A crowded piece at its place in the group: `at` is a disc's centre or a cell piece's corner,
 * from the group's corner. What hangs on or stands against a wall keeps only its `at.x` and takes
 * the group's wall, the bottom one, as recipes put a portrait or a chest at a wall.
 */
function crowdedPiece(piece: SpecimenPiece, along: number, h: number, depth: number): PlacedPiece {
  const at = piece.at ?? { x: 0, y: 0 };
  const x = along + at.x;
  if (isDisc(piece)) return propCentred(piece, { x, y: onWall(piece) ? h - offWall(piece) : h - depth + at.y });
  return onWall(piece) ? propAt(piece, { x, y: h - cellsTaken(piece).h }, 'bottom') : propAt(piece, { x, y: h - depth + at.y }, null);
}

function groupWidth(crowded: readonly SpecimenPiece[]): number {
  return Math.ceil(Math.max(0, ...crowded.map(p => (p.at?.x ?? 0) + (isDisc(p) ? propReach(p.kind) : cellsTaken(p).w))) - 1e-9);
}

/**
 * The specimen's room: wall pieces along the wall behind them, free pieces in rows, the crowded
 * group at the bottom wall, and, unless `bare`, the reference strip along the top.
 */
export function sheetRoom(pieces: readonly SpecimenPiece[], crowded: readonly SpecimenPiece[], bare: boolean): SheetRoom {
  const byWall = new Map<Side, SpecimenPiece[]>(SIDES.map(side => [side, []]));
  for (const piece of pieces.filter(onWall)) byWall.get(wallBehind(piece))!.push(piece);
  const free = [...(bare ? [] : REFERENCE_PROPS), ...pieces.filter(piece => !onWall(piece))];
  const length = (side: Side): number => byWall.get(side)!.reduce((sum, p) => sum + cellsTaken(p)[side === 'left' || side === 'right' ? 'h' : 'w'] + 1, 0);
  const depth = (side: Side): number => Math.max(0, ...byWall.get(side)!.map(p => cellsTaken(p)[side === 'left' || side === 'right' ? 'w' : 'h']));
  const left = depth('left') + 1;
  const top = depth('top') + 1 + (bare ? 0 : 2);
  const middle = rows(free, { x: left + 1, y: top + 1 }, ROW);
  const bottomDepth = Math.max(depth('bottom'), groupDepth(crowded));
  const inner = Math.max(middle.h + 2, length('left'), length('right'));
  const h = top + inner + bottomDepth + 1;
  const crowdedW = crowded.length ? groupWidth(crowded) + 1 : 0;
  const w = Math.max(left + middle.w + 2 + depth('right') + 1, length('bottom') + crowdedW + 1, length('top') + 1, bare ? 0 : 6);
  const placed = [...middle.placed];
  let along = 1;
  for (const piece of byWall.get('bottom')!) {
    const size = cellsTaken(piece);
    placed.push(propAt(piece, { x: along, y: h - size.h }, 'bottom'));
    along += size.w + 1;
  }
  for (const piece of crowded) placed.push(crowdedPiece(piece, along, h, bottomDepth));
  along = 1;
  for (const piece of byWall.get('top')!) {
    const size = cellsTaken(piece);
    placed.push(propAt(piece, { x: along, y: 0 }, 'top'));
    along += size.w + 1;
  }
  for (const side of ['left', 'right'] as const) {
    along = top;
    for (const piece of byWall.get(side)!) {
      const size = cellsTaken(piece);
      placed.push(propAt(piece, { x: side === 'left' ? 0 : w - size.w, y: along }, side));
      along += size.h + 1;
    }
  }
  return { model: modelOf(w, h, placed, bare ? [] : referenceTerrain(depth('top') + 1, top)), placed, w, h };
}

/** The reference terrain in a row below the top wall's pieces. */
function referenceTerrain(y: number, top: number): DungeonTerrain[] {
  if (top - y < 2) return [];
  let x = 1;
  return REFERENCE_TERRAIN.map(({ kind, w }, id) => {
    const cells = Array.from({ length: w }, (_, k) => ({ x: x + k, y }));
    x += w + 1;
    return { id, ...draft(kind, 0, cells) };
  });
}

/** One room of `w` × `h` cells holding `placed` and `terrain`, on a floor of its own. */
export function modelOf(w: number, h: number, placed: readonly PlacedPiece[], terrain: DungeonTerrain[] = []): DungeonModel {
  const floor = emptyFloor();
  addRoom(floor, { x: 0, y: 0, w, h });
  floor.props.push(...placed.map(p => p.prop));
  floor.terrain.push(...terrain);
  return { version: DUNGEON_GENERATOR_VERSION, seed: 11, theme: 'fortress', tags: [], floors: [floor] };
}

/** A piece alone in a room two cells larger than it on every side, at the room's wall where it hangs on one. */
export function aloneRoom(piece: SpecimenPiece): SheetRoom & { empty: DungeonModel } {
  const size = cellsTaken(piece);
  const w = size.w + 4;
  const h = size.h + 4;
  const wall = onWall(piece) ? wallBehind(piece) : null;
  const placed = [propAt(piece, cornerAgainst(wall, w, h, size), wall)];
  return { model: modelOf(w, h, placed), empty: modelOf(w, h, []), placed, w, h };
}

/** The corner of a piece's cells in a room of `w` × `h`, two cells in from the walls, or against `wall`. */
function cornerAgainst(wall: Side | null, w: number, h: number, size: { w: number; h: number }): CellPoint {
  switch (wall) {
    case 'bottom':
      return { x: 2, y: h - size.h };
    case 'top':
      return { x: 2, y: 0 };
    case 'left':
      return { x: 0, y: 2 };
    case 'right':
      return { x: w - size.w, y: 2 };
    default:
      return { x: 2, y: 2 };
  }
}

/** Every distinct kind and size of a specimen at its four turns, one kind to a row: the close sheet. */
export function turnsRoom(pieces: readonly SpecimenPiece[]): SheetRoom {
  const seen = new Set<string>();
  const placed: PlacedPiece[] = [];
  let y = 1;
  let w = 0;
  for (const piece of pieces) {
    const key = `${piece.kind}:${piece.size?.along ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const turns = [0, 1, 2, 3].map(q => ({ kind: piece.kind, rotation: (q * Math.PI) / 2, ...(piece.size && { size: piece.size }) }));
    const row = rows(turns, { x: 1, y }, Infinity);
    placed.push(...row.placed);
    w = Math.max(w, row.w);
    y += row.h + 1;
  }
  return { model: modelOf(w + 2, y, placed), placed, w: w + 2, h: y };
}
