/**
 * What each kind of terrain is to a party: its name (an i18n key, English the source), the traits
 * it always has, and whether it can be walked across. One table, read by the generator and by
 * anyone who needs a piece's meaning.
 */

import type { CellDir, CellPoint, DungeonTerrain, TerrainKind, TerrainTraits } from '../model';

/** Walked across (open, difficult, a bridge, a platform reached by its steps) or not (cover, hazards). */
export type Footing = 'walk' | 'block';

interface KindInfo {
  name: string;
  traits: TerrainTraits;
  footing: Footing;
}

const half = { cover: 'half' } as const;
const total = { cover: 'total' } as const;
const difficult = { difficult: true } as const;

export const TERRAIN_KINDS: Readonly<Record<TerrainKind, KindInfo>> = {
  'low-wall': { name: 'dungeon.terrain.lowWall', traits: half, footing: 'block' },
  'rubble-heap': { name: 'dungeon.terrain.rubbleHeap', traits: half, footing: 'block' },
  pillar: { name: 'dungeon.terrain.pillar', traits: total, footing: 'block' },
  statue: { name: 'dungeon.terrain.statue', traits: { ...total, interactive: true }, footing: 'block' },
  'wall-fragment': { name: 'dungeon.terrain.wallFragment', traits: total, footing: 'block' },
  obelisk: { name: 'dungeon.terrain.obelisk', traits: { ...total, interactive: true }, footing: 'block' },
  'rubble-field': { name: 'dungeon.terrain.rubbleField', traits: difficult, footing: 'walk' },
  'broken-floor': { name: 'dungeon.terrain.brokenFloor', traits: difficult, footing: 'walk' },
  'shallow-water': { name: 'dungeon.terrain.shallowWater', traits: difficult, footing: 'walk' },
  brambles: { name: 'dungeon.terrain.brambles', traits: difficult, footing: 'walk' },
  thicket: { name: 'dungeon.terrain.thicket', traits: difficult, footing: 'walk' },
  'tangled-roots': { name: 'dungeon.terrain.tangledRoots', traits: difficult, footing: 'walk' },
  guano: { name: 'dungeon.terrain.guano', traits: {}, footing: 'walk' },
  'bone-litter': { name: 'dungeon.terrain.boneLitter', traits: {}, footing: 'walk' },
  'sulphur-crust': { name: 'dungeon.terrain.sulphurCrust', traits: {}, footing: 'walk' },
  rimstone: { name: 'dungeon.terrain.rimstone', traits: difficult, footing: 'walk' },
  'boulder-choke': { name: 'dungeon.terrain.boulderChoke', traits: difficult, footing: 'walk' },
  'chasm-floor': { name: 'dungeon.terrain.chasmFloor', traits: difficult, footing: 'walk' },
  chasm: { name: 'dungeon.terrain.chasm', traits: { hazard: 'chasm' }, footing: 'block' },
  shaft: { name: 'dungeon.terrain.shaft', traits: { hazard: 'shaft', elevation: -2 }, footing: 'block' },
  channel: { name: 'dungeon.terrain.lavaChannel', traits: { hazard: 'lava' }, footing: 'block' },
  'deep-water': { name: 'dungeon.terrain.deepWater', traits: { hazard: 'deep-water' }, footing: 'block' },
  pit: { name: 'dungeon.terrain.pit', traits: { hazard: 'pit', elevation: -2 }, footing: 'block' },
  gallery: { name: 'dungeon.terrain.gallery', traits: { elevation: -2 }, footing: 'block' },
  'murder-hole': { name: 'dungeon.terrain.murderHole', traits: {}, footing: 'walk' },
  bridge: { name: 'dungeon.terrain.bridge', traits: {}, footing: 'walk' },
  platform: { name: 'dungeon.terrain.platform', traits: { elevation: 1 }, footing: 'walk' },
  ledge: { name: 'dungeon.terrain.ledge', traits: { elevation: 1 }, footing: 'walk' },
  mosaic: { name: 'dungeon.terrain.mosaic', traits: { interactive: true }, footing: 'walk' },
  pool: { name: 'dungeon.terrain.pool', traits: { interactive: true }, footing: 'block' },
  'portal-ring': { name: 'dungeon.terrain.portalRing', traits: { interactive: true }, footing: 'block' },
};

/** Every kind of terrain. */
export const ALL_TERRAIN_KINDS: ReadonlySet<TerrainKind> = new Set(Object.keys(TERRAIN_KINDS) as TerrainKind[]);

/** Kinds that are holes in a floor when they carry an `opening`. */
export const HOLE_KINDS: ReadonlySet<TerrainKind> = new Set(['chasm', 'shaft', 'gallery', 'murder-hole']);

/** Whether a piece can be walked across. */
export function footingOf(kind: TerrainKind): Footing {
  return TERRAIN_KINDS[kind].footing;
}

/** What a piece is made of before its place: everything but `id`, which the floor's list gives. */
export type TerrainDraft = Omit<DungeonTerrain, 'id'>;

export interface DraftOptions {
  traits?: TerrainTraits;
  name?: string | undefined;
  facing?: CellDir;
  steps?: CellPoint[];
}

/** A piece of `kind` on `cells` of `room`, with its kind's name and traits (`traits` adds to them). */
export function draft(kind: TerrainKind, room: number, cells: CellPoint[], options: DraftOptions = {}): TerrainDraft {
  const info = TERRAIN_KINDS[kind];
  return {
    kind,
    room,
    cells,
    name: options.name ?? info.name,
    traits: { ...info.traits, ...options.traits },
    ...(options.facing && { facing: options.facing }),
    ...(options.steps && { steps: options.steps }),
  };
}
