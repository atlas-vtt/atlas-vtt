import type { App } from 'obsidian';
import { RecordFiles } from '../../services/recordFiles/RecordFiles';
import { CampaignFiles } from '../CampaignFiles';
import { campaignFolderOf } from '../campaignPaths';
import {
  emptyPlayers, isWritable, linkOf, PLAYERS_LAYOUT, playersPathIn, readPlayers, type CampaignPlayer, type StoredPlayers,
} from './playersFile';
import { NO_ASSIGNMENTS, readTokenAssignments, type TokenAssignments } from './tokenAssignments';

/** Why a campaign's players file cannot be changed: the campaigns are not read yet, it has no folder, or its file is of a later format. */
export type PlayersBlock = 'loading' | 'no-folder' | 'newer';

/** What a campaign's players file holds, as Atlas reads it. */
export interface CampaignRoster {
  /** The campaign's table code, once it has one. */
  readonly link: string | null;
  readonly players: readonly CampaignPlayer[];
  /** False for a file of a later format, which is only read. */
  readonly writable: boolean;
}

/**
 * The campaigns' players files (`playersFile.ts`), one per campaign folder that has online
 * players. One per app, opened by the plugin beside the campaigns and released when it unloads.
 */
export class CampaignPlayers extends RecordFiles<StoredPlayers> {
  private static readonly instances = new WeakMap<App, CampaignPlayers>();

  static open(app: App): CampaignPlayers {
    let files = CampaignPlayers.instances.get(app);
    if (!files) {
      files = new CampaignPlayers(app);
      CampaignPlayers.instances.set(app, files);
    }
    return files;
  }

  /** The app's campaign players once the plugin opened them; undefined before. */
  static forApp(app: App | undefined): CampaignPlayers | undefined {
    return app ? CampaignPlayers.instances.get(app) : undefined;
  }

  static release(app: App): void {
    CampaignPlayers.instances.get(app)?.destroy();
    CampaignPlayers.instances.delete(app);
  }

  private constructor(app: App) {
    super(app, PLAYERS_LAYOUT);
  }

  /** Settles once the players files were read. */
  whenLoaded(): Promise<void> {
    return this.load();
  }

  /** The campaign's link and players; none while it has no file. */
  of(campaignId: string): CampaignRoster {
    const stored = this.entries().find((entry) => entry.id === campaignId);
    return stored ? { link: linkOf(stored), players: readPlayers(stored), writable: isWritable(stored) } : { link: null, players: [], writable: true };
  }

  /** The tokens the campaign's players file assigns (`tokenAssignments.ts`); none while it has no file. */
  assignments(campaignId: string): TokenAssignments {
    const stored = this.entries().find((entry) => entry.id === campaignId);
    return stored ? readTokenAssignments(stored) : NO_ASSIGNMENTS;
  }

  /**
   * Why the campaign's players file cannot be changed now, or null where it can: the campaigns are
   * not read yet, the campaign has no folder, or its file is of a later format.
   */
  blocked(campaignId: string): PlayersBlock | null {
    const stored = this.entries().find((entry) => entry.id === campaignId);
    if (stored) return isWritable(stored) ? null : 'newer';
    const campaigns = CampaignFiles.forApp(this.app);
    if (campaigns?.pathOf(campaignId) != null) return null;
    return campaigns?.isLoaded() === true ? 'no-folder' : 'loading';
  }

  /**
   * Changes the campaign's players file, creating it in the campaign's folder when it has none.
   * False where it cannot be changed (`blocked`). `change` must be a pure function of the file it is
   * given: it runs more than once, on the copy in memory now and on what the disk holds once the
   * write lands, so anything random or timed is drawn before and passed in.
   */
  change(campaignId: string, change: (stored: StoredPlayers) => StoredPlayers): boolean {
    if (this.blocked(campaignId) !== null) return false;
    const stored = this.entries().find((entry) => entry.id === campaignId);
    if (stored) {
      this.update(campaignId, change);
      return true;
    }
    const campaignPath = CampaignFiles.forApp(this.app)?.pathOf(campaignId);
    if (!campaignPath) return false;
    this.createAt(playersPathIn(campaignFolderOf(campaignPath)), change(emptyPlayers(campaignId)), change);
    return true;
  }
}
