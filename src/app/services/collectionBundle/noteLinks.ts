import type { App } from 'obsidian';
import type { BundleFile, BundleFileRole } from './bundleFormat';

/** Audio and video stay behind, like a collection's music: they would make a bundle too large to pass on. */
const ATTACHMENT = /\.(png|jpe?g|webp|gif|avif|bmp|svg|pdf)$/i;

/** The files whose links are followed: a loot item names the rules it comes from as a pinned note names its places. */
const WALKED_ROLES: ReadonlySet<BundleFileRole> = new Set<BundleFileRole>(['linked-note', 'loot-item']);

export interface LinkedFile {
  path: string;
  role: Extract<BundleFileRole, 'linked-note' | 'note-attachment'>;
}

/**
 * The notes `notePath` links to and the images and PDFs it shows, as Obsidian
 * resolved them. A link to a file that is gone resolves to nothing, so it is not listed.
 */
export function linkedFiles(app: App, notePath: string): LinkedFile[] {
  const targets = Object.keys(app.metadataCache.resolvedLinks[notePath] ?? {});
  return targets.flatMap((path): LinkedFile[] => {
    if (path === notePath) return [];
    if (path.toLowerCase().endsWith('.md')) return [{ path, role: 'linked-note' }];
    return ATTACHMENT.test(path) ? [{ path, role: 'note-attachment' }] : [];
  });
}

/**
 * `files` with everything their notes lead to: the notes that pins and
 * characters open and the item notes of loot bases are read for links, then
 * the notes found that way, until none is new. Each file reached lists the
 * notes that link to it. Statblock notes are not read: their links lead into
 * rulebooks. Only an export needs this; inside a vault a link finds its note
 * wherever a move or copy left it.
 */
export function withLinkedFiles(app: App, files: readonly BundleFile[]): BundleFile[] {
  const known = new Map(files.map((file): [string, BundleFile] => [file.vaultPath, { ...file, ...(file.linkedFrom && { linkedFrom: [...file.linkedFrom] }) }]));
  const notes = files.filter((file) => WALKED_ROLES.has(file.role) && file.vaultPath.toLowerCase().endsWith('.md')).map((file) => file.vaultPath);
  // Notes found on the way join the list, so the walk goes level by level and ends once every note was read.
  for (const note of notes) {
    for (const { path, role } of linkedFiles(app, note)) {
      const file = known.get(path);
      if (file) {
        // A file that travels with the collection itself (a random table's note) keeps travelling whatever links to it.
        if (file.owners || file.linkedFrom) (file.linkedFrom ??= []).push(note);
        continue;
      }
      known.set(path, { vaultPath: path, role, linkedFrom: [note] });
      if (role === 'linked-note') notes.push(path);
    }
  }
  return [...known.values()];
}
