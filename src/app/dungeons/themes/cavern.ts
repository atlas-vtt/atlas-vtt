/**
 * The Cavern: natural caves, the Underdark and monster lairs. Its rooms are what a cave makes of
 * them (report §6.8): a mouth, chambers and passages, galleries along the faults, lakes in the low
 * rooms and streams running to them, a grand cavern at the heart, and a lake, a grand cavern or a
 * den at the end. Its variant comes from the tags: a lava tube has no calcite and no fungus, the
 * Underdark more groves, lakes and chasms. Nature builds no ruins.
 */

import { caveParams, caveVariant } from '../layout/cavern/caveParams';
import type { PropKind } from '../model';
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

/** Calcite: what drips, flows and grows in a limestone cave, never in a lava tube. */
const CALCITE: ReadonlySet<PropKind> = new Set<PropKind>(['stalagmites', 'column-formation', 'flowstone', 'curtain', 'crystals']);
/** What a lava tube cannot hold: calcite rooms and fungus. */
const NOT_IN_LAVA: ReadonlySet<RoomTypeId> = new Set<RoomTypeId>(['fungus-grove', 'crystal-grotto', 'flowstone-gallery']);
/** The Underdark holds twice as many of these. */
const UNDERDARK_MORE: ReadonlySet<RoomTypeId> = new Set<RoomTypeId>(['fungus-grove', 'lake-cavern', 'chasm-hall']);

function withoutCalcite(recipe: FurnishRecipe): FurnishRecipe {
  const keep = (piece: Piece | undefined): piece is Piece => piece !== undefined && !CALCITE.has(piece.kind) && !(piece.parent && CALCITE.has(piece.parent));
  return { ...(keep(recipe.defining) && { defining: recipe.defining }), pieces: recipe.pieces.filter(keep) };
}

/** The Cavern's programme for its variant (`caveVariant`). */
export function cavernProgramme(tags: ReadonlySet<DungeonTag>): RoomProgramme {
  const variant = caveVariant(tags);
  if (variant === 'limestone') return CAVERN_PROGRAMME;
  if (variant === 'underdark') {
    const rooms = CAVERN_ROOMS.map((spec): RoomTypeSpec => (UNDERDARK_MORE.has(spec.id) ? { ...spec, count: [spec.count[0], spec.count[1] * 2] } : spec));
    return { ...CAVERN_PROGRAMME, rooms };
  }
  const kept = (id: RoomTypeId): boolean => !NOT_IN_LAVA.has(id);
  const { stages: all } = CAVERN_PROGRAMME;
  const stages: RoomProgramme['stages'] = {
    entrance: all.entrance.filter(kept),
    puzzle: all.puzzle.filter(kept),
    setback: all.setback.filter(kept),
    climax: all.climax.filter(kept),
    reward: all.reward.filter(kept),
  };
  const rooms = CAVERN_ROOMS.filter((spec) => kept(spec.id)).map((spec) => ({ ...spec, furnish: withoutCalcite(spec.furnish) }));
  return { ...CAVERN_PROGRAMME, stages, rooms };
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
