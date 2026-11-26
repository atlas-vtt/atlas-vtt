import { diceSourceOf } from './atlasDice.ts';
import { lightingSourceOf } from './atlasLighting.ts';
import { mapLayerSourceOf, pictureBasisOf, showsViewedLevel } from './atlasMapLayers.ts';
import { asTokenSource, call, drawnTokenPlaces, tokenRulesOf } from './atlasView.ts';
import { bumpOnTab } from './doors/doorAskDesk.ts';
import { dragRulerOf } from './dragRulers.ts';
import { rendererShows, type GmTab } from './floorSource.ts';
import type { GmMarks } from './gmMarks.ts';
import { tokenMovesOf } from './moveShare.ts';
import type { AtlasTab } from './sharedTab.ts';

/**
 * The GM's shared tab read through its renderer and view: the floor its view shows, the map's rules, the GM's
 * marks (`marks`) and the players' marks drawn on its canvas, each read anew at its call. The binding hands it
 * out only while the tab shows the presented scene, so nothing here asks whether it may read.
 */
export function gmTabOf(tab: AtlasTab, marks: Pick<GmMarks, 'source' | 'showPlayers' | 'showPlayerDrags' | 'showPlayerCursors' | 'showPlayerStrokes'>): GmTab {
  const { leaf, view, store, renderer } = tab;
  const tokens = (): unknown => call(renderer, 'getTokenRenderer');
  const gm: GmTab = {
    tokenSource: () => asTokenSource(renderer),
    mapLayers: () => mapLayerSourceOf(renderer, view),
    basis: () => pictureBasisOf(renderer),
    followsSight: true,
    gmMarks: () => marks.source(),
    gmDragRuler: () => dragRulerOf(tokens()),
    drawnPlaces: (tokenIds) => drawnTokenPlaces(tokens(), tokenIds),
    showPlayerMarks: (shown) => marks.showPlayers(shown),
    showPlayerDrags: (drags) => marks.showPlayerDrags(drags),
    showPlayerCursors: (cursors) => marks.showPlayerCursors(cursors),
    showPlayerStrokes: (strokes) => marks.showPlayerStrokes(strokes),
    lightingSource: () => lightingSourceOf(renderer),
    tokenRules: () => tokenRulesOf(tokens()),
    tokenMoves: () => tokenMovesOf(tokens()),
    dice: () => diceSourceOf(leaf),
    bumpToken: (tokenId, dx, dy) => bumpOnTab(tokens(), tokenId, dx, dy),
    sourceOf: (floor, cpu) => (rendererShows(store.getState(), floor, () => showsViewedLevel(renderer, store.getState())) ? gm : cpu),
  };
  return gm;
}
