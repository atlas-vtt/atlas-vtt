import type { App } from 'obsidian';
import { CampaignPlay } from '../../campaigns/campaignPlay';
import { CampaignPlayers } from '../../campaigns/players/CampaignPlayers';
import { TableSeats } from './campaignSeats.ts';
import type { SavedTable } from './savedTable.ts';

/** The campaigns online tables run on, as `OnlineControl` needs them. */
export interface TableCampaigns {
  /** The id of the campaign this device plays, or null. */
  playing(): string | null;
  /** This device plays the campaign `campaignId` from now on. */
  play(campaignId: string): void;
  /** This device plays no campaign from now on. */
  stop(): void;
  /** Calls `listener` whenever another campaign, or none, is played; returns the way to stop. */
  onChange(listener: () => void): () => void;
  /**
   * The players of the campaign `campaignId` once the players files were read and the campaign is
   * ready for a table (the books an older Atlas kept carried into it); null where there are none to read.
   */
  open(campaignId: string): Promise<TableSeats | null>;
  /** The players of the campaign `campaignId` as read so far, without waiting; null where none can be read yet. */
  known(campaignId: string): TableSeats | null;
  /** A table runs on the campaign `campaignId` from now on, or on none (null) once it ended. */
  bound(campaignId: string | null): void;
}

/** The players of the campaign this device plays, as read so far; null while none is played or none can be read yet. */
export function playedSeats(campaigns: TableCampaigns): () => TableSeats | null {
  return () => {
    const playing = campaigns.playing();
    return playing === null ? null : campaigns.known(playing);
  };
}

/**
 * What this device plays once online play has read its data: the campaign of the table that comes
 * back after a reload (played until then, so its rules hold while it reconnects), or none. Older
 * Atlas versions let the GM play a campaign without a table; such a play ends here.
 */
export function playSavedTable(campaigns: TableCampaigns, saved: SavedTable | null): void {
  if (saved === null) campaigns.stop();
  else campaigns.play(saved.campaignId);
}

/**
 * The vault's campaigns: the one this device plays, and their players files (`CampaignPlayers`).
 * `prepare` readies a campaign before a table of it runs (its failure is logged, and the table runs).
 */
export function appCampaigns(app: App, bound: (campaignId: string | null) => void = () => undefined, prepare: (campaignId: string) => Promise<void> = () => Promise.resolve()): TableCampaigns {
  return {
    playing: () => CampaignPlay.forApp(app).playing(),
    play: (campaignId) => CampaignPlay.forApp(app).play(campaignId),
    stop: () => CampaignPlay.forApp(app).stop(),
    onChange: (listener) => CampaignPlay.forApp(app).onChange(listener),
    open: async (campaignId) => {
      const players = CampaignPlayers.forApp(app);
      if (players === undefined) return null;
      await players.whenLoaded();
      await prepare(campaignId).catch((error: unknown) => console.error('[Atlas] Readying the campaign for its table failed:', error));
      return new TableSeats(players, campaignId);
    },
    known: (campaignId) => {
      const players = CampaignPlayers.forApp(app);
      return players === undefined || !players.isLoaded() ? null : new TableSeats(players, campaignId);
    },
    bound,
  };
}
