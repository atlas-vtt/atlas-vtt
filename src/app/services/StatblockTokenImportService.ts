import { withStatblockImportLock } from './statblockImportLock';
import { TFile, normalizePath, type App } from 'obsidian';
import { AssetService, type TokenAsset } from './AssetService';
import { AssetThumbnailService } from './AssetThumbnailService';
import { AssetRegistrationUncertainError } from './assetRegistrationRecovery';
import { t } from '../i18n';
import { requireResolvedBestiary, statblockImportCandidate, statblockLookup, type StatblockImportCandidate, type StatblockLookup } from './statblockImportCandidates';
import { discardAssetFiles, writeAssetImage } from './assetImageFiles';
import { vaultImageFile } from '../packages/components/asset-manager/token-creator/vaultImageFile';
import type { ProcessedImage } from '../imageProcessing/imageProcessing';
import { convertTokenArt } from '../packages/components/asset-manager/token-creator/tokenImages';
import { workSlices } from '../utils/workSlices';

export interface StatblockImportItem {
  path: string;
  name: string;
  status: 'created' | 'skipped' | 'failed';
  message: string;
  asset?: TokenAsset;
  uncertain?: boolean;
}
export interface StatblockImportResult {
  items: StatblockImportItem[];
  cancelled: boolean;
  uncertain: boolean;
}
/** A note whose artwork is converting while earlier notes are registered. */
interface ConvertingImport {
  path: string;
  name: string;
  showRing: boolean;
  converted: Promise<ProcessedImage>;
}
type PlannedImport = ConvertingImport | { item: StatblockImportItem };

export interface StatblockImportOptions {
  signal?: AbortSignal;
  ringByPath?: Readonly<Record<string, boolean>>;
  onProgress?: (completed: number, total: number) => void;
}

/** A user-triggered local import. No network requests or changes to source notes; artwork is converted like the token creator's. */
export class StatblockTokenImportService {
  constructor(private readonly app: App, private readonly assets = AssetService.getInstance(app)) {}

  /** Every note that defines a statblock, with its import status; `onProgress` counts the notes checked. */
  async scan(signal?: AbortSignal, onProgress?: (done: number, total: number) => void): Promise<StatblockImportCandidate[]> {
    const bestiary = requireResolvedBestiary();
    const lookup = statblockLookup(await this.assets.getTokenAssets(), bestiary);
    const candidates: StatblockImportCandidate[] = [];
    const files = this.app.vault.getMarkdownFiles();
    const pause = workSlices();
    for (const [index, file] of files.entries()) {
      await pause();
      if (signal?.aborted) break;
      onProgress?.(index, files.length);
      try {
        const row = await statblockImportCandidate(this.app, file, lookup);
        if (row) candidates.push(row);
      } catch {
        // Only report recognized notes; unrelated unreadable files are not import candidates.
        if (lookup.creatures.has(file.path)) {
          candidates.push({ path: file.path, name: file.basename, status: 'conflict', detail: t('sbToken.readFailed') });
        }
      }
    }
    return candidates.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
  }

  async import(paths: readonly string[], collection: string, options: StatblockImportOptions = {}): Promise<StatblockImportResult> {
    return withStatblockImportLock(this.app, () => this.importPaths(paths, collection, options));
  }

  /**
   * Checks every note first and starts converting all their images at once;
   * the image workers bound how many run together. Tokens are then registered
   * in order as their images finish.
   */
  private async importPaths(paths: readonly string[], collection: string, options: StatblockImportOptions): Promise<StatblockImportResult> {
    const result: StatblockImportResult = { items: [], cancelled: false, uncertain: false };
    const conversion = new AbortController();
    const stopConversion = (): void => conversion.abort();
    options.signal?.addEventListener('abort', stopConversion, { once: true });
    try {
      const bestiary = requireResolvedBestiary();
      if (!(await this.assets.getCollections()).some(c => c.id === collection)) throw new Error('The destination collection no longer exists. Choose another collection.');
      const lookup = statblockLookup(await this.assets.getTokenAssets(), bestiary);
      const planned: PlannedImport[] = [];
      for (const path of new Set(paths.map(path => normalizePath(path)))) {
        planned.push(await this.plan(path, lookup, options.ringByPath?.[path] ?? false, conversion.signal));
      }
      for (const entry of planned) {
        if (options.signal?.aborted) break;
        const item = 'item' in entry ? entry.item : await this.register(entry, collection);
        result.items.push(item);
        options.onProgress?.(result.items.length, planned.length);
        if (item.uncertain) { result.uncertain = true; break; }
      }
      result.cancelled = Boolean(options.signal?.aborted);
      return result;
    } finally {
      options.signal?.removeEventListener('abort', stopConversion);
      conversion.abort();
      if (result.items.some(item => item.status === 'created')) this.app.workspace.trigger('atlas-vtt:refresh-assets');
    }
  }

  /** Revalidates a note and starts converting its artwork, or returns the item that explains why it cannot be imported. */
  private async plan(path: string, lookup: StatblockLookup, showRing: boolean, signal: AbortSignal): Promise<PlannedImport> {
    let name = path.split('/').pop()?.replace(/\.md$/, '') ?? path;
    try {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) return { item: { path, name, status: 'skipped', message: t('sbToken.noteGone') } };
      const row = await statblockImportCandidate(this.app, file, lookup);
      if (!row || row.status !== 'ready' || !row.imagePath) return { item: { path, name: row?.name ?? name, status: 'skipped', message: row?.detail ?? t('sbToken.unrecognized') } };
      name = row.name;
      const image = this.app.vault.getAbstractFileByPath(row.imagePath);
      if (!(image instanceof TFile)) return { item: { path, name, status: 'skipped', message: t('sbToken.imageGone') } };
      const converted = convertTokenArt(await vaultImageFile(this.app, image), showRing, signal);
      // Failures surface when the note is registered; notes never reached must not raise unhandled rejections.
      converted.catch(() => undefined);
      return { path, name, showRing, converted };
    } catch (error) {
      return { item: { path, name, status: 'failed', message: error instanceof Error ? error.message : t('sbToken.failed') } };
    }
  }

  private async register(entry: ConvertingImport, collection: string): Promise<StatblockImportItem> {
    const { path, name, showRing } = entry;
    let imagePath: string | undefined;
    let thumbnailPath: string | undefined;
    try {
      const { image, thumbnail } = await entry.converted;
      imagePath = await writeAssetImage(this.app, name, await image.arrayBuffer());
      thumbnailPath = await AssetThumbnailService.getInstance(this.app, this.assets).tryThumbnailForImage(imagePath, thumbnail);
      const asset = await this.assets.addTokenAsset({
        name, imagePath, statblockPath: path, showRing, tags: [], collection, ...(thumbnailPath && { thumbnailPath }),
      });
      return { path, name, status: 'created', message: t('sbToken.created'), asset };
    } catch (error) {
      // An unconfirmed write may have committed. Never delete the image in this case.
      if (error instanceof AssetRegistrationUncertainError) return { path, name, status: 'failed', message: error.message, uncertain: true };
      await discardAssetFiles(this.app, [imagePath, thumbnailPath]);
      return { path, name, status: 'failed', message: error instanceof Error ? error.message : t('sbToken.failed') };
    }
  }
}
