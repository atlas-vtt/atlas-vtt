import type { App } from 'obsidian';
import { RecordFiles } from '../services/recordFiles/RecordFiles';
import { CAMPAIGN_LAYOUT } from './campaignPaths';
import type { StoredCampaign } from './campaignTypes';

/** Where campaigns are kept: their files in the vault (`CampaignFiles`), or memory in tests. */
export interface CampaignStorage {
  /** The campaigns as stored, unvalidated; the same array while nothing changed. */
  entries(): readonly StoredCampaign[];
  /** Whether the campaigns were read once, so `entries` holds what the vault does. */
  isLoaded(): boolean;
  create(entry: StoredCampaign): void;
  /** Changes the stored campaign `id` with `change`, which gets the campaign as stored. */
  update(id: string, change: (stored: StoredCampaign) => StoredCampaign): void;
  remove(id: string): void;
  /** The file that holds the campaign `id`, or null when none does. */
  pathOf(id: string): string | null;
  /** Calls `listener` after every change, also one that arrived from another device. */
  onChange(listener: () => void): () => void;
}

/**
 * The vault's campaigns as their files (`RecordFiles` with the campaign layout): a folder per
 * campaign, renamed with it, trashed whole when it is deleted. One per app, opened by the plugin
 * and released when it unloads.
 */
export class CampaignFiles extends RecordFiles<StoredCampaign> implements CampaignStorage {
  private static readonly instances = new WeakMap<App, CampaignFiles>();

  static open(app: App): CampaignFiles {
    let files = CampaignFiles.instances.get(app);
    if (!files) {
      files = new CampaignFiles(app);
      CampaignFiles.instances.set(app, files);
    }
    return files;
  }

  /** The app's campaigns once the plugin opened them; undefined before. */
  static forApp(app: App | undefined): CampaignFiles | undefined {
    return app ? CampaignFiles.instances.get(app) : undefined;
  }

  static release(app: App): void {
    CampaignFiles.instances.get(app)?.destroy();
    CampaignFiles.instances.delete(app);
  }

  private constructor(app: App) {
    super(app, CAMPAIGN_LAYOUT);
  }
}
