import { scaleInWindow } from './assetVariants.ts';
import type { MeasureRules } from '../marks/index.ts';
import { type App } from 'obsidian';
import type { GridGeometry } from '../../grid/gridDistance';
import { resolveMeasurementSettings } from '../../grid/measurementFormat';
import { diceSourceOf } from './atlasDice.ts';
import { accentColour, atlasPlayerSettings, lightingSourceOf, measurementOf } from './atlasLighting.ts';
import { mapLayerSourceOf, rulesLookupOf } from './atlasMapLayers.ts';
import { asTokenSource, call, drawnTokenPlaces, tokenRulesOf, type SceneStore } from './atlasView.ts';
import { bookSceneOf, type BookScene } from './book/bookScene.ts';
import { ResourceWrites } from './book/resourceWrites.ts';
import { companionTimers } from './companionTimers.ts';
import { dragRulerOf } from './dragRulers.ts';
import { GmMarks } from './gmMarks.ts';
import type { GmMessage, RollRequestAnswer } from '../protocol/index.ts';
import type { LoggedRoll, RollRequest } from './log/TableLog.ts';
import { ownerIn, type SeatSource } from './seatSource.ts';
import type { PresentedTab } from './presentedScene.ts';
import { PresentedStore } from './presentedStore.ts';
import { SceneShare } from './SceneShare.ts';
import type { AtlasTab, TabBinding } from './sharedTab.ts';
import type { VaultImage } from './TokenShare.ts';
import { showNotice } from '../../ui/notice';

/** A shared view's scene and the GM's marks on it. */
export interface SceneBinding extends TabBinding {
  readonly share: SceneShare;
  /** The view's store as players may see it: frozen on the presented scene while the GM works on another tab. */
  readonly store: SceneStore;
  /** The scene as the players' books read it; null while it is not shown, loads or cannot be read. */
  book(): BookScene | null;
  /** Players' edits of their characters' resources on this scene. */
  readonly resources: ResourceWrites;
}

export interface SceneBindingPorts {
  readonly app: App;
  readonly seats: SeatSource;
  send(body: GmMessage, to?: string): void;
  /** Sends a live message to all ahead of other frames; a newer one of the same key replaces it while it waits. */
  sendLive(body: GmMessage, key: string): void;
  readImage(path: string): Promise<VaultImage | null>;
  /** Whether the binding is still the table's and its tab the same objects. */
  isLive(binding: SceneBinding): boolean;
  randomId(): string;
  /** Takes a roll of the shared tab into the table's log. */
  logRoll(roll: LoggedRoll): void;
  /** The name a player goes by at the table, or null when it is not known. */
  nameOf(player: string): string | null;
  /** The vault path of a speaker's artwork the table's log shows, by hash. */
  logArt(hash: string): string | undefined;
  /** The roll button of the table's log a player's roll answers, as they may roll it. */
  rollRequest(from: string, answer: RollRequestAnswer): RollRequest | null;
  /** The entry of the table's log that tells who found a readable pin of a map, or null while nobody has. */
  foundPin(mapPath: string, pinId: string): string | null;
}

/** The last value a read gave while `shown`, given again while not: what players were last sent stays as it was. */
function lastWhileShown<T>(shown: () => boolean, read: () => T | null): () => T | null {
  let last: T | null = null;
  return () => (shown() ? (last = read()) : last);
}

/**
 * What shares a view showing the scene Atlas presents: its scene and the GM's marks, reading only that
 * view's store and renderer, and only while they are still the same objects. While the GM works on
 * another scene tab of the view (`PresentedStore` holds), nothing of the view's renderer is read, the
 * GM's marks and rolls are not taken from it, and players' moves and rolls are refused, since
 * Atlas has the presented scene loaded nowhere; players keep the picture they had.
 */
export function bindScene(ports: SceneBindingPorts, tab: AtlasTab, presented: PresentedTab): SceneBinding {
  const { leaf, renderer } = tab;
  const timers = companionTimers();
  const live = (): boolean => ports.isLive(binding);
  const shown = (): boolean => live() && !store.held;
  const shownRenderer = (): unknown => (shown() ? renderer : null);
  const measurement = lastWhileShown(shown, () => measurementOf(renderer) ?? lightingSourceOf(renderer)?.measurement() ?? null);
  const liveRenderer = (): unknown => (live() ? renderer : null);
  const marks = new GmMarks(ports.app, liveRenderer, tab.store, () => {
    const grid = call(liveRenderer(), 'getGridOptions') as GridGeometry | null | undefined;
    return grid === null || grid === undefined ? null : { grid, measurement: measurement() ?? resolveMeasurementSettings(undefined, tab.store.getState().grid) } satisfies MeasureRules;
  });
  // Players' marks leave the GM's canvas as the hold begins: it is about to show another scene.
  const store = new PresentedStore(tab.store, presented, () => {
    if (!live()) return;
    marks.showPlayers({ lasers: [], measures: [] });
    marks.showPlayerDrags([]);
    marks.showPlayerCursors([]);
  });
  const share = new SceneShare(store, {
    tokenSource: () => asTokenSource(shownRenderer()),
    lightingSource: () => lightingSourceOf(shownRenderer()),
    measurement,
    gmMarks: () => (shown() ? marks.source() : null),
    showPlayerMarks: (marksShown) => shown() && marks.showPlayers(marksShown),
    showPlayerDrags: (drags) => shown() && marks.showPlayerDrags(drags),
    gmDragRuler: () => dragRulerOf(shownRenderer()),
    showPlayerCursors: (cursors) => shown() && marks.showPlayerCursors(cursors),
    nameOf: (player) => ports.nameOf(player),
    accent: lastWhileShown(shown, () => accentColour(leaf.view.containerEl.ownerDocument)),
    atlasSettings: () => atlasPlayerSettings(ports.app),
    dice: () => (shown() ? diceSourceOf(leaf) : null),
    mapLayers: () => (shown() ? mapLayerSourceOf(renderer, leaf.view) : null),
    showNames: () => atlasPlayerSettings(ports.app).showNames,
    tokenRules: () => tokenRulesOf(shownRenderer()),
    readImage: (path) => ports.readImage(path),
    scaleImage: scaleInWindow,
    send: (body, to) => live() && ports.send(body, to),
    sendLive: (body, key) => live() && ports.sendLive(body, key),
    drawnPlaces: (tokenIds) => drawnTokenPlaces(shownRenderer(), tokenIds),
    notice: (text) => live() && showNotice(text),
    seats: ports.seats,
    randomId: () => ports.randomId(),
    logRoll: (roll) => live() && ports.logRoll(roll),
    logArt: (hash) => ports.logArt(hash),
    foundPin: (mapPath, pinId) => ports.foundPin(mapPath, pinId),
    rollRequest: (from, answer) => (shown() ? ports.rollRequest(from, answer) : null),
    now: () => timers.now(),
    setTimer: (run, ms) => timers.setTimer(() => live() && run(), ms),
    clearTimer: (timer) => timers.clearTimer(timer),
  });
  const resources = new ResourceWrites(store, {
    definitions: () => tokenRulesOf(shownRenderer())?.resources ?? [],
    ownerOf: ownerIn(ports.seats, store),
    now: () => timers.now(),
    setTimer: (run, ms) => timers.setTimer(() => live() && run(), ms),
    clearTimer: (timer) => timers.clearTimer(timer),
  });
  const binding: SceneBinding = {
    share,
    store,
    resources,
    book: () => (shown() ? bookSceneOf(store.getState(), asTokenSource(renderer), tokenRulesOf(renderer), rulesLookupOf(leaf.view), (scene, alias) => share.listedToken(scene, alias)) : null),
    get showing() {
      return !store.held;
    },
    present: (next) => store.present(next),
    start: () => {
      share.start();
      resources.start();
    },
    stop: () => {
      resources.stop();
      share.stop();
      store.dispose();
      marks.dispose();
    },
  };
  return binding;
}
