import type { SharedCursor, SharedStroke } from '../protocol/index.ts';
import type { RemoteDrag } from '../marks/index.ts';
import { hasLevels, viewedLevelId, type LevelView } from '../../levels/sceneLevels';
import type { DiceSource } from './atlasDice.ts';
import type { LightingSource } from './atlasLighting.ts';
import type { MapLayerSource } from './atlasMapLayers.ts';
import type { PlayerTokenSource } from './atlasView.ts';
import type { GmRuler } from './dragRulers.ts';
import type { PartyLighting } from '../../perception/playersPerception';
import type { EyesSight, PictureBasis } from './eyesSight.ts';
import type { GmMarkSource, PlayerMarks } from './MarkShare.ts';
import type { TokenMoves } from './moveShare.ts';
import type { Floor } from './playerFloors.ts';
import type { TokenRules } from './tokenUI.ts';

type Place = { readonly x: number; readonly y: number };

/**
 * Where one floor is read: what players see of it, and the GM's canvas where that shows the floor. The GM's
 * renderer reads the floor its view shows (`gmTabOf`), the CPU works out any other (`cpuFloorSource`), and
 * nothing is read while the scene is held (`HELD_TAB`).
 */
export interface FloorSource {
  /** The party's token source: the tokens the players' frame of the floor shows, and the grid they are sized by; null while it cannot be read. */
  tokenSource(): PlayerTokenSource | null;
  /** The party's map layers of the floor: the doors, points and sensed tokens it shows, the grid, rules and presets. */
  mapLayers(): MapLayerSource | null;
  /** What each set of eyes' own picture of the floor is cut from; null cuts it from the floor worked out on the CPU. */
  basis(): PictureBasis | null;
  /** Whether the GM's renderer telling of a change of its sight changes this picture: only where the renderer is read. */
  readonly followsSight: boolean;
  /** The GM's own marks on the floor (measurements, laser, the drawing under way); null where the GM's canvas does not show it. */
  gmMarks(): GmMarkSource | null;
  /** What the GM's own drag ruler measures on the floor now, or null while it shows none. */
  gmDragRuler(): GmRuler | null;
  /** Where the GM's canvas draws these tokens now (the GM's own drag runs ahead of the store there). */
  drawnPlaces(tokenIds: readonly string[]): ReadonlyMap<string, Place>;
  /** Draws the players' lasers and measurements of the floor on the GM's canvas. */
  showPlayerMarks(marks: PlayerMarks): void;
  /** Draws the rulers of the players' drags on the floor on the GM's canvas. */
  showPlayerDrags(drags: readonly RemoteDrag[]): void;
  /** Draws the players' cursors on the floor on the GM's canvas. */
  showPlayerCursors(cursors: readonly SharedCursor[]): void;
  /** Draws the drawings players are making on the floor on the GM's canvas. */
  showPlayerStrokes(strokes: readonly SharedStroke[]): void;
}

/** The GM's shared tab as the scene reads it: the source of the floor its view shows, beside the rules every floor reads alike. */
export interface GmTab extends FloorSource {
  /** Where the GM's lighting reads its rules and measurement, or null while it cannot be read. */
  lightingSource(): LightingSource | null;
  /** The map's resource and condition definitions as the GM's token renderer reads them, or null. */
  tokenRules(): TokenRules | null;
  /** How the tab's tokens move, or null while it cannot be read. */
  tokenMoves(): TokenMoves | null;
  /** The tab's dice, or null while it has none. */
  dice(): DiceSource | null;
  /** Shows a player's token bump against a wall on the GM's map. */
  bumpToken(tokenId: string, dx: number, dy: number): void;
  /** The source `floor` is read from now: this tab, or `cpu` (the floor worked out on the CPU), or nothing while the scene is held. */
  sourceOf(floor: Floor, cpu: FloorSource): FloorSource;
}

/** The GM's canvas where it does not show a floor: none of the GM's marks, and none of the players' drawn. */
const NO_CANVAS = {
  followsSight: false,
  gmMarks: () => null,
  gmDragRuler: () => null,
  drawnPlaces: (): ReadonlyMap<string, Place> => new Map(),
  showPlayerMarks: () => undefined,
  showPlayerDrags: () => undefined,
  showPlayerCursors: () => undefined,
  showPlayerStrokes: () => undefined,
} satisfies Omit<FloorSource, 'tokenSource' | 'mapLayers' | 'basis'>;

/** The tab while the GM works on another scene of the view: nothing of it is read, and every floor reads as nothing. */
export const HELD_TAB: GmTab = {
  ...NO_CANVAS,
  tokenSource: () => null,
  mapLayers: () => null,
  basis: () => null,
  lightingSource: () => null,
  tokenRules: () => null,
  tokenMoves: () => null,
  dice: () => null,
  bumpToken: () => undefined,
  sourceOf: () => HELD_TAB,
};

/** Takes every player's marks, drag rulers, cursors and drawings under way off the GM's canvas. */
export function clearPlayerMarks(canvas: FloorSource): void {
  canvas.showPlayerMarks({ lasers: [], measures: [] });
  canvas.showPlayerDrags([]);
  canvas.showPlayerCursors([]);
  canvas.showPlayerStrokes([]);
}

/**
 * Whether the GM's renderer is `floor`'s picture: always in a scene of one floor, else for the floor its view
 * shows once it has drawn that floor (`drawn`), since after a switch of levels its map image and sight take a moment.
 */
export function rendererShows(state: LevelView, floor: Floor, drawn: () => boolean): boolean {
  return !hasLevels(state.levels) || (viewedLevelId(state) === floor && drawn());
}

/** A picture's token source, map layers and sight, as one set of eyes reads them. */
export interface PictureSources {
  tokenSource(): PlayerTokenSource | null;
  mapLayers(): MapLayerSource | null;
  /** What the eyes see of the floor now, which their memory records; null while it cannot be worked out. */
  seen(): PartyLighting | null;
}

/** The picture `eyes` see, cut from `basis` at each read, sized by the tab's grid and given the tab's map layers. */
export function eyesPicture(eyes: EyesSight, basis: () => PictureBasis, tab: () => GmTab): PictureSources {
  return {
    tokenSource: () => {
      const grid = tab().tokenSource();
      return grid === null ? null : eyes.tokens(basis(), grid);
    },
    mapLayers: () => {
      const base = tab().mapLayers();
      return base === null ? null : eyes.layers(basis(), base);
    },
    seen: () => eyes.seen(basis()),
  };
}

/** A floor the GM's view does not show: the party's picture of it worked out on the CPU from `sight`, and no canvas of the GM's. */
export function cpuFloorSource(sight: PictureBasis, party: PictureSources): FloorSource {
  return { ...NO_CANVAS, tokenSource: () => party.tokenSource(), mapLayers: () => party.mapLayers(), basis: () => sight };
}

/** What a floor's shares read by name: the floor's picture and canvas, and the tab's rules. */
export type FloorReads = Omit<GmTab, 'basis' | 'followsSight' | 'sourceOf'>;

/** `FloorReads` made at each call: the picture and canvas from the source `source` names then, the rules from `tab`. */
export function floorReads(source: () => FloorSource, tab: () => GmTab): FloorReads {
  return {
    tokenSource: () => source().tokenSource(),
    mapLayers: () => source().mapLayers(),
    gmMarks: () => source().gmMarks(),
    gmDragRuler: () => source().gmDragRuler(),
    drawnPlaces: (tokenIds) => source().drawnPlaces(tokenIds),
    showPlayerMarks: (marks) => source().showPlayerMarks(marks),
    showPlayerDrags: (drags) => source().showPlayerDrags(drags),
    showPlayerCursors: (cursors) => source().showPlayerCursors(cursors),
    showPlayerStrokes: (strokes) => source().showPlayerStrokes(strokes),
    lightingSource: () => tab().lightingSource(),
    tokenRules: () => tab().tokenRules(),
    tokenMoves: () => tab().tokenMoves(),
    dice: () => tab().dice(),
    bumpToken: (tokenId, dx, dy) => tab().bumpToken(tokenId, dx, dy),
  };
}
