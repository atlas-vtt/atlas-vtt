/**
 * Copy into a new statblock (§6.4): a ```statblock fence (or `statblock:
 * inline`) becomes a native note of a role of the collection, holding the
 * fence's values. The fence's note is not written here; moving a layout's
 * statblocks to Atlas converts fence notes in place (`fs-import/statblockMove.ts`).
 */

import { TFile, type App } from 'obsidian';
import { fenceStatblock, type FenceValues } from '../../fs/fenceStatblock';
import type { TemplateId } from '../../model/templateTypes';
import { parseStatblockFence } from '../../notes/statblockSource';
import { createStatblock } from '../create/createFlow';

/** The statblock of the note's first fence (see `fenceStatblock`); null when the note holds no fence. */
export async function fenceValues(app: App, path: string): Promise<FenceValues | null> {
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return null;
  const params = parseStatblockFence(await app.vault.cachedRead(file))
    ?? (app.metadataCache.getFileCache(file)?.frontmatter?.statblock === 'inline' ? {} : null);
  return params ? fenceStatblock(app, params, path) : null;
}

/**
 * Creates a native statblock of the role from the fence of the note at
 * `path`, with `templateId` where given (the template of the fence's layout)
 * and the role's template otherwise, and opens it. Returns the new note's
 * path, or null when nothing was made (no fence, or the note could not be
 * written).
 */
export async function copyFenceIntoStatblock(
  app: App, path: string, collectionId: string | null, roleId: string, templateId?: TemplateId,
): Promise<string | null> {
  const fence = await fenceValues(app, path);
  if (!fence) return null;
  return createStatblock(app, { collectionId, roleId, templateId, name: fence.name, values: fence.values, from: 'note' });
}
