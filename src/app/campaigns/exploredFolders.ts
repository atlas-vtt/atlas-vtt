import { TFile, TFolder, type App } from 'obsidian';
import { hashText } from '../utils/hashing';
import { trashVaultItem } from '../utils/trashVaultItem';
import { CAMPAIGNS_FOLDER } from './campaignPaths';

/**
 * The folder in a campaign's folder that keeps what each of its players explored, as Foundry keeps a fog
 * exploration per user and scene: `explored/<map>/<floor>/<player id>.png`, a folder per map path and in it
 * one per level, each named by a hash, so a map's folder follows the map when it is renamed or moved and
 * goes with it when it is deleted, whatever floors it has.
 */
export const EXPLORED_FOLDER = 'explored';

/** A map's folder of explored memories in the campaign folder `campaign`. */
export const mapMemoryFolder = (campaign: string, mapPath: string): string => `${campaign}/${EXPLORED_FOLDER}/${hashText(mapPath)}`;

/** A floor's folder of explored memories in the campaign folder `campaign`: its map's, then its level's (none for a map of one floor). */
export const floorMemoryFolder = (campaign: string, mapPath: string, level: string | null): string => `${mapMemoryFolder(campaign, mapPath)}/${hashText(level ?? '')}`;

/** Map paths renamed since Atlas started, each by its path before, to the path it has now. */
const renamedMaps = new WeakMap<App, Map<string, string>>();

/**
 * Where the map once at `mapPath` is now: a running table writes what its players explored of a map
 * renamed meanwhile where the map went, not into a folder of the path it left.
 */
export function currentMapPath(app: App, mapPath: string): string {
  return renamedMaps.get(app)?.get(mapPath) ?? mapPath;
}

const foldersIn = (folder: TFolder | null): TFolder[] => (folder?.children ?? []).filter((child): child is TFolder => child instanceof TFolder);

/** Moves `source` to `target`, into what is there already: a memory kept at both places keeps the one at `target`, written later. */
async function moveInto(app: App, source: TFolder, target: string): Promise<void> {
  if (app.vault.getAbstractFileByPath(target) === null) return app.fileManager.renameFile(source, target);
  for (const child of [...source.children]) {
    const to = `${target}/${child.name}`;
    if (child instanceof TFolder) await moveInto(app, child, to);
    else if (app.vault.getAbstractFileByPath(to) === null) await app.fileManager.renameFile(child, to);
    else await trashVaultItem(app, child);
  }
  await trashVaultItem(app, source);
}

/**
 * Follows maps renamed or moved (`from` → `to`, scene files only) in every campaign: what players explored
 * of each goes with it. The renames are taken at once, before the first folder moves.
 */
export async function followMapMemories(app: App, moves: readonly { readonly from: string; readonly to: string }[]): Promise<void> {
  const renames = renamedMaps.get(app) ?? new Map<string, string>();
  renamedMaps.set(app, renames);
  for (const { from, to } of moves) {
    for (const [before, now] of renames) if (now === from) renames.set(before, to);
    renames.delete(to);
    renames.set(from, to);
  }
  const campaigns = foldersIn(app.vault.getFolderByPath(CAMPAIGNS_FOLDER));
  for (const { from, to } of moves) {
    for (const campaign of campaigns) {
      const source = app.vault.getFolderByPath(mapMemoryFolder(campaign.path, from));
      if (source !== null) await moveInto(app, source, mapMemoryFolder(campaign.path, to));
    }
  }
}

/** Trashes what players explored of the map at `mapPath`, in every campaign: its scene was deleted. */
export async function trashMapMemories(app: App, mapPath: string): Promise<void> {
  for (const campaign of foldersIn(app.vault.getFolderByPath(CAMPAIGNS_FOLDER))) {
    const folder = app.vault.getFolderByPath(mapMemoryFolder(campaign.path, mapPath));
    if (folder !== null) await trashVaultItem(app, folder);
  }
}

/** Trashes every memory `player` keeps in the campaign folder `campaign`, of every map and floor: they left the campaign. */
export async function trashPlayerMemories(app: App, campaign: string, player: string): Promise<void> {
  for (const map of foldersIn(app.vault.getFolderByPath(`${campaign}/${EXPLORED_FOLDER}`))) {
    for (const floor of foldersIn(map)) {
      const file = app.vault.getAbstractFileByPath(`${floor.path}/${player}.png`);
      if (file instanceof TFile) await trashVaultItem(app, file);
    }
  }
}
