/**
 * The Cavern: natural caves, the Underdark and monster lairs. Its rooms are what a cave makes of
 * them (report §6.8): a mouth, chambers and passages, galleries along the faults, lakes in the low
 * rooms and streams running to them, a grand cavern at the heart, and a lake, a grand cavern or a
 * den at the end. Its formation comes from the tags or the seed (`withVeins`): a lava tube has no
 * calcite and no fungus, the Underdark more groves, lakes and chasms, a fault more chasms and no
 * calcite, a sulphuric cave more acid springs and no dripstone, a fungal one more groves, a burrow
 * no calcite and a den at its end. Nature builds no ruins.
 */

import { caveParams, caveVariant } from '../layout/cavern/caveParams';
import type { CaveVariant, PropKind } from '../model';
import type { DungeonTag } from '../tags';
import { CAVERN_CLIMAX } from './cavern/cavernClimax';
import { CAVERN_ROOMS } from './cavern/cavernRooms';
import { cavernFacts } from './cavern/caveFacts';
import type { RoomTypeId } from './roomTypes';
import type { FurnishRecipe, Piece, RoomProgramme, RoomTypeSpec, ThemeDefinition } from './themeTypes';

export const CAVERN_PROGRAMME: RoomProgramme = {
  entrance: [
    ['cave-mouth', 1],
    ['guard-post', 1],
  ],
  pivot: ['grand-cavern'],
  stairs: 'shaft-room',
  climax: CAVERN_CLIMAX,
  clusters: [],
  stages: {
    entrance: ['cave-mouth'],
    puzzle: ['crystal-grotto', 'chasm-hall'],
    setback: ['chasm-hall', 'lake-cavern', 'collapse-chamber'],
    climax: [],
    reward: ['crystal-grotto', 'passage-chamber'],
  },
  filler: [['passage-chamber', 1]],
  rooms: CAVERN_ROOMS,
};

/** Calcite: what drips, flows and grows where water seeps through limestone; a lava tube, a fault and a burrow hold none. */
const CALCITE: ReadonlySet<PropKind> = new Set<PropKind>(['stalagmites', 'column-formation', 'flowstone', 'curtain', 'crystals']);
/** What drips from a roof: rotted rock above a sulphuric cave lets no water hang long enough. */
const DRIPSTONE: ReadonlySet<PropKind> = new Set<PropKind>(['stalagmites', 'column-formation']);
/** The rooms calcite makes. */
const CALCITE_ROOMS: ReadonlySet<RoomTypeId> = new Set<RoomTypeId>(['crystal-grotto', 'flowstone-gallery']);
/** What a lava tube cannot hold: calcite rooms and fungus. */
const NOT_IN_LAVA: ReadonlySet<RoomTypeId> = new Set<RoomTypeId>([...CALCITE_ROOMS, 'fungus-grove']);
const NOTHING: ReadonlySet<RoomTypeId> = new Set<RoomTypeId>();

/** How many times as many rooms of a type each formation holds: the Underdark more groves, lakes and chasms, a fault more chasms and collapses and fewer lakes, gas more springs, fungus more groves and fewer lakes. */
const MORE: Readonly<Partial<Record<CaveVariant, Partial<Record<RoomTypeId, number>>>>> = {
  underdark: { 'fungus-grove': 2, 'lake-cavern': 2, 'chasm-hall': 2 },
  fault: { 'chasm-hall': 2, 'collapse-chamber': 2, 'lake-cavern': 0.5 },
  sulphuric: { 'sulphur-spring': 2 },
  fungal: { 'fungus-grove': 2, 'lake-cavern': 0.5 },
};

/** The rooms a formation cannot hold, and the pieces none of its rooms takes. */
const WITHOUT: Readonly<Partial<Record<CaveVariant, { rooms: ReadonlySet<RoomTypeId>; pieces: ReadonlySet<PropKind> }>>> = {
  'lava-tube': { rooms: NOT_IN_LAVA, pieces: CALCITE },
  fault: { rooms: CALCITE_ROOMS, pieces: CALCITE },
  sulphuric: { rooms: NOTHING, pieces: DRIPSTONE },
  burrow: { rooms: CALCITE_ROOMS, pieces: CALCITE },
};

function without(recipe: FurnishRecipe, kinds: ReadonlySet<PropKind>): FurnishRecipe {
  const keep = (piece: Piece | undefined): piece is Piece => piece !== undefined && !kinds.has(piece.kind) && !(piece.parent && kinds.has(piece.parent));
  return { ...(keep(recipe.defining) && { defining: recipe.defining }), pieces: recipe.pieces.filter(keep) };
}

function counted(spec: RoomTypeSpec, times: number | undefined): RoomTypeSpec {
  return times === undefined ? spec : { ...spec, count: [spec.count[0], Math.floor(spec.count[1] * times)] };
}

/**
 * The Cavern's programme for its formation (`CaveModel.variant`; unset, the one its tags name,
 * else the river's cave): the rooms it cannot hold left out, its calcite or dripstone stripped from
 * every recipe, the rooms it holds more or fewer of counted again. A burrow ends where its maker
 * sleeps, or its maker's kin keep their chief: its climax is a den.
 */
export function cavernProgramme(tags: ReadonlySet<DungeonTag>, variant: CaveVariant = caveVariant(tags) ?? 'limestone'): RoomProgramme {
  if (variant === 'limestone') return CAVERN_PROGRAMME;
  const lacks = WITHOUT[variant];
  const more = MORE[variant] ?? {};
  const kept = (id: RoomTypeId): boolean => !lacks?.rooms.has(id);
  const { stages: all } = CAVERN_PROGRAMME;
  const stages: RoomProgramme['stages'] = {
    entrance: all.entrance.filter(kept),
    puzzle: all.puzzle.filter(kept),
    setback: all.setback.filter(kept),
    climax: all.climax.filter(kept),
    reward: all.reward.filter(kept),
  };
  const rooms = CAVERN_ROOMS.filter((spec) => kept(spec.id)).map((spec) => counted(lacks ? { ...spec, furnish: without(spec.furnish, lacks.pieces) } : spec, more[spec.id]));
  const climax = variant === 'burrow' ? CAVERN_CLIMAX.filter((c) => c.type === 'den' || c.type === 'chief-den') : CAVERN_PROGRAMME.climax;
  return { ...CAVERN_PROGRAMME, stages, rooms, climax };
}

export const CAVERN: ThemeDefinition = {
  id: 'cavern',
  built: false,
  rise: 'down',
  ignores: ['colonnades', 'square'],
  refuses: [
    { tag: 'ruined' },
    { tag: 'inhabited', with: 'dry' },
  ],
  programme: CAVERN_PROGRAMME,
  params: caveParams,
  programmeFor: cavernProgramme,
  facts: cavernFacts,
};
