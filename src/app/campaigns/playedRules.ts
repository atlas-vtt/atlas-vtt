import type { App } from 'obsidian';
import type { PlayedSystem } from '../gameSystems/mapRules';
import { canonicalJson } from '../utils/hashing';
import type { CampaignStorage } from './CampaignFiles';
import { CampaignPlay } from './campaignPlay';
import type { CampaignSystem } from './campaignSystem';
import type { StoredCampaign } from './campaignTypes';
import { parseCampaign } from './campaignValidation';
import { onPlayedCampaignChange } from './playedCampaign';

/**
 * The game system of the campaign this device plays, which every map then plays by. One per app,
 * opened by the plugin once its campaigns are open and released when it unloads; readers ask
 * `forApp`, which has none before.
 */
export class PlayedRules {
  private static readonly instances = new WeakMap<object, PlayedRules>();

  static open(app: App, storage: CampaignStorage, play: CampaignPlay = CampaignPlay.forApp(app)): PlayedRules {
    let rules = PlayedRules.instances.get(app);
    if (!rules) {
      rules = new PlayedRules(app, storage, play);
      PlayedRules.instances.set(app, rules);
    }
    return rules;
  }

  /** The app's played rules once the plugin opened them; undefined before. */
  static forApp(app: object | undefined): PlayedRules | undefined {
    return app ? PlayedRules.instances.get(app) : undefined;
  }

  static release(app: App): void {
    PlayedRules.instances.get(app)?.destroy();
    PlayedRules.instances.delete(app);
  }

  private readonly listeners = new Set<() => void>();
  private readonly stop: () => void;
  /** The played campaign's entry as last stored and its system as read from it: the same entry reads the same. */
  private read: { entry: StoredCampaign; system: CampaignSystem | undefined } | null = null;
  /** What `played` gave when listeners were last told, as a comparable key. */
  private told: string;

  private constructor(app: App, private readonly storage: CampaignStorage, private readonly play: CampaignPlay) {
    this.told = this.key();
    this.stop = onPlayedCampaignChange(app, () => this.followChange(), () => play, () => storage);
  }

  /** The id of the campaign being played, or null. */
  campaignId(): string | null {
    return this.play.playing();
  }

  /** The played campaign's system, or null while none is played, it has none or it is gone. */
  played(): PlayedSystem | null {
    const campaignId = this.play.playing();
    const entry = campaignId === null ? undefined : this.storage.entries().find((stored) => stored.id === campaignId);
    if (campaignId === null || entry === undefined) return null;
    if (this.read?.entry !== entry) this.read = { entry, system: parseCampaign(entry)?.system };
    return this.read.system ? { campaignId, settings: this.read.system } : null;
  }

  /** Calls `listener` whenever `played` gives another system; returns the function that stops it. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  destroy(): void {
    this.stop();
    this.listeners.clear();
  }

  private key(): string {
    const played = this.played();
    return played ? canonicalJson(played) : '';
  }

  /** Tells the listeners only when the campaign's system is another: a save of its other fields, or of another campaign, is none. */
  private followChange(): void {
    const key = this.key();
    if (key === this.told) return;
    this.told = key;
    for (const listener of [...this.listeners]) listener();
  }
}
