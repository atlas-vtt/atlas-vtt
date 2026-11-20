import type { App } from 'obsidian';
import { AtlasAccount } from '../../account/AtlasAccount';
import { obsidianHttp } from '../../account/obsidianHttp';
import type { AssetService } from '../../services/AssetService';
import { exportCollectionBundle, type ExportChoice, type ExportPreview } from '../../services/collectionBundle/collectionExport';
import { sha256 } from '../../utils/hashing';
import { t } from '../../i18n';
import { ArmariumApi } from './armariumApi';
import { systemOfPreset } from './listingDraft';
import { ShareSession } from './ShareSession';

/** Why a wait ended early: the signal's own reason when it is an error. */
const abortReason = (signal: AbortSignal): Error => (signal.reason instanceof Error ? signal.reason : new Error('Aborted'));

/** Waits `ms` on the main window's clock; rejects once `signal` aborts. */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortReason(signal));
    const stop = (): void => {
      window.clearTimeout(timer);
      reject(abortReason(signal));
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', stop);
      resolve();
    }, ms);
    signal.addEventListener('abort', stop, { once: true });
  });
}

/**
 * A share of the previewed collection with this app's account, the Armarium's API and the vault's export; null when
 * the account is not set up (Atlas is still loading). `committed` hears the release recorded after a publish.
 */
export function createShareSession(app: App, assets: AssetService, preview: ExportPreview, committed: (choice: ExportChoice) => Promise<void>): ShareSession | null {
  const account = AtlasAccount.forApp(app);
  if (account === null) return null;
  const api = new ArmariumApi({ http: obsidianHttp, token: () => account.token(), signedOut: () => account.signedOutByServer() });
  return new ShareSession({
    account,
    api,
    preview,
    collectionSystem: systemOfPreset(preview.collection.settings.systemPresetId),
    pack: (shared, choice, onProgress) => exportCollectionBundle(app, assets, shared, choice, onProgress),
    nameTaken: (name) => assets.isCollectionNameTaken(name, preview.collection.id),
    nameTakenText: (name) => t('bundle.nameTaken', { name: name.trim() }),
    committed,
    sha256: (bytes) => sha256(bytes),
    sleep: abortableSleep,
  });
}
