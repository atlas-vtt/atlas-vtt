import { showNotice } from '../../ui/notice';
import type { WorkspaceLeaf } from 'obsidian';
import { obsidianHttp } from './account/obsidianHttp.ts';
import { sceneStoreOf } from './atlasView.ts';
import { CAMPAIGNS_LOADING_TEXT, campaignLink, linkRefusal, NO_CAMPAIGN_TEXT, type TableSeats } from './campaignSeats.ts';
import type { CreatedTable } from './createdTable.ts';
import { createTable } from './createTable.ts';
import { RELAY_ORIGIN } from './servers.ts';
import { endStrayTable } from './strayTable.ts';
import type { TableCampaigns } from './tableCampaigns.ts';

/** The GM's account as starting a table needs it. */
export interface HostAccount {
  /** The account's token, or null while signed out. */
  token(): string | null;
  /** The relay refused the token. */
  signedOutByServer(): void;
  /** Asks the relay again what the account may host. */
  refresh(force: boolean): Promise<void>;
}

export const NO_ACCOUNT: HostAccount = { token: () => null, signedOutByServer: () => undefined, refresh: () => Promise.resolve() };

/** Tells the GM why something cannot be done; null, for the caller to answer. */
export function refused(text: string): null {
  showNotice(text);
  return null;
}

/** Why no table can start from the Atlas tab `leaf` for the campaign `campaignId` (null: none is played), or null where one can. */
export function startBlock(leaf: WorkspaceLeaf | null, campaignId: string | null, account: HostAccount): string | null {
  if (leaf === null || sceneStoreOf(leaf) === null) return 'Open an Atlas map tab first.';
  if (campaignId === null) return NO_CAMPAIGN_TEXT;
  return account.token() === null ? 'Sign in to host first.' : null;
}

/** A table the relay made on a campaign's link, with that campaign's players. */
export interface CampaignTable {
  readonly created: CreatedTable;
  readonly seats: TableSeats;
}

/** What the GM reads where the relay opened a table on another link than the campaign's (a relay from before lasting links). */
export const OTHER_LINK_TEXT = 'The server could not open this campaign\'s link. Try again later.';

/**
 * Asks the relay for a table on the lasting link of the campaign `campaignId` once its players file
 * was read, making the link first where it has none; null where no table was made, the GM told why
 * (a relay that signed the account out says so on the account instead; one that needs a newer Atlas
 * names its least GM level to `outdated`). A table the relay opened on
 * another link is ended, never run: its players would not find it at the campaign's link.
 */
export async function createCampaignTable(campaigns: TableCampaigns, campaignId: string, token: string, account: HostAccount, outdated: (minLevel: number) => void = () => undefined): Promise<CampaignTable | null> {
  const seats = await campaigns.open(campaignId).catch(() => null);
  const link = seats === null ? null : campaignLink(seats);
  if (seats === null || link === null) return refused(seats === null ? CAMPAIGNS_LOADING_TEXT : linkRefusal(seats));
  // Whether this account may host is the relay's answer alone: nothing here looks at what the account was last said to hold.
  const created = await createTable(obsidianHttp, RELAY_ORIGIN, token, link);
  if (!('message' in created) && created.code !== link) {
    endStrayTable(RELAY_ORIGIN, created);
    return refused(OTHER_LINK_TEXT);
  }
  if (!('message' in created)) return { created, seats };
  if (created.minLevel !== undefined) outdated(created.minLevel);
  if (created.status === 401) account.signedOutByServer();
  else if (created.status === 403) void account.refresh(true);
  return created.status === 401 ? null : refused(created.message);
}
