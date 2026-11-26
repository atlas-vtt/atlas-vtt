import { type App, type TFile } from 'obsidian';
import type { AssetService } from '../services/AssetService';
import { primaryPath } from '../services/vault-sync/assetFiles';
import { linkSafeName } from './atlasLinkTargets';
import { t } from '../i18n';
import { showNotice } from '../ui/notice';
import { copyTextWhenReady } from '../platform/clipboardWrites';

export interface AtlasLinkOptions {
  /** The name the link shows; left out where it is the file's own name. */
  name?: string;
  /** A scene snapshot the link names after its `#`. */
  snapshot?: string;
}

/**
 * A link to an Atlas file in the format the vault's link settings ask for
 * (wikilink or Markdown, shortest path or full), from the note at `sourcePath`.
 * Encounter files are named by id, so their link shows the encounter's name.
 */
export function atlasLink(app: App, file: TFile, sourcePath: string, options: AtlasLinkOptions = {}): string {
  const subpath = options.snapshot ? `#${linkSafeName(options.snapshot)}` : undefined;
  const alias = options.name && options.name !== file.basename ? linkSafeName(options.name) : undefined;
  return app.fileManager.generateMarkdownLink(file, sourcePath, subpath, alias);
}

/** Copies a link to the Atlas file at `path`, to paste into any note (`!` before it embeds it). */
export async function copyAtlasLink(app: App, path: string, options: AtlasLinkOptions = {}): Promise<void> {
  const file = app.vault.getFileByPath(path);
  if (!file) {
    showNotice(t('atlasLinks.fileMissing'));
    return;
  }
  await navigator.clipboard.writeText(atlasLink(app, file, '', options));
  showNotice(t('atlasLinks.copied'));
}

/** Copies a link to the file of the scene or encounter `assetId`, named like the asset. */
export async function copyAssetLink(app: App, assets: AssetService, assetId: string): Promise<void> {
  let missing = false;
  // The asset is looked up while the clipboard already waits for its link: asked within the press.
  const link = assets.getAssetById(assetId).then((asset) => {
    const path = asset ? primaryPath(asset) : null;
    const file = path ? app.vault.getFileByPath(path) : null;
    if (!asset || !file) {
      missing = true;
      throw new Error(`No file for the asset ${assetId}`);
    }
    return atlasLink(app, file, '', { name: asset.name });
  });
  try {
    await copyTextWhenReady(link);
  } catch (error) {
    if (!missing) throw error;
    showNotice(t('atlasLinks.fileMissing'));
    return;
  }
  showNotice(t('atlasLinks.copied'));
}
