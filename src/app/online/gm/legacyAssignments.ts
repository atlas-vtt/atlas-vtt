import type { CampaignPlayers } from '../../campaigns/players/CampaignPlayers';
import { assignmentsFrom, holdsAssignments, NO_ASSIGNMENTS, withCarriedAssignments, type TokenAssignments } from '../../campaigns/players/tokenAssignments';
import { isRecord } from '../../campaigns/campaignValues';

/** The token owners and player tokens an older Atlas kept in this device's data (`ownership` in `online.json`); none where there are none. */
export function readLegacyAssignments(ownership: unknown): TokenAssignments {
  const record = isRecord(ownership) ? ownership : {};
  const read = assignmentsFrom(record.owners, record.playerTokens);
  return Object.keys(read.owners).length > 0 || Object.keys(read.playerTokens).length > 0 ? read : NO_ASSIGNMENTS;
}

/**
 * Carries the assignments into the players file of `campaignId`, what the file already assigns
 * staying the file's. Settles once the file is on disk: true when it holds them then, false where it
 * cannot be written or its write failed, and then the data keeps them.
 */
export async function carryAssignmentsOver(carried: TokenAssignments, players: Pick<CampaignPlayers, 'change' | 'flush' | 'onDisk'>, campaignId: string): Promise<boolean> {
  if (!players.change(campaignId, (stored) => withCarriedAssignments(stored, carried))) return false;
  await players.flush();
  // The queue of writes reports no failure, so the file is read back.
  const written = await players.onDisk(campaignId);
  if (written !== null && holdsAssignments(written, carried)) return true;
  console.error('[Atlas] The player tokens could not be written to the campaign\'s players file; they stay in this device\'s data.');
  return false;
}
