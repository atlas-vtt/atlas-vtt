import type { MeasureRules } from '../marks/index.ts';
import { type App } from 'obsidian';
import type { GridGeometry } from '../../grid/gridDistance';
import { resolveMeasurementSettings } from '../../grid/measurementFormat';
import { levelObjects } from '../../levels/levelObjects';
import { difficultCells } from '../../mapFeatures/featureIndex';
import { mapFeatureList } from '../../mapFeatures/mapFeatures';
import { accentColour, lightingSourceOf, measurementOf, tabAreaMap } from './atlasLighting.ts';
import { call, type PlayerTokenSource, type SceneStore } from './atlasView.ts';
import { bookSceneOf, type BookScene } from './book/bookScene.ts';
import { ResourceWrites } from './book/resourceWrites.ts';
import { companionTimers } from './companionTimers.ts';
import { decodeMaskAlpha } from './exploredMaskAlpha.ts';
import { clearPlayerMarks, HELD_TAB, type GmTab } from './floorSource.ts';
import { GmMarks } from './gmMarks.ts';
import { gmTabOf } from './gmTab.ts';
import type { GmMessage, RollRequestAnswer } from '../protocol/index.ts';
import type { LoggedRoll, RollRequest } from './log/TableLog.ts';
import { ownerIn, type SeatSource } from './seatSource.ts';
import type { PresentedTab } from './presentedScene.ts';
import { PresentedStore } from './presentedStore.ts';
import { SceneShare } from './SceneShare.ts';
import { SceneSignal } from './sceneSignal.ts';
import { sceneSources } from './sceneSources.ts';
import type { AtlasTab, TabBinding } from './sharedTab.ts';
import type { VaultImage } from './TokenShare.ts';
import type { AssetStoring } from './assets/assetUses.ts';
import type { MemoryPorts } from './memory/memoryPorts.ts';
import { pixiRendererOf, TextureRasters } from './memory/TextureRasters.ts';
import { showNotice } from '../../ui/notice';
import { showDoorAsk } from './doors/doorAskDesk.ts';
import type { PageCovers } from './coveredPages.ts';
import type { NotePin } from '../../types';

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
  sendLive(body: GmMessage, key: string, to?: string): void;
  /** The pages live marks leave out (their book covers the map). */
  readonly covers?: PageCovers | undefined;
  readImage(path: string): Promise<VaultImage | null>;
  /** How players are handed assets the store keeps for them; without it they are handed none. */
  readonly stored?: AssetStoring | undefined;
  /** Where players' own explored memories are kept; the tab's renderer stamps them. Without it a player remembers only what their page saw. */
  readonly memory?: Omit<MemoryPorts, 'rasters'> | undefined;
  /** Whether the binding is still the table's and its tab the same objects. */
  isLive(binding: SceneBinding): boolean;
  randomId(): string;
  /** Takes a roll of the shared tab into the table's log. */
  logRoll(roll: LoggedRoll): void;
  /** The name a player goes by at the table, or null when it is not known. */
  nameOf(player: string): string | null;
  /** The roll button of the table's log a player's roll answers, as they may roll it. */
  rollRequest(from: string, answer: RollRequestAnswer): RollRequest | null;
  /** The entry of the table's log that tells who found a readable pin of a map, or null while nobody has. */
  foundPin(mapPath: string, pinId: string): string | null;
  /** The shared map's pins whenever the GM changed them, so found pins can follow the notes they link now. */
  pinsChanged(mapPath: string, pins: Readonly<Record<string, NotePin>>): void;
}

/** The renderer as the books' token source, the tokens the players see read on each token's own floor. */
function floorsSeen(share: SceneShare, source: PlayerTokenSource | null): PlayerTokenSource | null {
  if (source === null) return null;
  return { playerRollTokens: (mapPath, tokenIds) => share.shown(mapPath, tokenIds ?? []), getGridOptions: () => source.getGridOptions() };
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
  const measurement = lastWhileShown(shown, () => measurementOf(renderer) ?? lightingSourceOf(renderer)?.measurement() ?? null);
  const liveRenderer = (): unknown => (live() ? renderer : null);
  const rasters = new TextureRasters(() => pixiRendererOf(liveRenderer()));
  const marks: GmMarks = new GmMarks(ports.app, liveRenderer, tab.store, () => {
    const grid = call(liveRenderer(), 'getGridOptions') as GridGeometry | null | undefined;
    if (grid === null || grid === undefined) return null;
    const state = tab.store.getState();
    const difficult = difficultCells(mapFeatureList(levelObjects(state).mapFeatures));
    // The areas players measure stop at the walls the GM's own do.
    return { grid, measurement: measurement() ?? resolveMeasurementSettings(undefined, state.grid), difficult, areas: tabAreaMap(liveRenderer()) } satisfies MeasureRules;
  }, (tokenId): string | undefined => share.draggerOf(tokenId));
  const gm = gmTabOf(tab, marks);
  // Players' marks leave the GM's canvas as the hold begins: it is about to show another scene.
  const store = new PresentedStore(tab.store, presented, () => live() && clearPlayerMarks(gm));
  // The one place that decides whether the view may be read: every floor reads as nothing while the scene is held.
  const shownTab = (): GmTab => (shown() ? gm : HELD_TAB);
  // A stale binding's timers run nothing.
  const clock = {
    now: () => timers.now(),
    setTimer: (run: () => void, ms: number) => timers.setTimer(() => live() && run(), ms),
    clearTimer: (timer: number) => timers.clearTimer(timer),
  };
  // The theme is read once at each change of it, not with every message that carries the accent.
  const signal = new SceneSignal(sceneSources(ports.app, store, renderer, lastWhileShown(shown, () => accentColour(leaf.view.containerEl.ownerDocument))));
  const share: SceneShare = new SceneShare(store, signal, {
    tab: shownTab,
    measurement,
    nameOf: (player) => ports.nameOf(player),
    atlas: () => signal.inputs.atlas,
    readImage: (path) => ports.readImage(path),
    decodeMask: decodeMaskAlpha,
    playerMemory: ports.memory === undefined ? undefined : { ...ports.memory, rasters },
    stored: ports.stored,
    send: (body, to) => live() && ports.send(body, to),
    sendLive: (body, key, to) => live() && ports.sendLive(body, key, to),
    covers: ports.covers,
    notice: (text) => live() && showNotice(text),
    seats: ports.seats,
    randomId: () => ports.randomId(),
    logRoll: (roll) => live() && ports.logRoll(roll),
    foundPin: (mapPath, pinId) => ports.foundPin(mapPath, pinId),
    pinsChanged: (mapPath, pins) => live() && ports.pinsChanged(mapPath, pins),
    presentedLevel: () => store.presentedLevel,
    rollRequest: (from, answer) => (shown() ? ports.rollRequest(from, answer) : null),
    askDoor: (asked) => (live() ? showDoorAsk({ app: ports.app, leaf, view: tab.view, renderer, store: tab.store, presented: store }, asked) : () => undefined),
    ...clock,
  });
  const resources = new ResourceWrites(store, {
    definitions: () => shownTab().tokenRules()?.resources ?? [],
    ownerOf: ownerIn(ports.seats, store),
    ...clock,
  });
  const binding: SceneBinding = {
    share,
    store,
    resources,
    book: () => (shown() ? bookSceneOf(store.getState(), floorsSeen(share, gm.tokenSource()), gm.tokenRules(), gm.mapLayers()?.rules() ?? null, (scene, alias) => share.listedToken(scene, alias)) : null),
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
      rasters.dispose();
    },
  };
  return binding;
}
