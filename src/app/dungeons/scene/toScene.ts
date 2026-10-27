import { normaliseGridOffset } from '../../grid/gridPlacement';
import { wallsCrowd } from '../../import/uvtt/uvttCrowding';
import type { MapSceneParts } from '../../import/writeMapScene';
import { sealTolerance, worldTexel } from '../../lighting/lightingConstants';
import type { WallSegment } from '../../types/wallTypes';
import type { DoorKind, DungeonModel } from '../model';
import { visibleDungeon, type VisibleDungeon } from '../render/visibleDungeon';
import type { DungeonStyle, DungeonView } from '../style';
import { floorLetter } from './roomKeys';
import { floorFeatures } from './toFeatures';
import { floorFires } from './toFires';
import { floorWallLights } from './toWallLights';
import { floorLiquids } from './toLiquids';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import type { LightSource } from '../../types/lightingTypes';
import type { LiquidSurface } from '../../types/liquidTypes';
import { floorSurfaces } from './toSurfaces';
import type { LevelSurface } from '../../types/sceneLevelTypes';
import type { MapFeature } from '../../types/mapFeatureTypes';
import { objectShadows, tallObjects } from './objectShadows';
import { noteRooms, type NoteRoom } from './toNote';
import { stairLinks } from './toStairs';
import { newLevelId } from '../../levels/levelEdits';
import { groundsWalls } from './toGroundsWalls';
import { dungeonWalls, type DungeonPlacement, type DungeonWalls } from './toWalls';

/** A dungeon's scene, and what became of its doors, for the log. */
export interface DungeonSceneParts {
  /** Grid, walls (object outlines included), stairs, map features, liquids, lights and lighting; the levels and pins are added once the maps and the note are written. */
  scene: MapSceneParts;
  /** The rooms of its note, each with its pin's place. */
  rooms: NoteRoom[];
  /** The scene's levels by floor (the entry floor first); null for a dungeon of one floor, whose scene has none. */
  levelIds: string[] | null;
  doors: Partial<Record<DoorKind, number>>;
  /** Door cells that had no walls on both sides to close; left open. */
  unplaced: number;
}

/** The map is lit by its own drawing until the GM lowers the light. */
const DAYLIGHT = 1;

/** The walls of one floor: its own and the outlines of its tall objects (`objectShadows`), on its level where the scene has several. */
function floorWalls(dungeon: VisibleDungeon, style: DungeonStyle, view: DungeonView, placement: DungeonPlacement, image: { width: number; height: number }, level: string | undefined): DungeonWalls {
  const levels = level ? [level] : undefined;
  const id = level ? `dungeon_${floorLetter(dungeon.index).toLowerCase()}` : 'dungeon';
  const own = dungeonWalls(dungeon.model, style, view, placement, dungeon.index, { id, ...(levels && { levels }) });
  const tolerance = sealTolerance(worldTexel(image));
  const shadows = objectShadows(tallObjects(dungeon, view), Object.values(own.walls), placement, tolerance, `wall_${id}_shadow`, levels);
  return { ...own, walls: { ...own.walls, ...shadows, ...groundsWalls(dungeon.floor.grounds, placement, { id, ...(levels && { levels }) }) } };
}

/**
 * What a dungeon brings to its scene on images of `image` pixels drawn at `placement`: the grid
 * drawn on the map (half cells with small tiles; the image's pixel 0 lies on a line of both),
 * every floor's walls and doors and its tall objects' outlines, the stairs between floors and the
 * openings into them (holes, and bridges laid over them), the
 * map features of every floor's terrain and props, its water, lava and acid with the light lava
 * and acid give off over their whole surface, a light in every fire and on every wall light of a lived-in dungeon, the rooms of its note, and dynamic lighting in
 * daylight, so nothing changes until the GM dims it. Light ranges are in `unit`. A dungeon of several floors gets a level per floor; one of one floor none. Null when
 * the walls of a floor would crowd too much to be joined (`wallsCrowd`); a generated dungeon never does.
 */
export function dungeonScene(
  model: DungeonModel,
  style: DungeonStyle,
  view: DungeonView,
  placement: DungeonPlacement,
  image: { width: number; height: number },
  unit: Pick<MeasurementSettings, 'unitType' | 'ruleDistance'>,
): DungeonSceneParts | null {
  const levelIds = model.floors.length > 1 ? model.floors.map(() => newLevelId()) : null;
  const walls: Record<string, WallSegment> = {};
  const features: Record<string, MapFeature> = {};
  const surfaces: Record<string, LevelSurface> = {};
  const liquids: Record<string, LiquidSurface> = {};
  const lights: Record<string, LightSource> = {};
  const doors: Partial<Record<DoorKind, number>> = {};
  let unplaced = 0;
  for (const index of model.floors.keys()) {
    const level = levelIds?.[index];
    const dungeon = visibleDungeon(model, view, index);
    const floor = floorWalls(dungeon, style, view, placement, image, level);
    if (wallsCrowd(Object.values(floor.walls), image)) return null;
    Object.assign(walls, floor.walls);
    const letter = floorLetter(index).toLowerCase();
    Object.assign(features, floorFeatures(dungeon, view, placement, `feature_dungeon_${letter}`, level));
    const wet = floorLiquids(dungeon, style, view, placement, unit, `dungeon_${letter}`, level);
    Object.assign(liquids, wet.liquids);
    Object.assign(lights, wet.lights);
    Object.assign(lights, floorFires(dungeon, style, view, placement, unit, `dungeon_${letter}`, level));
    Object.assign(lights, floorWallLights(dungeon, style, view, placement, unit, `dungeon_${letter}`, level));
    if (level) Object.assign(surfaces, floorSurfaces(dungeon, placement, `levelsurface_dungeon_${letter}`, level));
    for (const [kind, count] of Object.entries(floor.doors) as [DoorKind, number][]) doors[kind] = (doors[kind] ?? 0) + count;
    unplaced += floor.unplaced;
  }
  const size = view.smallTiles ? placement.pxPerCell / 2 : placement.pxPerCell;
  const links = levelIds && stairLinks(model, levelIds, placement);
  return {
    scene: {
      // The map draws its own grid (or none, as the GM chose): Atlas's stays hidden, its snapping on
      grid: { size, ...normaliseGridOffset('square', size, 0, 0), visible: false },
      walls,
      lights,
      lighting: { enabled: true, ambient: DAYLIGHT },
      ...(links && { levelLinks: links }),
      ...(Object.keys(surfaces).length > 0 && { levelSurfaces: surfaces }),
      mapFeatures: features,
      ...(Object.keys(liquids).length > 0 && { liquids }),
    },
    rooms: noteRooms(model, view, placement, levelIds),
    levelIds,
    doors,
    unplaced,
  };
}
