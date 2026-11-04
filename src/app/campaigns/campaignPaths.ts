/**
 * The files of campaigns: a visible folder per campaign under `atlas-vtt/campaigns/`, named after
 * it, holding `campaign.json` and, later, what the campaign keeps (its party, sessions, log). The
 * id inside `campaign.json` is the campaign's identity, never the folder's name.
 */

import { ATLAS_VTT_DIR } from '../services/assetPaths';
import { readRecordText, recordText, type RecordLayout } from '../services/recordFiles/recordLayout';
import { freeNamedPath, isNamedAfterStem, nameStem } from '../services/recordFiles/recordNames';
import type { StoredCampaign } from './campaignTypes';

export const CAMPAIGNS_FOLDER = `${ATLAS_VTT_DIR}/campaigns`;
export const CAMPAIGN_FILE = 'campaign.json';
/** The format of a campaign file this Atlas writes; a file of a later one is read and left as it is. */
export const CAMPAIGN_FORMAT = 1;

const FALLBACK_NAME = 'Campaign';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether `entry` is something a campaign file may hold: a record with an id. */
export function isStoredCampaign(entry: unknown): entry is StoredCampaign {
  return isRecord(entry) && typeof entry.id === 'string' && entry.id.trim().length > 0;
}

/** Whether `path` is a campaign file: `campaign.json` directly in a campaign's folder. */
export function isCampaignPath(path: string): boolean {
  const rest = path.startsWith(`${CAMPAIGNS_FOLDER}/`) ? path.slice(CAMPAIGNS_FOLDER.length + 1) : '';
  const parts = rest.split('/');
  return parts.length === 2 && parts[0] !== '' && parts[1] === CAMPAIGN_FILE;
}

/** A campaign's folder, from its file's path. */
export const campaignFolderOf = (path: string): string => path.slice(0, path.lastIndexOf('/'));

/** A campaign is a folder named after it, holding `campaign.json`. */
export const CAMPAIGN_LAYOUT: RecordLayout<StoredCampaign> = {
  root: CAMPAIGNS_FOLDER,
  kind: 'campaign',
  isRecordPath: isCampaignPath,
  read: (text) => readRecordText(text, isStoredCampaign),
  text: (record) => recordText(record, CAMPAIGN_FORMAT),
  namedPath: campaignFolderOf,
  recordPathIn: (folder) => `${folder}/${CAMPAIGN_FILE}`,
  freeNamedPath: (name, isTaken) => freeNamedPath(CAMPAIGNS_FOLDER, nameStem(name, FALLBACK_NAME), '', isTaken),
  isNamedAfter: (folder, name) => isNamedAfterStem(folder, nameStem(name, FALLBACK_NAME), ''),
  namedHolds: true,
};
