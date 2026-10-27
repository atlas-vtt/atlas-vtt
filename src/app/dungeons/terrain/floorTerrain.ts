/**
 * One floor's terrain while it is being placed: each room's cells (`RoomCells`), the pieces of
 * terrain placed so far and the props placed on whole cells after them. A piece goes in only where
 * its room allows it (free cells, the room still whole); pieces decided across floors (a hole and
 * the floor under it) are held first and added as they are.
 */

import { DRAWN_TERRAIN_KINDS } from '../drawnKinds';
import type { CaveFloor, CellPoint, DungeonColumn, DungeonDoor, DungeonProp, DungeonRoom, DungeonStair, DungeonTerrain, TerrainKind } from '../model';
import { cellKey, cellsOf } from '../geometry';
import { type FloorStack, stairEnd } from '../floors/floorStack';
import { type StairEnd, spotRect } from '../floors/stairSpots';
import { type TerrainDraft, footingOf } from './catalog';
import { RoomCells } from './roomCells';

export interface FloorPlan {
  rooms: readonly DungeonRoom[];
  doors: readonly DungeonDoor[];
  stairs: readonly DungeonStair[];
  columns: readonly DungeonColumn[];
  /** The kinds that may be placed; unset, those with a drawing (`DRAWN_TERRAIN_KINDS`). Tests of placement offer every kind. */
  offeredTerrain?: ReadonlySet<TerrainKind>;
  /** A Cavern floor's geology: its lane, which nothing that blocks stands on, its faults, basins and streams. */
  cave?: CaveFloor;
}

export class FloorTerrain {
  readonly pieces: DungeonTerrain[] = [];
  /** Pieces placed on whole cells after the terrain (the recipes of typed rooms). */
  readonly props: DungeonProp[] = [];
  /** The cells that pieces stand on, by key. */
  private readonly furnished = new Set<string>();
  /** The rooms' pieces, placed once the floor's water and undergrowth lie. */
  private readonly pieceJobs: (() => void)[] = [];
  private readonly cells = new Map<number, RoomCells>();
  /** A Cavern floor's lane, by key. */
  readonly lane: ReadonlySet<string>;

  constructor(
    readonly index: number,
    readonly plan: FloorPlan,
    stack: FloorStack,
  ) {
    const endOf = (stair: DungeonStair): StairEnd => stairEnd(stack, index, stair.to);
    this.lane = new Set((plan.cave?.lane ?? []).map((c) => cellKey(c.x, c.y)));
    for (const room of plan.rooms) {
      if (room.kind !== 'room') continue;
      this.cells.set(room.id, new RoomCells(room, plan.doors, plan.stairs, endOf, plan.columns, this.lane));
    }
  }

  /** The cells of a normal room; undefined for corridors and junctions, which take no terrain. */
  room(id: number): RoomCells | undefined {
    return this.cells.get(id);
  }

  /** The normal room whose floor holds every one of `cells`, if one does. */
  roomHolding(cells: readonly CellPoint[]): RoomCells | undefined {
    const first = cells[0];
    if (!first) return undefined;
    const room = this.plan.rooms.find((r) => r.kind === 'room' && this.cells.get(r.id)?.isFloor(first));
    const rc = room && this.cells.get(room.id);
    return rc && cells.every((c) => rc.isFloor(c)) ? rc : undefined;
  }

  /** Places `piece` if its kind is offered and its room allows it; a bridge's cells on the hole it crosses stay walkable. Its id, or null. */
  place(piece: TerrainDraft, bridges: readonly CellPoint[] = []): number | null {
    const rc = this.cells.get(piece.room);
    if (!rc || !(this.plan.offeredTerrain ?? DRAWN_TERRAIN_KINDS).has(piece.kind) || !rc.allows(piece.cells, footingOf(piece.kind), bridges)) return null;
    rc.take(piece.cells, footingOf(piece.kind));
    return this.push(piece);
  }

  /** A bridge over the piece `spans`: its cells lie on that piece's, so they are walked again. */
  addBridge(piece: TerrainDraft, spans: number): number {
    this.cells.get(piece.room)?.bridge(piece.cells);
    return this.push({ ...piece, spans });
  }

  /** Adds a piece whose cells were held for it (`hold`), with no further check. */
  addHeld(piece: TerrainDraft): number {
    this.cells.get(piece.room)?.take(piece.cells, footingOf(piece.kind));
    return this.push(piece);
  }

  /** Adds a piece whose cells (`cells`) its room has taken. */
  addProp(prop: DungeonProp, cells: readonly CellPoint[] = []): void {
    this.props.push(prop);
    for (const c of cells) this.furnished.add(cellKey(c.x, c.y));
  }

  /** Every cell a piece stands on, by key. */
  propCells(): Set<string> {
    return new Set(this.furnished);
  }

  /** Holds the placing of a room's pieces until the floor's water and undergrowth lie (`placePieces`), so no terrain waits on a piece. */
  deferPieces(place: () => void): void {
    this.pieceJobs.push(place);
  }

  /** Places every room's pieces, in the order their rooms were laid out: once, after the floor's water and undergrowth. */
  placePieces(): void {
    for (const place of this.pieceJobs.splice(0)) place();
  }

  /** The stairwell cells that lie on a room's floor. */
  stairCellsIn(rc: RoomCells): CellPoint[] {
    return this.plan.stairs.flatMap((s) => cellsOf(spotRect(s))).filter((c) => rc.isFloor(c));
  }

  /** Every cell any piece fills, by key. */
  takenCells(): Set<string> {
    return new Set(this.pieces.flatMap((p) => p.cells.map((c) => cellKey(c.x, c.y))));
  }

  /** The pieces in a room. */
  inRoom(id: number): DungeonTerrain[] {
    return this.pieces.filter((p) => p.room === id);
  }

  /** Whether a piece of `kind` on `cells` would be the mirror image of one in the room across its middle: what nature never makes. */
  mirrorsAnother(room: Pick<DungeonRoom, 'id' | 'x' | 'y' | 'w' | 'h'>, kind: TerrainKind, cells: readonly CellPoint[]): boolean {
    const { x, y, w, h } = room;
    const flips = [(c: CellPoint): string => cellKey(2 * x + w - 1 - c.x, c.y), (c: CellPoint): string => cellKey(c.x, 2 * y + h - 1 - c.y)];
    return this.inRoom(room.id).some((p) => p.kind === kind && p.cells.length === cells.length && flips.some((flip) => {
      const own = new Set(p.cells.map((c) => cellKey(c.x, c.y)));
      return cells.every((c) => own.has(flip(c)));
    }));
  }

  private push(piece: TerrainDraft): number {
    const id = this.pieces.length;
    this.pieces.push({ ...piece, id });
    return id;
  }
}
