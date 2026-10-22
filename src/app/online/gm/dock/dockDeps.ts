import type { WorkspaceLeaf } from 'obsidian';
import type { AccountApi } from '../account/AccountControl.ts';
import type { CampaignChoices } from '../campaignChoices.ts';
import type { CompanionFeedback } from '../companionReports.ts';
import type { OnlineApi } from './panelModel.ts';

/** What every control shares: online play, and what the plugin knows besides. */
export interface DockDeps {
  readonly api: OnlineApi;
  /** The GM's account: sign-in, what the relay says it may host, and the way to its page. */
  readonly account: AccountApi;
  /** The campaigns a table can be started on. */
  readonly campaigns: CampaignChoices;
  /** Opens Atlas's dashboard, where campaigns are made. */
  openCampaigns(): void;
  /** The URL the vault serves an image at. */
  imageSrc(path: string): string;
  /** Where the panel's feedback goes, and the switch for error reports. */
  readonly feedback: CompanionFeedback;
  /** The control opened on a view, where the table's log may stand open: the log makes way. */
  opened?(leaf: WorkspaceLeaf): void;
}
