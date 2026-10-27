import { formatList, type MessageKey, t } from '../../i18n';
import { isAbove, stackOf } from '../floors/floorStack';
import type { CellDir, CellPoint, DoorKind, DungeonDoor, DungeonRoom, DungeonStair, DungeonTerrain, GrowthKind, TerrainKind } from '../model';
import { PROP_KINDS, propKey } from '../props/propKinds';
import { dir, floorCellsOf, holdsCell } from '../geometry';
import type { VisibleFloor } from '../render/visibleDungeon';
import type { DungeonView } from '../style';
import { floorLetter } from './roomKeys';
import { terrainName } from './terrainName';

/**
 * The one line of physical facts a room's heading in the note carries: what someone standing in
 * the room sees, never a story. Exits by compass direction (north is up on the map), stairs and
 * the floor they lead to, what stands in the room, its terrain, water, and what grows there.
 */

type Direction = 'north' | 'east' | 'south' | 'west';
type ExitKind = 'door' | 'opening' | 'secret' | 'stepsUp' | 'stepsDown' | 'narrows' | 'crawl' | 'screeUp' | 'screeDown';

const DIRECTIONS: readonly Direction[] = ['north', 'east', 'south', 'west'];
const EXIT_KINDS: readonly ExitKind[] = ['door', 'opening', 'narrows', 'secret', 'crawl', 'stepsUp', 'screeUp', 'stepsDown', 'screeDown'];
/** What a way out is in a cave: its narrows, its hidden crawls, its scree slopes. */
const CAVE_EXITS: Readonly<Partial<Record<ExitKind, ExitKind>>> = { door: 'narrows', opening: 'narrows', secret: 'crawl', stepsUp: 'screeUp', stepsDown: 'screeDown' };

function directionOf(d: CellDir): Direction {
  if (d.y < 0) return 'north';
  if (d.y > 0) return 'south';
  return d.x > 0 ? 'east' : 'west';
}

/** The way out of `room` through `door`, and what it is from this side (in a cave, as nature made it). */
function exitOf(door: DungeonDoor, room: number, cave: boolean): { direction: Direction; kind: ExitKind; outside: boolean } {
  const leaving = door.from === room;
  const way = leaving ? door.dir : dir(-door.dir.x, -door.dir.y);
  // Steps that descend from `from` to `to` lead down from `from`, up from `to`
  const down = leaving === (door.descends === true);
  const kind: ExitKind = door.kind === 'steps' ? (down ? 'stepsDown' : 'stepsUp') : door.kind;
  return { direction: directionOf(way), kind: (cave && CAVE_EXITS[kind]) || kind, outside: (leaving ? door.to : door.from) === null };
}

const ENTRANCE_KEYS: Record<DoorKind, 'dungeonScene.entrance.door' | 'dungeonScene.entrance.opening' | 'dungeonScene.entrance.secret' | 'dungeonScene.entrance.steps'> = {
  door: 'dungeonScene.entrance.door',
  opening: 'dungeonScene.entrance.opening',
  secret: 'dungeonScene.entrance.secret',
  steps: 'dungeonScene.entrance.steps',
};

function exitSentences(room: DungeonRoom, doors: readonly DungeonDoor[], cave: boolean): string[] {
  const counts = new Map<string, number>();
  const entrances: string[] = [];
  for (const door of doors) {
    if (door.from !== room.id && door.to !== room.id) continue;
    const exit = exitOf(door, room.id, cave);
    const direction = t(`dungeonScene.direction.${exit.direction}`);
    if (exit.outside) entrances.push(t(cave ? 'dungeonScene.entrance.cave' : ENTRANCE_KEYS[door.kind], { direction }));
    else counts.set(`${exit.kind}:${exit.direction}`, (counts.get(`${exit.kind}:${exit.direction}`) ?? 0) + 1);
  }
  // A kind that leaves once in each of several directions is one item ("openings to the north and east")
  const items = EXIT_KINDS.flatMap(kind => {
    const ways = DIRECTIONS.flatMap(direction => {
      const count = counts.get(`${kind}:${direction}`);
      return count ? [{ direction, count }] : [];
    });
    const named = (direction: Direction): string => t(`dungeonScene.direction.${direction}`);
    if (ways.length > 1 && ways.every(way => way.count === 1)) {
      return [t(`dungeonScene.exit.${kind}`, { count: ways.length, direction: formatList(ways.map(way => named(way.direction))) })];
    }
    return ways.map(way => t(`dungeonScene.exit.${kind}`, { count: way.count, direction: named(way.direction) }));
  });
  return [...(items.length ? [t('dungeonScene.exits', { list: formatList(items) })] : []), ...entrances];
}

const inRoom = (room: DungeonRoom, p: CellPoint): boolean => p.x >= room.x && p.x <= room.x + room.w && p.y >= room.y && p.y <= room.y + room.h;

/** What a stairwell is from this end: stairs, or in a cave a pitch (an aven from below) or a scree slope. */
function stairKey(stair: DungeonStair, down: boolean): MessageKey {
  if (stair.way === 'pitch') return down ? 'dungeonScene.pitchDown' : 'dungeonScene.avenUp';
  if (stair.way === 'scree') return down ? 'dungeonScene.screeDown' : 'dungeonScene.screeUp';
  return down ? 'dungeonScene.stairsDown' : 'dungeonScene.stairsUp';
}

function stairSentences(visible: VisibleFloor, room: DungeonRoom): string[] {
  return visible.floor.stairs
    .filter(stair => inRoom(room, { x: stair.x + stair.w / 2, y: stair.y + stair.h / 2 }))
    .map(stair => t(stairKey(stair, isAbove(stackOf(visible.model), visible.index, stair.to)), { floor: floorLetter(stair.to) }));
}

function contents(visible: VisibleFloor, room: DungeonRoom, view: Pick<DungeonView, 'props'>): string[] {
  const { floor } = visible;
  const items: string[] = [];
  if (view.props) {
    const props = floor.props.filter(prop => prop.room === room.id);
    for (const kind of PROP_KINDS) {
      const count = props.filter(prop => prop.kind === kind).length;
      if (count) items.push(t(`dungeonProp.count.${propKey(kind)}` as MessageKey, { count }));
    }
  }
  const columns = floor.columns.filter(column => inRoom(room, column));
  const standing = columns.filter(column => !column.shattered).length;
  if (room.colonnade && standing) items.push(t('dungeonScene.colonnade'));
  else if (standing) items.push(t('dungeonScene.columns', { count: standing }));
  const broken = columns.length - standing;
  if (broken) items.push(t('dungeonScene.brokenColumns', { count: broken }));
  return items.length ? [t('dungeonScene.contents', { list: formatList(items) })] : [];
}

/** Terrain that is the water of a room itself, which its terrain names. */
const WATER_TERRAIN: ReadonlySet<TerrainKind> = new Set(['shallow-water', 'deep-water']);

function waterSentences(visible: VisibleFloor, room: DungeonRoom, view: Pick<DungeonView, 'water'>): string[] {
  if (!view.water || visible.floor.terrain.some(piece => piece.room === room.id && WATER_TERRAIN.has(piece.kind))) return [];
  const under = visible.floor.waterCells.filter(cell => holdsCell(room, cell.x, cell.y)).length;
  if (!under) return [];
  return [t(under * 2 > floorCellsOf(room).length ? 'dungeonScene.poolMost' : 'dungeonScene.poolPart')];
}

/** Feet a step of a piece's elevation stands for (`TerrainTraits.elevation`). */
const FEET_PER_STEP = 5;

/** A piece of terrain as the note names it: its name, and how high, how deep or where it falls to. */
function terrainPhrase(piece: DungeonTerrain): string {
  const name = terrainName(piece);
  if (piece.opening) return piece.opening.bottom === null ? t('dungeonScene.terrain.bottomless', { name }) : t('dungeonScene.terrain.toFloor', { name, floor: floorLetter(piece.opening.bottom) });
  const elevation = piece.traits.elevation ?? 0;
  if (elevation > 0) return t('dungeonScene.terrain.high', { name, height: elevation * FEET_PER_STEP });
  if (elevation < 0) return t('dungeonScene.terrain.deep', { name, depth: -elevation * FEET_PER_STEP });
  return name;
}

function terrainSentences(visible: VisibleFloor, room: DungeonRoom): string[] {
  const counts = new Map<string, number>();
  for (const piece of visible.floor.terrain) {
    if (piece.room !== room.id) continue;
    const phrase = terrainPhrase(piece);
    counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  }
  const items = [...counts].map(([phrase, count]) => (count > 1 ? t('dungeonScene.terrain.count', { name: phrase, count }) : phrase));
  return items.length ? [t('dungeonScene.terrain', { list: formatList(items) })] : [];
}

/** Vegetation in the order the note names it: what climbs the walls first. */
const GROWTH_ORDER: readonly GrowthKind[] = ['ivy', 'vine', 'creeper', 'roots', 'fern', 'moss', 'fungi', 'grass'];

function growthSentences(visible: VisibleFloor, room: DungeonRoom): string[] {
  const kinds = new Set(visible.floor.growth.filter(g => g.room === room.id).map(g => g.kind));
  const items = GROWTH_ORDER.filter(kind => kinds.has(kind)).map(kind => t(`dungeonScene.growthItem.${kind}`));
  return items.length ? [t('dungeonScene.growth', { list: formatList(items) })] : [];
}

/** The facts of a room of a floor as shown, as one line of sentences. */
export function roomFacts(visible: VisibleFloor, room: DungeonRoom, view: Pick<DungeonView, 'props' | 'water'>): string {
  return [
    ...exitSentences(room, visible.doors, visible.floor.cave !== undefined),
    ...stairSentences(visible, room),
    ...contents(visible, room, view),
    ...terrainSentences(visible, room),
    ...waterSentences(visible, room, view),
    ...growthSentences(visible, room),
  ].join(' ');
}
