import { diceSourceOf } from './atlasDice.ts';
import { mapLayerSourceOf, pictureBasisOf, showsViewedLevel } from './atlasMapLayers.ts';
import { rendererShows, type GmTab } from './floorSource.ts';
import type { GmMarks } from './gmMarks.ts';
import type { MapTokens } from './mapView.ts';
import type { AtlasTab } from './sharedTab.ts';
import type { TokenRules } from './tokenUI.ts';

type Place = { readonly x: number; readonly y: number };

/**
 * The GM's shared tab read through its canvas and view: the floor its view shows, the map's rules, the GM's
 * marks (`marks`) and the players' marks drawn on its canvas, each read anew at its call. The binding hands it
 * out only while the tab shows the presented scene, so nothing here asks whether it may read.
 */
export function gmTabOf(tab: AtlasTab, marks: Pick<GmMarks, 'source' | 'showPlayers' | 'showPlayerDrags' | 'showPlayerCursors' | 'showPlayerStrokes'>): GmTab {
  const { view, store, renderer } = tab;
  const tokens = (): MapTokens | null => renderer.getTokenRenderer();
  const gm: GmTab = {
    tokenSource: () => renderer,
    mapLayers: () => mapLayerSourceOf(renderer, view),
    basis: () => pictureBasisOf(renderer),
    followsSight: true,
    gmMarks: () => marks.source(),
    gmDragRuler: () => tokens()?.dragRulerPath() ?? null,
    // During the GM's own drag Atlas moves the sprites with every pointer move but writes the store only every 50 ms.
    drawnPlaces: (tokenIds) => drawnPlaces(tokens()?.getTokenSprites() ?? {}, tokenIds),
    showPlayerMarks: (shown) => marks.showPlayers(shown),
    showPlayerDrags: (drags) => marks.showPlayerDrags(drags),
    showPlayerCursors: (cursors) => marks.showPlayerCursors(cursors),
    showPlayerStrokes: (strokes) => marks.showPlayerStrokes(strokes),
    lightingSource: () => renderer.getLightingController()?.sightAids ?? null,
    tokenRules: () => tokenRulesOf(tokens()?.collectionRules() ?? null),
    tokenMoves: () => tokens()?.tokenMovement() ?? null,
    dice: () => diceSourceOf(view),
    bumpToken: (tokenId, dx, dy) => tokens()?.bumpToken(tokenId, dx, dy),
    sourceOf: (floor, cpu) => (rendererShows(store.getState(), floor, () => showsViewedLevel(renderer, store.getState())) ? gm : cpu),
  };
  return gm;
}

/** Where the canvas draws each of these tokens now; tokens without a sprite, or with a place that is no number, are left out. */
function drawnPlaces(sprites: Readonly<Record<string, Place | null>>, tokenIds: readonly string[]): ReadonlyMap<string, Place> {
  const places = new Map<string, Place>();
  for (const id of tokenIds) {
    const sprite = Object.hasOwn(sprites, id) ? sprites[id] : undefined;
    if (sprite === undefined || sprite === null || !Number.isFinite(sprite.x) || !Number.isFinite(sprite.y)) continue;
    places.set(id, { x: sprite.x, y: sprite.y });
  }
  return places;
}

/** The token renderer's resource and condition definitions, or null while they cannot be read: then players get no bars and no condition badges. */
function tokenRulesOf(rules: ReturnType<MapTokens['collectionRules']> | null): TokenRules | null {
  if (rules === null) return null;
  try {
    return { resources: rules.resources(), conditions: rules.conditions() };
  } catch {
    return null;
  }
}
