/**
 * Writes a remote view's scene (`RemoteSceneInput`, as `checkedScene` took it) into its store. A
 * record is copied (deep, frozen) only when the extension hands a different object for it, a value
 * equal to the one shown keeps its copy, and a store field is written only when it changed, so
 * Atlas's renderers redraw what a local edit would make them redraw and the extension keeps no
 * reference into the store. Writing the scene again (after a drag) reads only those copies, never
 * the extension's objects. Writes are untracked: the remote store records no history anyway.
 */
import type { StoreApi } from 'zustand';
import type { RemoteSceneInput } from '../../api/types/remoteViews';
import { frozenCopy } from '../../api/frozen';
import { sameValue } from '../utils/sameValue';
import { isFogTooLarge, isRemoteImageUrl } from './remoteInput';
import type { ViewAtlasState } from '../storeFactory';
import { runUntracked } from '../stores/history';
import type { DrawingStroke, TextElement, TokenEntity } from '../types';
import type { FogOperation } from '../types/fogTypes';
import type { GridState } from '../types/gridTypes';
import type { InitiativeState } from '../types/initiativeTypes';
import type { WidgetSettings } from '../types/widgetTypes';

type RemoteStore = Pick<StoreApi<ViewAtlasState>, 'getState' | 'setState'>;

/** The grid of a scene that has none: hidden, and nothing snaps; tokens keep Atlas's default cell size. */
const NO_GRID: GridState = Object.freeze({ enabled: true, visible: false, snapToGrid: false, type: 'square', size: 70, offsetX: 0, offsetY: 0, opacity: 0 });

/** `id` as an own property, also for ids such as "__proto__". */
function setOwn<T>(target: Record<string, T>, id: string, value: T): void {
  Object.defineProperty(target, id, { value, enumerable: true, writable: true, configurable: true });
}

interface Entry<S, A> { source: S; input: string; record: A }

/**
 * Copies by id, kept while the extension's record and its inputs stay the same, or while a record handed as a new object
 * is equal by value to the one shown; the same result object while nothing changed.
 */
class RecordMemo<S, A> {
  private entries = new Map<string, Entry<S, A>>();
  private result: Record<string, A> = Object.freeze({});

  build(records: Readonly<Record<string, S>>, input: (id: string) => string, convert: (id: string, source: S) => A): Record<string, A> {
    const next = new Map<string, Entry<S, A>>();
    let changed = Object.keys(records).length !== this.entries.size;
    for (const [id, source] of Object.entries(records)) {
      const key = input(id);
      const previous = this.entries.get(id);
      if (previous && previous.source === source && previous.input === key) {
        next.set(id, previous);
        continue;
      }
      const record = convert(id, source);
      // Equal by value (an owner that builds its records anew each time): keep the copy shown, so nothing redraws.
      if (previous && previous.input === key && sameValue(record, previous.record)) {
        next.set(id, { source, input: key, record: previous.record });
        continue;
      }
      changed = true;
      next.set(id, { source, input: key, record });
    }
    this.entries = next;
    if (changed) {
      const result: Record<string, A> = {};
      for (const [id, entry] of next) setOwn(result, id, entry.record);
      this.result = Object.freeze(result);
    }
    return this.result;
  }
}

/** A frozen copy of one value, made again only when the extension hands a different object that differs in value. */
class KeptCopy<T> {
  private source: T | undefined;
  private copy: T | undefined;

  constructor(private readonly convert: (source: T) => T = frozenCopy) {}

  of(source: T): T {
    if (this.copy === undefined || source !== this.source) {
      this.source = source;
      const copy = this.convert(source);
      if (this.copy === undefined || !sameValue(copy, this.copy)) this.copy = copy;
    }
    return this.copy;
  }
}

/** A remote token's links into a vault are not this vault's: the view never reads the player's own notes by them. */
function withoutVaultLinks(token: TokenEntity): TokenEntity {
  const { notePath: _note, statblockPath: _statblock, ...rest } = token as TokenEntity & { notePath?: string; statblockPath?: string };
  return rest;
}

/** The initiative list without links into the owner's vault: an avatar shows only from an image URL, and no statblock opens. */
function initiativeWithoutVaultLinks(initiative: InitiativeState): InitiativeState {
  const entries = initiative.entries.map(({ statblockPath: _statblock, ...entry }) => ({ ...entry, imagePath: isRemoteImageUrl(entry.imagePath) ? entry.imagePath : '' }));
  return frozenCopy({ ...initiative, entries });
}

const copyRecord = <T>(_id: string, record: T): T => frozenCopy(record);

/**
 * The fog shown for a scene whose fog is over a remote view's limits (`isFogTooLarge`), never its geometry: one operation Atlas's
 * fog refuses (a timestamp that is not finite, no points). Refused fog is Atlas's own fail-closed case (#303): the fog
 * covers the whole map opaque, whatever size the map turns out to be, and every token is left out; nothing is clipped,
 * and no canvas is sized from it.
 */
const COVER_ALL: Readonly<Record<string, FogOperation>> = frozenCopy({
  'atlas-remote-fog-limit': {
    id: 'atlas-remote-fog-limit', kind: 'fog', type: 'lasso', timestamp: Number.POSITIVE_INFINITY, isErasing: false, points: [],
  },
});

const OBJECT_KINDS = ['tokens', 'fog', 'texts', 'drawings'] as const;

export class RemoteSceneApplier {
  /** The extension's tokens, copied once each; `tokens` places those copies, so writing again never reads the extension's. */
  private readonly tokenCopies = new RecordMemo<TokenEntity, TokenEntity>();
  private readonly tokens = new RecordMemo<TokenEntity, TokenEntity>();
  /** The extension's fog, copied once each operation; the limits are counted on these copies (`fogTooLarge`). */
  private readonly fogCopies = new RecordMemo<FogOperation, FogOperation>();
  private readonly fog = new RecordMemo<FogOperation, FogOperation>();
  private tooLarge = false;
  private readonly texts = new RecordMemo<TextElement, TextElement>();
  private readonly drawings = new RecordMemo<DrawingStroke, DrawingStroke>();
  private readonly grid = new KeptCopy<GridState>();
  private readonly widgets = new KeptCopy<WidgetSettings>();
  private readonly values = new KeptCopy<Readonly<Record<string, number>>>();
  private readonly initiative = new KeptCopy<InitiativeState>(initiativeWithoutVaultLinks);
  private readonly emptyInitiative: InitiativeState;
  private scene: RemoteSceneInput | null = null;

  /** Whether the scene shown last has more fog than a remote view replays, as counted on Atlas's own copy of it. */
  get fogTooLarge(): boolean {
    return this.tooLarge;
  }

  /**
   * `positionOf` places a token where this view shows it instead of the scene's position (the player's drag in
   * progress, which a new scene must not pull from under the pointer); null for the scene's.
   */
  constructor(
    private readonly store: RemoteStore,
    private readonly mapPath: string,
    private readonly positionOf: (tokenId: string) => { x: number; y: number } | null = () => null,
  ) {
    // The fresh store's own empty records, shown while there is no scene.
    this.emptyInitiative = store.getState().initiative;
  }

  /**
   * Shows `scene`, or an empty, unloaded scene for null. Throws, keeping the scene shown, when a record cannot be
   * copied (a function or a typed array in it).
   */
  apply(scene: RemoteSceneInput | null): void {
    const next = scene ? this.stateOf(scene) : this.emptyState();
    this.scene = scene;
    this.write(next);
  }

  /** Writes the last scene again. */
  refresh(): void {
    this.write(this.scene ? this.stateOf(this.scene) : this.emptyState());
  }

  private write(next: ReturnType<RemoteSceneApplier['stateOf']>): void {
    const state = this.store.getState();
    const update: Partial<ViewAtlasState> = {};
    for (const key of Object.keys(next) as Array<keyof typeof next>) {
      if (key !== 'objects' && state[key] !== next[key]) Object.assign(update, { [key]: next[key] });
    }
    if (OBJECT_KINDS.some((kind) => state.objects[kind] !== next.objects[kind])) {
      // Pins, walls, lights and sounds stay the store's own empty records.
      update.objects = { ...state.objects, tokens: next.objects.tokens, fog: next.objects.fog, texts: next.objects.texts, drawings: next.objects.drawings };
    }
    if (Object.keys(update).length === 0) return;
    runUntracked(this.store, () => this.store.setState(update));
  }

  private stateOf(scene: RemoteSceneInput): Pick<ViewAtlasState, 'mapPath' | 'mapLoaded' | 'isMapLoading' | 'background' | 'grid' | 'widgetSettings' | 'widgetValues' | 'initiative' | 'initiativeTrackerOpen'> & { objects: Pick<ViewAtlasState['objects'], (typeof OBJECT_KINDS)[number]> } {
    const images = scene.tokenImages;
    const imageOf = (id: string): string => (Object.hasOwn(images, id) ? images[id] ?? '' : '');
    const shownAt = (id: string): string => {
      const point = this.positionOf(id);
      return `${imageOf(id)}|${point ? `${point.x},${point.y}` : ''}`;
    };
    const initiative = this.initiative.of(scene.initiative);
    // Counted on the extension's record first (lengths only, never a copy of too much), then on Atlas's copy, so a
    // getter cannot answer short for the check and long for what is drawn.
    const live = isFogTooLarge(scene);
    const fog = live ? {} : this.fogCopies.build(scene.objects.fog, () => '', copyRecord);
    this.tooLarge = live || isFogTooLarge({ objects: { ...scene.objects, fog }, background: scene.background });
    return {
      mapPath: this.mapPath,
      mapLoaded: true,
      isMapLoading: false,
      background: scene.background.url,
      grid: scene.grid ? this.grid.of(scene.grid) : NO_GRID,
      objects: {
        // A token without an image URL draws as Atlas's default token.
        tokens: this.tokens.build(this.tokenCopies.build(scene.objects.tokens, () => '', copyRecord), shownAt, (id, token) => frozenCopy({ ...withoutVaultLinks(token), imagePath: imageOf(id), ...this.positionOf(id) })),
        // Fails closed: too much fog covers the whole view rather than freezing it working the operations out.
        fog: this.fog.build(this.tooLarge ? COVER_ALL : fog, () => '', (_id, record) => record),
        texts: this.texts.build(scene.objects.texts, () => '', copyRecord),
        drawings: this.drawings.build(scene.objects.drawings, () => '', copyRecord),
      },
      widgetSettings: this.widgets.of(scene.widgets.settings),
      widgetValues: this.values.of(scene.widgets.values),
      initiative,
      initiativeTrackerOpen: initiative.entries.length > 0,
    };
  }

  private emptyState(): ReturnType<RemoteSceneApplier['stateOf']> {
    const none = {};
    this.tooLarge = false;
    return {
      mapPath: null,
      mapLoaded: false,
      isMapLoading: false,
      background: null,
      grid: NO_GRID,
      objects: {
        tokens: this.tokens.build(this.tokenCopies.build(none, () => '', copyRecord), () => '', copyRecord),
        fog: this.fog.build(none, () => '', copyRecord),
        texts: this.texts.build(none, () => '', copyRecord),
        drawings: this.drawings.build(none, () => '', copyRecord),
      },
      widgetSettings: this.widgets.of(EMPTY_WIDGETS),
      widgetValues: this.values.of(EMPTY_VALUES),
      initiative: this.emptyInitiative,
      initiativeTrackerOpen: false,
    };
  }
}

const EMPTY_WIDGETS: WidgetSettings = Object.freeze({ widgets: {}, globalVisible: true, position: 'top', scale: 1 });
const EMPTY_VALUES: Readonly<Record<string, number>> = Object.freeze({});
