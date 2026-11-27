import { TFile, type App } from 'obsidian';
import type { TokenEntity } from '../../../types';
import { hasCreatureForNotePath } from '../../../services/FantasyStatblocksService';
import { isStatblockNote } from '../../../statblocks/resolve/statblockNote';

/** The statblock note a token links, if it is a creature's. */
export function statblockPathOf(token: TokenEntity): string | undefined {
  return token.kind === 'character' ? token.statblockPath : undefined;
}

/** The notes the map's tokens link, each with its tokens, in the order the tokens come. */
export function tokensByStatblock(tokens: Readonly<Record<string, TokenEntity>>): Map<string, TokenEntity[]> {
  const grouped = new Map<string, TokenEntity[]>();
  for (const token of Object.values(tokens)) {
    const path = statblockPathOf(token);
    if (!path) continue;
    const group = grouped.get(path);
    if (group) group.push(token);
    else grouped.set(path, [token]);
  }
  return grouped;
}

/** Whether a note defines a statblock of its own. One that cannot be read defines none, so the other notes keep theirs. */
async function definesStatblock(app: App, file: TFile): Promise<boolean> {
  try {
    return await isStatblockNote(app, file);
  } catch (error) {
    console.error(`[Atlas] Could not read the statblock note ${file.path}:`, error);
    return false;
  }
}

/**
 * Whether the DM screen shows the statblock of a linked note: old Atlas notes can still be linked to tokens but
 * define none. The bestiary is asked first: when it cannot be asked, this throws, before any note is read.
 */
export async function showsStatblock(app: App, path: string): Promise<boolean> {
  const file = app.vault.getAbstractFileByPath(path);
  return file instanceof TFile && (hasCreatureForNotePath(path) || await definesStatblock(app, file));
}

/** The statblocks the DM screen shows for the map's tokens: the linked notes that define one, each with its tokens. */
export async function screenStatblocks(app: App, tokens: Readonly<Record<string, TokenEntity>>): Promise<Map<string, TokenEntity[]>> {
  const shown = new Map<string, TokenEntity[]>();
  for (const [path, pathTokens] of tokensByStatblock(tokens)) {
    if (await showsStatblock(app, path)) shown.set(path, pathTokens);
  }
  return shown;
}
