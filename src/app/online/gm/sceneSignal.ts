import { tableControlsStore } from '../../stores/tableControlsStore';
import type { AtlasPlayerSettings } from './atlasLighting.ts';
import { playable, type ObservedStore, type SceneState } from './atlasView.ts';

/** Calls `listener` at each change of what it follows; returns what stops it. */
export type Follow = (listener: () => void) => () => void;

/**
 * What changed of what players see: the scene's store, the GM's renderer beside it (the players' sight,
 * the roof, a token drawn once its art loaded), or Atlas beside both: what `AtlasInputs` holds, and what
 * the shares read through Atlas (the map's rules, statblocks, library tokens).
 */
export type SceneChange = 'store' | 'sight' | 'atlas';

/** What the shares read of Atlas beside the scene's store, read once at each change of Atlas. */
export interface AtlasInputs {
  /** Atlas's settings for the players' view. */
  readonly settings: AtlasPlayerSettings;
  /** Whether the GM paused play: no player's token moves then. */
  readonly paused: boolean;
  /** Whether every player sees the party's picture: Shared vision is on, or the table plays in remote mode, where everyone watches one screen. */
  readonly sharedVision: boolean;
  /** The GM's accent colour as `#rrggbb`, which measurements are drawn in; null while it cannot be read. */
  readonly accent: string | null;
}

/** What players' pictures are made of beside the GM's renderer, as of the last change. */
export interface SceneInputs {
  /** The scene as its store last told it. */
  readonly state: SceneState;
  readonly atlas: AtlasInputs;
}

/** Where the inputs of what players see come from beside the table's controls, and what tells of their changes. */
export interface SceneSources {
  readonly store: ObservedStore;
  /** The GM's renderer telling of each change of what players see that comes without a store change. */
  readonly sight: Follow;
  /** Atlas's settings for the players' view: as they are now, and what tells of each change of them. */
  readonly settings: { read(): AtlasPlayerSettings; readonly follow: Follow };
  /** The GM's accent colour as it is now. */
  accent(): string | null;
  /** Everything else that tells of a change of Atlas: of what `accent` reads, or of what the shares read through Atlas. */
  readonly atlas: readonly Follow[];
}

/** The table's controls players' pictures read (pause, remote mode), heard where either changes. */
const followTableControls: Follow = (listener) => tableControlsStore.subscribe((now, before) => {
  if (now.paused !== before.paused || now.playMode !== before.playMode) listener();
});

/** Whether `state` is no scene players may be shown: one loading, or held on the last frame they saw. */
const loading = (state: SceneState): boolean => !playable(state);

/**
 * The one signal for what players see: the scene's store, the GM's renderer's sight and Atlas beside them
 * (its settings, the table's controls and what `SceneSources` names), as one change with one snapshot of
 * the inputs (`inputs`). Atlas is read again at each of its changes, and
 * as a scene stops loading (a held scene reads as loading), since what it reads of the renderer stays as it
 * was while the scene loads or is held. Its sources are followed while anyone listens.
 */
export class SceneSignal {
  private current: SceneInputs | null = null;
  private readonly listeners = new Set<(change: SceneChange) => void>();
  private stops: (() => void)[] = [];
  /** Whether a change of Atlas waits to be read: Atlas tells its own listeners in the same task, and the renderer is one of them. */
  private atlasWaiting = false;

  constructor(private readonly sources: SceneSources) {}

  /** The inputs as of the last change; read anew at each call while nobody listens, as no change is heard then. */
  get inputs(): SceneInputs {
    return this.current ?? { state: this.sources.store.getState(), atlas: this.readAtlas() };
  }

  /** Calls `listener` after every change, the inputs read anew; returns what stops it. */
  listen(listener: (change: SceneChange) => void): () => void {
    if (this.listeners.size === 0) this.follow();
    this.listeners.add(listener);
    return () => {
      if (!this.listeners.delete(listener) || this.listeners.size > 0) return;
      for (const stop of this.stops) stop();
      this.stops = [];
      this.current = null;
    };
  }

  private follow(): void {
    const { store, sight, settings, atlas } = this.sources;
    this.current = { state: store.getState(), atlas: this.readAtlas() };
    this.stops = [
      store.subscribe((state) => this.storeChanged(state)),
      sight(() => this.tell('sight')),
      ...atlas.map((follow) => follow(() => this.atlasChanged())),
      // Players' pictures read these as they are, not through the renderer: a pause or a switch the GM turned off refuses the next request at once.
      settings.follow(() => this.readAtlasNow()),
      followTableControls(() => this.readAtlasNow()),
    ];
  }

  /** Atlas changed: it is read once everything Atlas tells of the change has heard of it, however many of its parts told. */
  private atlasChanged(): void {
    if (this.atlasWaiting) return;
    this.atlasWaiting = true;
    queueMicrotask(() => {
      this.atlasWaiting = false;
      if (this.listeners.size > 0) this.readAtlasNow();
    });
  }

  private readAtlasNow(): void {
    this.current = { state: this.inputs.state, atlas: this.readAtlas() };
    this.tell('atlas');
  }

  private storeChanged(state: SceneState): void {
    const was = this.inputs.state;
    this.current = { state, atlas: this.inputs.atlas };
    this.tell('store');
    if (loading(was) && !loading(state)) this.atlasChanged();
  }

  /** In remote mode everyone watches one screen, which shows the party's picture: their phones are remotes. */
  private readAtlas(): AtlasInputs {
    const settings = this.sources.settings.read();
    const { paused, playMode } = tableControlsStore.getState();
    return { settings, paused, sharedVision: settings.sharedVision === true || playMode === 'remote', accent: this.sources.accent() };
  }

  private tell(change: SceneChange): void {
    for (const listener of [...this.listeners]) listener(change);
  }
}
