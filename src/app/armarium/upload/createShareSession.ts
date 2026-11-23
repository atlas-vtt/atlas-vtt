import type { App } from 'obsidian';
import { AtlasAccount } from '../../account/AtlasAccount';
import { obsidianHttp } from '../../account/obsidianHttp';
import type { AssetService } from '../../services/AssetService';
import { exportCollectionBundle, type ExportChoice, type ExportPreview } from '../../services/collectionBundle/collectionExport';
import { renderCover } from '../../services/collectionBundle/collectionCover';
import { exportItemBundle } from '../../services/itemBundle/itemExport';
import { fetchBytes } from '../../services/stockPacks/verifiedFetch';
import { itemListingUid } from '../../services/itemBundle/itemListingUid';
import { recordItemName } from '../../services/itemBundle/vaultItems';
import { SystemPresetFiles } from '../../services/systemPresets/SystemPresetFiles';
import { TemplateLibrary } from '../../statblocks/library/TemplateLibrary';
import { sha256 } from '../../utils/hashing';
import { t } from '../../i18n';
import { ArmariumApi } from './armariumApi';
import { ItemShareSession } from './ItemShareSession';
import { systemOfPreset, systemOfSharedPreset } from './listingDraft';
import { ShareSession } from './ShareSession';
import type { SharedItem } from './shareState';
import { templateCardPictures, type CardPictures } from './cardPictures/templateCardPictures';
import type { SystemId } from './uploadContract';

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

/** The system a collection's listing starts with: its built-in system's, else the known system its own game system's name means. */
function collectionSystem(app: App, presetId: string | undefined): SystemId | null {
  const builtIn = systemOfPreset(presetId);
  if (builtIn !== null || presetId === undefined) return builtIn;
  const entry = SystemPresetFiles.forApp(app)?.entries().find((each) => each.id === presetId);
  const name = entry === undefined ? null : recordItemName('system-preset', entry);
  return name === null ? null : systemOfSharedPreset(name);
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
    collectionSystem: collectionSystem(app, preview.collection.settings.systemPresetId),
    pack: (shared, choice, onProgress) => exportCollectionBundle(app, assets, shared, choice, onProgress),
    nameTaken: (name) => assets.isCollectionNameTaken(name, preview.collection.id),
    nameTakenText: (name) => t('bundle.nameTaken', { name: name.trim() }),
    committed,
    sha256: (bytes) => sha256(bytes),
    sleep: abortableSleep,
  });
}

/** The template's card for its listing page; none where it cannot be drawn, and the page then shows the card's plan. */
async function cardPicturesOf(app: App, id: string): Promise<CardPictures | undefined> {
  const entry = TemplateLibrary.forApp(app).get(id);
  if (entry === null) return undefined;
  try {
    return await templateCardPictures(app, entry.template, entry.name);
  } catch (error) {
    console.warn('[Atlas] The template\'s card could not be drawn for its listing:', error);
    return undefined;
  }
}

/**
 * A share of one vault item with this app's account and the Armarium's API; null when the account is not set up. A
 * template's own description starts a new listing's.
 */
export function createItemShareSession(app: App, item: SharedItem): ItemShareSession | null {
  const account = AtlasAccount.forApp(app);
  if (account === null) return null;
  const api = new ArmariumApi({ http: obsidianHttp, token: () => account.token(), signedOut: () => account.signedOutByServer() });
  const description = item.kind === 'statblock-template' ? TemplateLibrary.forApp(app).get(item.id)?.template.description ?? null : null;
  return new ItemShareSession({
    account,
    api,
    item,
    description,
    listingUid: (accountId) => itemListingUid(accountId, item.kind, item.id),
    pack: async (uid, version, notes, cover) => {
      const previews = item.kind === 'statblock-template' ? await cardPicturesOf(app, item.id) : undefined;
      const exported = await exportItemBundle(app, item, { uid, version, notes, cover: cover === null ? undefined : await renderCover(cover), previews });
      return { fileName: exported.fileName, bytes: exported.bytes, name: exported.manifest.item.name };
    },
    fetchCover: async (url) => {
      try {
        return new Blob([await fetchBytes(url)]);
      } catch (error) {
        console.warn('[Atlas] The listing\'s cover could not be fetched:', error);
        return null;
      }
    },
    sha256: (bytes) => sha256(bytes),
    sleep: abortableSleep,
  });
}
