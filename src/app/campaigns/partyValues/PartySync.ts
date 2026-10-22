import type { App } from 'obsidian';
import { characterOf, libraryTokenOf, type PlacedTokenSource } from '../../characters/playerCharacters';
import type { TokenAsset } from '../../services/AssetService';
import type { ViewAtlasStore } from '../../storeFactory';
import { runUntracked } from '../../stores/history';
import { campaignFolderOf } from '../campaignPaths';
import type { CampaignPlay } from '../campaignPlay';
import type { CampaignStorage } from '../CampaignFiles';
import { parseCampaign } from '../campaignValidation';
import { onPlayedCampaignChange } from '../playedCampaign';
import type { CharacterFiles } from './CharacterFiles';
import { charactersPathIn, emptyCharacters, isWritable, partyValuesOf, withPartyChanges, type StoredCharacters } from './charactersFile';
import { changesBetween, withChanges, type PartyChangeMap } from './partyChanges';
import { partyKey, type PartyValue, type PartyValues } from './partyKeys';
import type { PartyContext } from './partyReconcile';
import { PartyReconciler } from './PartyReconciler';

/** How long values wait after the last change before they are written to the campaign's file. */
export const PARTY_WRITE_MS = 500;

/** What the sync needs of the vault's campaigns: their files, and the file that holds a campaign (null for none). */
export type PartyCampaigns = CampaignStorage & { pathOf(id: string): string | null };

export interface PartySyncDeps {
  app: App;
  campaigns: PartyCampaigns;
  play: CampaignPlay;
  characters: CharacterFiles;
  /** The library's tokens, read from memory. */
  tokens: () => readonly TokenAsset[];
  /** Settles once the campaigns and their characters files were read; nothing is kept before. */
  ready: Promise<void>;
}

interface ViewLink {
  store: ViewAtlasStore;
  reconciler: PartyReconciler;
  unsubscribe: () => void;
}

/**
 * The played campaign's values of its player characters (`characters.json`), shared by every open
 * view. One per app. It mirrors the campaign's values into every view store (`partyValues`, as
 * Atlas's own write), where each store's `PartyReconciler` keeps the characters' tokens one with
 * them; a store whose values change otherwise (an edit, an undo) has them written to the file,
 * once its changes have rested `PARTY_WRITE_MS`, and mirrored to the other stores. Changes another
 * device makes to the file arrive through the vault's events. Off while no campaign is played, the
 * campaign cannot be changed (`readOnly`, a characters file of a later format) or the files are not
 * read yet: tokens keep values of their own then.
 */
export class PartySync {
  private static readonly instances = new WeakMap<App, PartySync>();

  /** The app's sync once the plugin opened it; undefined before. */
  static forApp(app: App): PartySync | undefined {
    return PartySync.instances.get(app);
  }

  static register(app: App, sync: PartySync): void {
    PartySync.instances.set(app, sync);
  }

  static release(app: App): void {
    PartySync.instances.get(app)?.destroy();
    PartySync.instances.delete(app);
  }

  private readonly views = new Map<string, ViewLink>();
  private readonly listeners = new Set<() => void>();
  private readonly stops: (() => void)[] = [];
  private readonly characterIds = new Map<string, string | null>();
  private readonly pending: PartyChangeMap = new Map();
  private loaded = false;
  private destroyed = false;
  /** The campaign whose values are kept, and those values as this device knows them. */
  private campaignId: string | null = null;
  private values: PartyValues = {};
  private timer: number | null = null;

  constructor(private readonly deps: PartySyncDeps) {
    const update = (): void => this.update();
    this.stops.push(onPlayedCampaignChange(deps.app, update, () => deps.play, () => deps.campaigns), deps.characters.onChange(update));
    void deps.ready.then(() => {
      this.loaded = true;
      this.update();
    }, (error: unknown) => console.error('[Atlas] Reading the campaigns\' characters failed:', error));
  }

  /** Keeps the store's player characters' values with the played campaign's from now on. */
  registerStore(viewId: string, store: ViewAtlasStore): void {
    this.unregisterStore(viewId);
    const reconciler = new PartyReconciler(store);
    const unsubscribe = store.subscribe((state) => state.partyValues, (values) => this.storeChanged(viewId, values));
    this.views.set(viewId, { store, reconciler, unsubscribe });
    if (this.campaignId !== null) {
      this.mirrorInto(store, this.values);
      reconciler.setContext(this.context(this.campaignId));
    }
  }

  unregisterStore(viewId: string): void {
    const view = this.views.get(viewId);
    if (!view) return;
    view.unsubscribe();
    view.reconciler.destroy();
    this.views.delete(viewId);
  }

  /** Which library tokens are player characters may have changed: every view looks at its tokens again. */
  charactersChanged(): void {
    this.characterIds.clear();
    if (this.campaignId === null) return;
    for (const { reconciler } of this.views.values()) reconciler.settle();
  }

  /** Calls `listener` whenever the kept values may have changed (an edit, the file, another campaign); answers how to stop. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed(): void {
    for (const listener of [...this.listeners]) listener();
  }

  /** The value a campaign keeps of a character's resource, or undefined. */
  value(campaignId: string, characterId: string, key: string): PartyValue | undefined {
    const values = campaignId === this.campaignId ? this.values : this.fileValues(campaignId);
    return values[partyKey(campaignId, characterId, key)];
  }

  /** The player character a token was placed from (`characterOf`: one of its forms names it), by its library token id, remembered until the library changes; null for a token of no player character. */
  characterOf(token: PlacedTokenSource): string | null {
    const key = `${token.assetId ?? ''}\u0000${token.imagePath}`;
    let id = this.characterIds.get(key);
    if (id === undefined) {
      const tokens = this.deps.tokens();
      const record = libraryTokenOf(token, tokens);
      id = record ? characterOf(record, tokens)?.id ?? null : null;
      this.characterIds.set(key, id);
    }
    return id;
  }

  /**
   * Sets a value the campaign keeps of a character, as Atlas's own write: no undo step. Every open
   * scene that holds the character shows it, when the campaign is played. False when the campaign
   * cannot be changed (gone, or written by a newer Atlas).
   */
  setValue(campaignId: string, characterId: string, key: string, value: PartyValue): boolean {
    const changes: PartyChangeMap = new Map([[partyKey(campaignId, characterId, key), value]]);
    if (campaignId === this.campaignId) {
      this.take(changes, null);
      return true;
    }
    if (!this.isWritable(campaignId)) return false;
    this.write(campaignId, changes);
    return true;
  }

  /** Writes what waits for the file now; settles once it is on disk. */
  flush(): Promise<void> {
    if (this.campaignId !== null) this.writePending(this.campaignId);
    return this.deps.characters.flush();
  }

  destroy(): void {
    void this.flush();
    this.destroyed = true;
    this.listeners.clear();
    for (const stop of this.stops.splice(0)) stop();
    for (const viewId of [...this.views.keys()]) this.unregisterStore(viewId);
    this.campaignId = null;
  }

  /** The campaign whose values are kept now: the played one, once read, while it can be changed. */
  private target(): string | null {
    if (!this.loaded || this.destroyed) return null;
    const id = this.deps.play.playing();
    return id !== null && this.isWritable(id) ? id : null;
  }

  private isWritable(campaignId: string): boolean {
    const entry = this.deps.campaigns.entries().find((stored) => stored.id === campaignId);
    const campaign = entry ? parseCampaign(entry) : null;
    if (!campaign || campaign.readOnly === true) return false;
    const stored = this.stored(campaignId);
    return !stored || isWritable(stored);
  }

  private update(): void {
    const target = this.target();
    if (target !== this.campaignId) {
      this.stop();
      if (target !== null) this.start(target);
    } else if (target !== null) {
      this.followFile(target);
    }
  }

  private start(campaignId: string): void {
    this.campaignId = campaignId;
    this.values = this.fileValues(campaignId);
    const context = this.context(campaignId);
    for (const { store, reconciler } of this.views.values()) {
      this.mirrorInto(store, this.values);
      reconciler.setContext(context);
    }
    this.changed();
  }

  private stop(): void {
    const campaignId = this.campaignId;
    if (campaignId === null) return;
    this.campaignId = null;
    this.values = {};
    for (const { reconciler } of this.views.values()) reconciler.setContext(null);
    this.writePending(campaignId);
    this.changed();
  }

  /** Hands what waits to the campaign's file now. */
  private writePending(campaignId: string): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    if (this.pending.size === 0) return;
    const changes = new Map(this.pending);
    this.pending.clear();
    this.write(campaignId, changes);
  }

  /** The file changed (here or on another device): its values reach the views, except where this device has changes waiting. */
  private followFile(campaignId: string): void {
    const onFile = this.fileValues(campaignId);
    const changes = changesBetween(this.values, onFile, campaignId);
    for (const key of this.pending.keys()) changes.delete(key);
    if (changes.size === 0) return;
    this.values = withChanges(this.values, changes);
    for (const { store } of this.views.values()) this.mirrorChanges(store, changes);
    this.changed();
  }

  /** A store's values changed by anything but this sync: they are the campaign's now. */
  private storeChanged(viewId: string, next: PartyValues): void {
    if (this.campaignId === null) return;
    const changes = changesBetween(this.values, next, this.campaignId);
    if (changes.size > 0) this.take(changes, viewId);
  }

  /** Takes changes as the campaign's: written to its file soon and shown in every view but `from`. */
  private take(changes: PartyChangeMap, from: string | null): void {
    this.values = withChanges(this.values, changes);
    for (const [key, value] of changes) this.pending.set(key, value);
    this.schedule();
    for (const [viewId, { store }] of this.views) if (viewId !== from) this.mirrorChanges(store, changes);
    this.changed();
  }

  private schedule(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.flush(), PARTY_WRITE_MS);
  }

  /** Writes changes into the campaign's characters file, creating it in the campaign's folder. */
  private write(campaignId: string, changes: PartyChangeMap): void {
    const change = (stored: StoredCharacters): StoredCharacters => withPartyChanges(stored, changes);
    if (this.deps.characters.pathOf(campaignId) !== null) {
      this.deps.characters.update(campaignId, change);
      return;
    }
    const campaignPath = this.deps.campaigns.pathOf(campaignId);
    if (campaignPath === null) return;
    this.deps.characters.createAt(charactersPathIn(campaignFolderOf(campaignPath)), change(emptyCharacters(campaignId)), change);
  }

  private stored(campaignId: string): StoredCharacters | undefined {
    return this.deps.characters.entries().find((stored) => stored.id === campaignId);
  }

  private fileValues(campaignId: string): PartyValues {
    const stored = this.stored(campaignId);
    return stored ? partyValuesOf(stored) : {};
  }

  private mirrorInto(store: ViewAtlasStore, values: PartyValues): void {
    if (store.getState().partyValues !== values) runUntracked(store, () => store.setState({ partyValues: values }));
  }

  private mirrorChanges(store: ViewAtlasStore, changes: PartyChangeMap): void {
    this.mirrorInto(store, withChanges(store.getState().partyValues, changes));
  }

  private context(campaignId: string): PartyContext {
    return { campaignId, characterOf: (token) => this.characterOf(token) };
  }
}
