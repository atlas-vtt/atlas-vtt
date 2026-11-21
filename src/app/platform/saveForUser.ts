import type { App } from 'obsidian';
import { t } from '../i18n';
import { ensureFolder, isPathTaken } from '../plugin/vaultFolders';
import { ATLAS_VTT_DIR, INVALID_NAME_CHARACTERS } from '../services/assetPaths';
import { freePathIn } from '../services/collectionBundle/pathRemap';
import { showNotice, showNoticeWithAction } from '../ui/notice';
import { isDesktopApp } from './desktopOnly';

/** Where a tablet keeps the files Atlas hands the user: a visible folder of the vault, which no asset is read from. */
export const EXPORTS_FOLDER = `${ATLAS_VTT_DIR}/exports`;

/** How long the notice that names the saved file stays: time to read it and reach Share. */
const SAVED_NOTICE_MS = 15_000;

/** How a file reached the user: the browser's download in the desktop app, a file of the vault elsewhere. */
export type SavedForUser = { kind: 'download' } | { kind: 'vault'; path: string };

/** What of `navigator` hands a file to the system's share sheet. */
export type FileSharing = Pick<Navigator, 'share' | 'canShare'>;

/** What saving reads of the device; a test's own, else this device's. */
export interface SaveDevice {
  desktop: boolean;
  /** The browser's download of `blob` under `name`. */
  download: (blob: Blob, name: string) => void;
  sharing: Partial<FileSharing> | undefined;
  /** Says where the file went, with `share` offered where the system can take the file. */
  told: (message: string, share: (() => void) | null) => void;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.body.createEl('a', { href: url, attr: { download: fileName } });
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function thisDevice(): SaveDevice {
  return {
    desktop: isDesktopApp(),
    download: downloadBlob,
    sharing: typeof navigator === 'undefined' ? undefined : navigator,
    told: (message, share) => {
      if (share) showNoticeWithAction(message, t('deviceFiles.share'), share, SAVED_NOTICE_MS);
      else showNotice(message, SAVED_NOTICE_MS);
    },
  };
}

/** `name` as a vault file may be called. */
function vaultFileName(name: string): string {
  return name.replace(new RegExp(INVALID_NAME_CHARACTERS.source, 'g'), '-').replace(/^\.+/, '').trim() || 'export';
}

/**
 * Hands `file` to the system's share sheet, or null where it takes no files (or none of this
 * type). To be called from a press: the sheet opens only within one.
 */
export function fileShare(sharing: Partial<FileSharing> | undefined, file: File): (() => void) | null {
  if (typeof sharing?.share !== 'function' || typeof sharing.canShare !== 'function') return null;
  const data: ShareData = { files: [file] };
  try {
    if (!sharing.canShare(data)) return null;
  } catch {
    return null;
  }
  // A sheet the user closes rejects too: nothing to say about either.
  return () => { sharing.share?.(data).catch(() => undefined); };
}

/**
 * Gives the user a file Atlas made (an exported collection): the browser's download in the desktop
 * app. A tablet's web view ignores downloads, so there the file is written into the vault
 * (`EXPORTS_FOLDER`, numbered where the name is taken), a notice says where, and the notice offers
 * the system's share sheet where that takes the file. Throws where the vault could not be written.
 */
export async function saveForUser(app: App, name: string, bytes: Blob | ArrayBuffer, type: string, device: SaveDevice = thisDevice()): Promise<SavedForUser> {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type });
  if (device.desktop) {
    device.download(blob, name);
    return { kind: 'download' };
  }
  const folder = await ensureFolder(app, EXPORTS_FOLDER);
  const path = freePathIn(folder.path, vaultFileName(name), (candidate) => isPathTaken(app, candidate));
  await app.vault.createBinary(path, await blob.arrayBuffer());
  const saved = path.slice(path.lastIndexOf('/') + 1);
  device.told(t('deviceFiles.saved', { name: saved, folder: folder.path }), fileShare(device.sharing, new File([blob], saved, { type })));
  return { kind: 'vault', path };
}
