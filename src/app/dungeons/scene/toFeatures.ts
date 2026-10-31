import { type MessageKey, t } from '../../i18n';
import { MAX_FEATURE_CORNERS, MAX_MAP_FEATURES } from '../../mapFeatures/mapFeatures';
import type { FeatureTerrain, MapFeature } from '../../types/mapFeatureTypes';
import type { CellPoint, DungeonColumn, DungeonGrowth, DungeonProp, DungeonTerrain, GrowthKind, PropKind } from '../model';
import { GROWTH_KINDS } from '../growthModel';
import { PROP_SPECS, isCellPiece, propReach } from '../props/catalogue';
import { propKey } from '../props/propKinds';
import { propsAsDrawn } from '../render/propsAsDrawn';
import { loneTrees, type LoneTree } from '../render/forest/loneTrees';
import type { VisibleDungeon } from '../render/visibleDungeon';
import type { DungeonView } from '../style';
import { deckOf, floorWater, waterStretches } from '../forest/riverShape';
import { intersectRings, subtractRings } from '../render/clipShapes';
import { pointsBounds, signedArea2 } from '../render/geometry';
import { cellOutlines } from './cellOutline';
import { fitCorners, floorRingsOf } from './sceneRings';
import { terrainName } from './terrainName';
import type { DungeonPlacement } from './toWalls';

/**
 * What a floor holds as the map features of its level, so the GM reads its name and what it does
 * to play on hover: every piece of terrain (cover, difficult ground, hazards, bridges, set pieces)
 * on exactly its cells, every prop and every column on what the map draws of it, and
 * the vegetation worth naming on its cells. One builder per kind of thing; vegetation first, then
 * terrain, so what stands on them lies over them.
 */

/** A feature before its id and level: its area in cells, its name and what it does to play. */
interface Draft {
  polygon: CellPoint[];
  name: string;
  terrain?: FeatureTerrain;
}

function terrainOf(traits: { difficult?: true; cover?: FeatureTerrain['cover'] }): FeatureTerrain | undefined {
  const terrain: FeatureTerrain = { ...(traits.difficult && { difficult: true }), ...(traits.cover && { cover: traits.cover }) };
  return terrain.difficult || terrain.cover ? terrain : undefined;
}

const withTerrain = (draft: Omit<Draft, 'terrain'>, terrain: FeatureTerrain | undefined): Draft => (terrain ? { ...draft, terrain } : draft);

/** A piece of terrain on its cells: one feature per ring of them (`cellOutlines`), named as the piece names itself. */
function terrainDrafts(pieces: readonly DungeonTerrain[]): Draft[] {
  return pieces.flatMap(piece => {
    const name = terrainName(piece);
    const terrain = terrainOf(piece.traits);
    return cellOutlines(piece.cells, MAX_FEATURE_CORNERS).map(polygon => withTerrain({ polygon, name }, terrain));
  });
}

/**
 * The parapet along a gallery's rim: the floor cells beside the hole, where the map draws the low
 * rail (`render/terrain/terrainOpenings.ts`). Standing there behind it is half cover.
 */
function parapetDrafts(pieces: readonly DungeonTerrain[], onFloor: (cell: CellPoint) => boolean): Draft[] {
  return pieces.filter(piece => piece.kind === 'gallery').flatMap(piece => {
    const hole = new Set(piece.cells.map(c => `${c.x},${c.y}`));
    const rim = new Map<string, CellPoint>();
    for (const { x, y } of piece.cells) {
      for (const cell of [{ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 }]) {
        const key = `${cell.x},${cell.y}`;
        if (!hole.has(key) && onFloor(cell)) rim.set(key, cell);
      }
    }
    return cellOutlines([...rim.values()], MAX_FEATURE_CORNERS).map((polygon): Draft => ({ polygon, name: t('dungeon.terrain.parapet'), terrain: { cover: 'half' } }));
  });
}

/** Growth a GM may want to name at the table: what can be climbed, hidden in or slipped on. Weeds are not worth a label. */
const NAMED_GROWTH: ReadonlySet<GrowthKind> = new Set(['ivy', 'vine', 'creeper', 'roots', 'fern', 'moss', 'fungi']);

/** Vegetation on the cells it lies on or hangs over, one feature per ring of them; it changes nothing in play. */
function growthDrafts(growth: readonly DungeonGrowth[]): Draft[] {
  return growth.filter(g => NAMED_GROWTH.has(g.kind) && g.cells.length > 0).flatMap(g => {
    const name = terrainName({ name: GROWTH_KINDS[g.kind].name, kind: g.kind });
    return cellOutlines(g.cells, MAX_FEATURE_CORNERS).map((polygon): Draft => ({ polygon, name }));
  });
}

/** A box in a prop's own frame, before its turn and scale (y up the prop's facing is negative). */
interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Props whose drawing is no disc around their origin (`render/propStone.ts`): a dais reaches in from the wall. */
const PROP_BOXES: Partial<Record<PropKind, Box>> = {
  dais: { x0: -1.5, x1: 1.5, y0: -1.35, y1: 0 },
};

/** Corners of a disc's polygon. */
const DISC_CORNERS = 8;

function discCorners(x: number, y: number, radius: number): CellPoint[] {
  return Array.from({ length: DISC_CORNERS }, (_, k) => {
    const angle = Math.PI / DISC_CORNERS + (k * Math.PI * 2) / DISC_CORNERS;
    return { x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius };
  });
}

/** How far a wall piece's box reaches either side of its wall line, in cells. */
const WALL_PIECE_HALF_DEPTH = 0.15;

/** A piece's box in its own frame: drawn as its kind draws it, or its cells (stretched where it is), or none for a disc. */
function boxOf(prop: DungeonProp): Box | undefined {
  const drawn = PROP_BOXES[prop.kind];
  if (drawn) return drawn;
  const spec = PROP_SPECS[prop.kind];
  if (!isCellPiece(spec)) return undefined;
  const { along, out } = prop.size ?? spec.footprint;
  const half = spec.wallPiece ? WALL_PIECE_HALF_DEPTH : out / 2;
  return { x0: -along / 2, x1: along / 2, y0: -half, y1: half };
}

export function propPolygon(prop: DungeonProp): CellPoint[] {
  const box = boxOf(prop);
  if (!box) return discCorners(prop.x, prop.y, propReach(prop.kind) * prop.scale);
  const cos = Math.cos(prop.rotation) * prop.scale;
  const sin = Math.sin(prop.rotation) * prop.scale;
  const corners: [number, number][] = [[box.x0, box.y0], [box.x1, box.y0], [box.x1, box.y1], [box.x0, box.y1]];
  return corners.map(([x, y]) => ({ x: prop.x + x * cos - y * sin, y: prop.y + x * sin + y * cos }));
}

function propDrafts(props: readonly DungeonProp[]): Draft[] {
  return props.map(prop => withTerrain(
    { polygon: propPolygon(prop), name: t(`dungeonProp.name.${propKey(prop.kind)}` as MessageKey) },
    terrainOf({ cover: PROP_SPECS[prop.kind].cover }),
  ));
}

function columnDrafts(columns: readonly DungeonColumn[]): Draft[] {
  return columns.map(column => {
    const { x, y, radius: r } = column;
    const polygon = column.square ? [{ x: x - r, y: y - r }, { x: x + r, y: y - r }, { x: x + r, y: y + r }, { x: x - r, y: y + r }] : discCorners(x, y, r);
    return column.shattered
      ? { polygon, name: t('dungeonScene.feature.brokenColumn'), terrain: { cover: 'half' } }
      : { polygon, name: t('dungeonScene.feature.column'), terrain: { cover: 'total' } };
  });
}

/** A Forest's lone trees, by their crowns: cover from their trunks, three quarters behind a thick one. */
function treeDrafts(trees: readonly LoneTree[]): Draft[] {
  return trees.map(tree => ({ polygon: discCorners(tree.x, tree.y, tree.radius), name: t('dungeonScene.feature.tree'), terrain: { cover: tree.thick ? 'three-quarters' : 'half' } }));
}

/**
 * A Forest's rivers and lakes where they reach into the clearings: the water difficult ground stretch by
 * stretch (a river is waded; a feature holds `MAX_FEATURE_CORNERS`, which a river's whole course
 * would not keep to its banks), and each road's bridge a feature of its own, taken out of the water,
 * so whoever crosses on it crosses dry. Islands stay in the water: a feature has no holes.
 */
function riverDrafts(dungeon: VisibleDungeon): Draft[] {
  const rivers = dungeon.floor.rivers ?? [];
  if (!rivers.length) return [];
  const decks = rivers.flatMap(river => river.bridges.map(deckOf));
  // The rivers within the clearings, clipped once; each stretch then only meets that.
  const played = subtractRings(intersectRings(floorWater(rivers, dungeon.floor.lakes), floorRingsOf(dungeon)), decks);
  const bridges = decks.map((polygon): Draft => ({ polygon, name: t('dungeonScene.feature.riverBridge') }));
  if (!played.length) return bridges;
  const reach = pointsBounds(played.flat());
  const water = waterStretches(rivers, dungeon.floor.lakes)
    .filter(({ rings }) => { const b = pointsBounds(rings.flat()); return b.minX <= reach.maxX && reach.minX <= b.maxX && b.minY <= reach.maxY && reach.minY <= b.maxY; })
    .flatMap(({ rings, flow }) => intersectRings(rings, played)
      .filter(ring => signedArea2(ring) > 0.1)
      .map((ring): Draft => ({ polygon: fitCorners([ring], MAX_FEATURE_CORNERS)[0]!, name: t(flow ? 'dungeonScene.feature.river' : 'dungeonScene.feature.lake'), terrain: { difficult: true } })));
  return [...water, ...bridges];
}

/**
 * The map features of one floor as shown, in world px on `level` (unset in a scene of one floor),
 * with ids beginning `id`: the first `MAX_MAP_FEATURES` of its terrain, a Forest's rivers and
 * bridges, props (where the view shows them), columns and lone trees, in that order, and under them as much vegetation as fits. Only rooms
 * the view shows have any. No feature names what a room was built for.
 */
export function floorFeatures(dungeon: VisibleDungeon, view: Pick<DungeonView, 'props'>, placement: DungeonPlacement, id: string, level?: string): Record<string, MapFeature> {
  const { floor, roomShapes, field } = dungeon;
  const shown = floor.terrain.filter(piece => roomShapes.has(piece.room));
  const solid = [
    ...terrainDrafts(shown),
    ...riverDrafts(dungeon),
    ...parapetDrafts(shown, cell => field.distance(cell.x + 0.5, cell.y + 0.5) < 0),
    ...(view.props ? propDrafts(propsAsDrawn(dungeon).filter(prop => roomShapes.has(prop.room))) : []),
    ...columnDrafts(floor.columns.filter(column => field.distance(column.x, column.y) < 0)),
    ...treeDrafts(loneTrees(dungeon)),
  ].slice(0, MAX_MAP_FEATURES);
  // Vegetation lies under everything and takes what room the rest leaves.
  const growth = growthDrafts(floor.growth.filter(g => roomShapes.has(g.room))).slice(0, MAX_MAP_FEATURES - solid.length);
  const drafts = [...growth, ...solid];
  const { originCell, pxPerCell } = placement;
  const world = (p: CellPoint): CellPoint => ({ x: (p.x - originCell.x) * pxPerCell, y: (p.y - originCell.y) * pxPerCell });
  return Object.fromEntries(drafts.map((draft, index): [string, MapFeature] => {
    const featureId = `${id}_${index + 1}`;
    return [featureId, { id: featureId, kind: 'map-feature', ...draft, polygon: draft.polygon.map(world), ...(level && { level }) }];
  }));
}
