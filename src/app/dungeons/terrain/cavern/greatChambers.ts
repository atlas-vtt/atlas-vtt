/**
 * What fills a cave's great chambers. Veins of the Earth calls a gargantuan cave "an environment in
 * itself", and its hundred caves fill their great chambers with fallen blocks, broken rock, columns,
 * stalagmite fields, a ring round a cluster of giant stalagmites, lakes and the pools stepping down
 * from them, and chambers that end at an abyss; an empty floor of that size is what no cave is. So each hall and gargantuan chamber
 * (and every other house-sized one, built smaller) takes one interior by what its rock and water
 * make likely, a gargantuan one a second where the two keep apart. Laid after the hazards, the
 * special ways and the exits in roof and floor, which it keeps clear of, and before the floor's
 * breakdown, cover and textures, which find it there.
 */

import type { DungeonRoom, PropKind } from '../../model';
import { type Rng, chance, weighted } from '../../rng';
import { LIVED_IN } from '../../themes/cavern/formations';
import type { TypedRoom } from '../typeTerrain';
import type { TerrainWork } from '../work';
import { abyssHall } from './abyssEdge';
import { boulderHall, breakdownField } from './greatBreakdown';
import { rockColumns, ringCluster, stalagmiteForest } from './greatFormations';
import { type Great, type GreatSize, apart, formsAt, furnishInterior, greatGround, openCells } from './greatGround';
import { lakeHall, mayHoldLake } from './greatLake';

export type GreatPattern = 'boulders' | 'breakdown' | 'columns' | 'forest' | 'ring' | 'lake' | 'abyss';

const LAY: Readonly<Record<GreatPattern, (g: Great) => void>> = {
  boulders: boulderHall,
  breakdown: breakdownField,
  columns: rockColumns,
  forest: stalagmiteForest,
  ring: ringCluster,
  lake: lakeHall,
  abyss: abyssHall,
};

/** How likely each interior is where nothing argues for another. */
const BASE: Readonly<Record<GreatPattern, number>> = { boulders: 1, breakdown: 0.8, columns: 1, forest: 0.8, ring: 0.7, lake: 3, abyss: 0.6 };
/** How much a cave's character or a chamber's type favours an interior. */
const FAVOURED = 3;
/** How often a house-sized chamber is built as a small great one. */
const HOUSE_CHANCE = 0.5;
/** How often a gargantuan chamber holds a second interior. */
const SECOND_CHANCE = 0.7;
/** A gargantuan chamber's second interior where its first has a partner of its own (columns round a breakdown in the middle); any other takes fallen blocks round its first. */
const PAIRS: Readonly<Partial<Record<GreatPattern, GreatPattern>>> = { breakdown: 'columns' };
/** The fewest pieces and formations an interior lays before it falls back on fallen blocks, and those it falls back on in turn. */
const LEAST: Readonly<Record<GreatSize, number>> = { house: 4, hall: 8, gargantuan: 10 };
const FALLBACKS: readonly GreatPattern[] = ['boulders', 'breakdown'];
/** Free cells between two interiors of one chamber. */
const BETWEEN = 2;
/** How large a chamber's dripstone is drawn: a column or a stalagmite in a hall a hundred feet across stands taller than one in a house-sized cave, its cell the same; past 1.4 its cover would reach well into the cells beside it. */
const FORMATION_SCALE: Readonly<Record<GreatSize, number>> = { house: 1, hall: 1.25, gargantuan: 1.4 };
const DRIPSTONE: ReadonlySet<PropKind> = new Set(['stalagmites', 'column-formation']);

const FORMATIONS: ReadonlySet<GreatPattern> = new Set(['columns', 'forest', 'ring']);
const SIZES: Readonly<Partial<Record<NonNullable<DungeonRoom['tier']>, GreatSize>>> = { house: 'house', hall: 'hall', gargantuan: 'gargantuan' };

/** Whether formations may grow in the room: not in a lava cave, nor at the mouth where the air dries the rock, nor where the theme forbids dripstone. */
function formsIn(g: Great): boolean {
  const { work, k, rc } = g;
  if (work.cave?.variant === 'lava-tube' || (k === 0 && work.cave?.sites[0]?.hopsFromMouth[rc.room.id] === 0)) return false;
  const open = openCells(g);
  const at = open[Math.floor(open.length / 2)];
  return at !== undefined && formsAt(g, 'column-formation', at) && formsAt(g, 'stalagmites', at);
}

/** The interiors the room may take, weighted by its type, its features and the cave's character. */
function choices(g: Great, type: string | undefined): (readonly [GreatPattern, number])[] {
  const { work, k, floor, rc } = g;
  if (type === 'lake-cavern') return mayHoldLake(work, k, rc.room.id) ? [['lake', 1]] : [];
  const chasm = floor.inRoom(rc.room.id).some((p) => p.kind === 'chasm');
  const always = work.cave?.character?.always;
  const forms = formsIn(g);
  const weight = (pattern: GreatPattern): number => {
    if (pattern === 'lake') return mayHoldLake(work, k, rc.room.id) ? BASE.lake : 0;
    // A chamber ending at an abyss is a hall's or a gargantuan cave's, and one chasm is enough.
    if (pattern === 'abyss') return g.size !== 'house' && !chasm ? BASE.abyss : 0;
    if (chasm && pattern !== 'boulders' && pattern !== 'columns') return 0;
    if (FORMATIONS.has(pattern) && !forms) return 0;
    let w = BASE[pattern];
    if ((always === 'balanced-boulders' || work.cave?.variant === 'fault') && (pattern === 'boulders' || pattern === 'breakdown')) w *= FAVOURED;
    if (always === 'flowstone-crust' && (pattern === 'forest' || pattern === 'ring')) w *= FAVOURED;
    if (type === 'collapse-chamber' && (pattern === 'boulders' || pattern === 'breakdown')) w *= FAVOURED;
    if (type === 'grand-cavern' && (pattern === 'columns' || pattern === 'ring')) w *= FAVOURED;
    if (type === 'flowstone-gallery' && pattern === 'forest') w *= FAVOURED;
    return w;
  };
  return (Object.keys(LAY) as GreatPattern[]).map((p) => [p, weight(p)] as const).filter(([, w]) => w > 0);
}

/** The interiors the chamber takes, in the order they are laid: one, or two for a gargantuan cave that keep apart. */
function patternsFor(g: Great, type: string | undefined, rng: Rng): GreatPattern[] {
  const options = choices(g, type);
  if (options.length === 0) return [];
  const first = weighted(rng, options);
  // Its own partner where the chamber allows it, else fallen blocks round the first.
  const second = [PAIRS[first], 'boulders' as const].find((p) => p !== undefined && p !== first && options.some(([o]) => o === p));
  const pair = g.size === 'gargantuan' && second !== undefined && chance(rng, SECOND_CHANCE);
  return pair ? [first, second] : [first];
}

/** Whether the room is built as a great chamber: a regular one of its sizes, no arena or stage, nobody's home. */
function sizeOf(room: DungeonRoom, typed: TypedRoom | undefined, rng: Rng): GreatSize | null {
  const size = room.tier && SIZES[room.tier];
  if (!size || room.kind !== 'room' || room.boss || room.stage || LIVED_IN.has(typed?.spec.id ?? '')) return null;
  return size === 'house' && !chance(rng, HOUSE_CHANCE) ? null : size;
}

/** Lays the interior of every great chamber of floor `k` of a cave, its formations drawn with the floor's pieces; the interiors each chamber took, by room id. */
export function placeGreatChambers(work: TerrainWork, k: number, rooms: readonly DungeonRoom[], types: ReadonlyMap<number, TypedRoom>): Map<number, GreatPattern[]> {
  const out = new Map<number, GreatPattern[]>();
  const floor = work.floors[k];
  if (!floor || !work.cave) return out;
  for (const room of rooms) {
    const rc = floor.room(room.id);
    const typed = types.get(room.id);
    const rng = work.caveRng(k, `great:${room.id}`);
    const size = rc && sizeOf(room, typed, rng);
    const g = size ? greatGround(work, k, rc, rng, size) : null;
    if (!g) continue;
    const patterns = patternsFor(g, typed?.spec.id, rng);
    // Where the ways through leave a pattern too little room, fallen blocks lie between them all the same.
    const fallbacks = FALLBACKS.filter((p) => !patterns.includes(p));
    for (const pattern of patterns.length ? [...patterns, ...fallbacks] : []) {
      if (patterns.indexOf(pattern) < 0 && g.laid >= LEAST[g.size]) break;
      if (g.own.length > 0) {
        const before = [...g.own];
        g.region = (c) => apart([c], before, BETWEEN);
      }
      LAY[pattern](g);
    }
    for (const { prop } of g.props) if (DRIPSTONE.has(prop.kind)) prop.scale = FORMATION_SCALE[g.size];
    furnishInterior(floor, g.props);
    out.set(room.id, patterns);
  }
  return out;
}
