/**
 * What extensions keep on scene records (`data.extensions`) belongs to this vault: it never travels in a
 * bundle, a copy or a fingerprint, so an exported scene carries none and an installed one starts without.
 * `data.createdBy`, the extension that added the scene, and `data.createdImages`, the images Atlas wrote for it, are
 * dropped the same way: a copy or an installed scene is the GM's, never an extension's to replace. Registered note properties
 * (`bundleNoteKeys`) are stripped from exported and installed notes likewise.
 */
import type { BundleFile } from './bundleFormat';
import { withoutFrontmatterKeys } from './frontmatterKeys';

// The scene side lives with the library's own rules (`sceneIndexData.ts`); bundles strip the same keys.
export { withoutJsonExtensions, withoutSceneExtensions } from '../sceneIndexData';

/** Whether the bundled file is a Markdown note: a linked note, a statblock note or a loot item, whatever its role. */
export const isNote = (file: Pick<BundleFile, 'vaultPath'>): boolean => /\.md$/i.test(file.vaultPath);

/** A note's text without the frontmatter properties in `keys`; any other file's text as it is. */
export function withoutNoteKeys(file: Pick<BundleFile, 'vaultPath'>, text: string, keys: ReadonlySet<string>): string {
  return isNote(file) ? withoutFrontmatterKeys(text, keys) : text;
}
