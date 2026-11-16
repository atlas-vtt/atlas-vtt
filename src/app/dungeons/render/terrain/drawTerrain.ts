import type { DungeonTerrain, TerrainKind } from '../../model';
import { HOLE_KINDS } from '../../terrain/catalog';
import type { Hand } from '../art/hand';
import { onCaveFloor } from '../cave/caveArt';
import { UNDERGROWTH } from '../growth/growthForms';
import { drawAven } from './aven';
import { drawBridges } from './bridges';
import { drawBoneLitter, drawGuano, drawSulphurCrust } from './caveStains';
import { drawBoulderChoke, drawRimstone } from './caveStones';
import { drawLowWall, drawRubbleHeap } from './cover';
import { drawBrokenFloor, drawMosaic, drawScatter } from './ground';
import { drawChannel, drawDeepWater, drawPit } from './hazards';
import { drawHoles } from './holes';
import { drawPool, drawPortalRing } from './interest';
import { shownPieces } from './pieces';
import { drawRaised } from './raised';
import { drawCaveTerrace } from './caveTerrace';
import { openingAbove } from '../vertical/openings';
import { drawOverhead } from '../vertical/overhead';
import { raggedGround } from './scatterPatch';
import { drawObelisk, drawPillar, drawStatue, drawWallFragment } from './tall';

/**
 * Every kind of terrain, drawn once for every look through its direction's hand, in four layers:
 * what lies on or in the floor and raised floors before light and shade, what stands after them,
 * holes and their bridges last.
 */

type Draw = (hand: Hand, piece: DungeonTerrain, colours: TerrainColours) => void;

/** The colours a hand cannot work out alone: what water and cloth look like in the look. */
export interface TerrainColours {
  water: string;
  cloth: string;
}

const GROUND: Partial<Record<TerrainKind, Draw>> = {
  guano: drawGuano,
  'bone-litter': drawBoneLitter,
  'sulphur-crust': drawSulphurCrust,
  rimstone: drawRimstone,
  'boulder-choke': drawBoulderChoke,
  // On a cave's floor the field is one ragged patch; on a built floor it keeps its whole cells.
  'rubble-field': (hand, piece) => drawScatter(hand, piece, 0.05, 15, onCaveFloor(hand.scene.env) ? raggedGround(hand.scene, piece) : undefined),
  'chasm-floor': drawChasmFloor,
  'broken-floor': drawBrokenFloor,
  mosaic: drawMosaic,
  pit: drawPit,
  'deep-water': drawDeepWater,
  channel: drawChannel,
  aven: drawAven,
};

/** On a cave's floor a raised floor is a terrace in the rock, its edge drawn where it steps down; elsewhere a dressed platform. */
const drawRaisedFloor: Draw = (hand, piece) => (onCaveFloor(hand.scene.env) ? drawCaveTerrace(hand, piece) : drawRaised(hand, piece));

const RAISED: Partial<Record<TerrainKind, Draw>> = { platform: drawRaisedFloor, ledge: drawRaisedFloor };

const STANDING: Partial<Record<TerrainKind, Draw>> = {
  'low-wall': drawLowWall,
  'rubble-heap': drawRubbleHeap,
  pillar: drawPillar,
  statue: (hand, piece, colours) => drawStatue(hand, piece, colours.water, colours.cloth),
  'wall-fragment': drawWallFragment,
  obelisk: drawObelisk,
  pool: drawPool,
  'portal-ring': drawPortalRing,
};

/** The floor under a hole above: what fell, and on a cave's floor the hole's outline overhead, dashed. */
function drawChasmFloor(hand: Hand, piece: DungeonTerrain): void {
  drawScatter(hand, piece, 0.075, 9);
  if (!onCaveFloor(hand.scene.env)) return;
  for (const ring of openingAbove(hand.scene.env, piece)) drawOverhead(hand, ring, { seed: piece.id, narrows: false, under: 'none' });
}

/** Kinds drawn outside these tables: holes (`holes.ts`), bridges (`bridges.ts`), undergrowth (`growthForms.ts`) and shallow water, which the water draws. */
const DRAWN_ELSEWHERE: readonly TerrainKind[] = [...HOLE_KINDS, 'bridge', ...UNDERGROWTH, 'shallow-water'];

/** Every terrain kind with a drawing. */
export function drawnTerrainKinds(): TerrainKind[] {
  return [...new Set([...Object.keys(GROUND), ...Object.keys(RAISED), ...Object.keys(STANDING), ...DRAWN_ELSEWHERE] as TerrainKind[])];
}

function drawLayer(hand: Hand, table: Partial<Record<TerrainKind, Draw>>, colours: TerrainColours): void {
  for (const piece of shownPieces(hand.scene.env)) table[piece.kind]?.(hand, piece, colours);
}

export function drawTerrainGround(hand: Hand, colours: TerrainColours): void {
  drawLayer(hand, GROUND, colours);
  drawLayer(hand, RAISED, colours);
}

export function drawTerrainStanding(hand: Hand, colours: TerrainColours): void {
  drawLayer(hand, STANDING, colours);
}

export function drawTerrainOpenings(hand: Hand): void {
  drawHoles(hand);
  drawBridges(hand);
}
