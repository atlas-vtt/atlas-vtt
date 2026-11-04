import type { App } from 'obsidian';
import { isAssetMetadata } from './assetMetadataGuards';
import type { TokenAsset } from './AssetService';
import { getDataFilePath } from '../utils/dataFileMigration';
import { t } from '../i18n';

export class AssetRegistrationUncertainError extends Error {
  constructor() {
    super(t('recovery.uncertain'));
    this.name = 'AssetRegistrationUncertainError';
  }
}

/** A failed legacy mirror write does not undo a successful authoritative save. */
export async function wasTokenRegistrationSaved(app: App, token: TokenAsset): Promise<boolean> {
  try {
    const primary = getDataFilePath('atlas-vtt/assets-metadata.json');
    const path = await app.vault.adapter.exists(primary) ? primary : 'atlas-vtt/assets-metadata.json';
    if (!await app.vault.adapter.exists(path)) return false;
    const data: unknown = JSON.parse(await app.vault.adapter.read(path));
    if (!isAssetMetadata(data)) throw new Error('Invalid asset metadata');
    const saved = data.assets[token.id];
    return saved?.type === 'token' && saved.imagePath === token.imagePath && saved.statblockPath === token.statblockPath;
  } catch {
    throw new AssetRegistrationUncertainError();
  }
}
