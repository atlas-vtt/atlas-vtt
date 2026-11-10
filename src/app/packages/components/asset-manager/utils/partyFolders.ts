import type { Folder } from '../types';

/** The folders and every folder above them, by the folders' parents. */
function withAncestors(start: Iterable<string>, parentOf: ReadonlyMap<string, string | null>): Set<string> {
  const reached = new Set<string>();
  for (const first of start) {
    for (let id: string | null = first; id !== null && !reached.has(id); id = parentOf.get(id) ?? null) reached.add(id);
  }
  return reached;
}

/**
 * The folders of the Characters tab without those only player characters fill: a folder
 * that holds player characters, in it or below it, and no other token is left out, so it
 * does not stand there empty once its tokens joined the party. An empty folder stays, and
 * so does every folder above one that stays.
 */
export function withoutPartyOnlyFolders(
  folders: Folder[],
  shown: ReadonlyArray<{ folderId?: string | null | undefined }>,
  partyFolderIds: ReadonlySet<string>,
): Folder[] {
  if (partyFolderIds.size === 0) return folders;
  const parentOf = new Map(folders.map((folder) => [folder.id, folder.parentId ?? null]));
  const holdsParty = withAncestors(partyFolderIds, parentOf);
  const holdsOthers = withAncestors(shown.flatMap((asset) => (asset.folderId ? [asset.folderId] : [])), parentOf);
  const stays = folders.filter((folder) => !holdsParty.has(folder.id) || holdsOthers.has(folder.id)).map((folder) => folder.id);
  const kept = withAncestors(stays, parentOf);
  return folders.filter((folder) => kept.has(folder.id));
}

/**
 * Where an open folder leads when it is not shown: the folder itself while it shows (or is
 * none this tab knows of), else the nearest folder above it that shows, else the root (null).
 */
export function nearestShownFolder(folderId: string | null, all: readonly Folder[], shown: readonly Folder[]): string | null {
  const shownIds = new Set(shown.map((folder) => folder.id));
  const parentOf = new Map(all.map((folder) => [folder.id, folder.parentId ?? null]));
  let id = folderId;
  while (id !== null && parentOf.has(id) && !shownIds.has(id)) id = parentOf.get(id) ?? null;
  return id;
}
