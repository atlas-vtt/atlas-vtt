/**
 * The token creator's Statblocks row (§7.3, D13): every token it saves gets a
 * native statblock of the chosen role, named after the token, in the role's
 * folder, with the token's art and the token linked. The notice that follows
 * names them.
 */

import { type App } from 'obsidian';
import { showNotice } from '../../../../ui/notice';
import { chosenRole, roleTemplateId } from '../../../../statblocks/editor/create/collectionRoles';
import { createStatblockNote } from '../../../../statblocks/notes/createStatblockNote';
import { roleFolder } from '../../../../statblocks/roles/collectionStatblockRoles';

/** A token the creator has just registered. */
export interface SavedToken {
  name: string;
  imagePath: string;
  /** Set when the token links a statblock already (one staged from a statblock note). */
  statblockPath?: string | undefined;
}

export interface TokenStatblocksResult {
  /** Names of the tokens that got a linked statblock. */
  created: string[];
  /** Names of the tokens whose statblock could not be made or linked. */
  failed: string[];
}

/** Names listed in a notice before the rest are counted. */
const LISTED_NAMES = 5;

/** "Wolf, Bear and Owl", "Wolf, Bear, Owl, Fox, Elk and 3 more". */
export function nameList(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  const listed = names.slice(0, LISTED_NAMES);
  const rest = names.length - listed.length;
  if (rest > 0) return `${listed.join(', ')} and ${rest} more`;
  return `${listed.slice(0, -1).join(', ')} and ${listed[listed.length - 1] ?? ''}`;
}

/** What the notice says. */
export function tokenStatblocksMessage({ created, failed }: TokenStatblocksResult): string {
  const made = created.length === 0 ? '' : `Created ${created.length === 1 ? 'a statblock' : 'statblocks'} for ${nameList(created)}.`;
  const missed = failed.length === 0 ? '' : `Couldn't create ${failed.length === 1 ? 'a statblock' : 'statblocks'} for ${nameList(failed)}.`;
  return [made, missed].filter(Boolean).join(' ');
}

/**
 * Creates and links a statblock for each token that has none, one after the
 * other, then says what was made. A token whose note fails is reported and
 * the rest go on.
 */
export async function createTokenStatblocks(
  app: App, tokens: readonly SavedToken[], collectionId: string, roleId: string,
): Promise<TokenStatblocksResult> {
  const result: TokenStatblocksResult = { created: [], failed: [] };
  const waiting = tokens.filter((token) => !token.statblockPath);
  const chosen = chosenRole(app, collectionId, roleId);
  if (waiting.length === 0 || !chosen) return result;
  const templateId = await roleTemplateId(app, chosen.role);
  const folder = roleFolder(chosen.settings, chosen.role.id);
  for (const token of waiting) {
    try {
      const { linked } = await createStatblockNote(app, { name: token.name, templateId, folder, tokenImagePath: token.imagePath });
      (linked ? result.created : result.failed).push(token.name);
    } catch (error) {
      console.error(`[Atlas] Creating the statblock of ${token.name} failed:`, error);
      result.failed.push(token.name);
    }
  }
  const message = tokenStatblocksMessage(result);
  if (message) showNotice(message);
  return result;
}
