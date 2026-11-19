import type { App } from 'obsidian';
import { AssetService } from '../services/AssetService';
import type { ExternalImport, ExternalImportOutcome } from '../services/collectionBundle/externalImport';
import { showNotice } from '../ui/notice';
import { t } from '../i18n';
import type { ArmariumRequest } from './armariumRequest';
import type { InstallState } from './armariumMessages';
import { ArmariumDownloadError, downloadRelease } from './armariumDownload';
import { ArmariumListError, fetchInstallableList, type InstallableListing } from './installableList';
import { installedListings } from './installedListings';

/** How long a list read for the installed items is used again before it is read anew. */
const LIST_REUSE_MS = 60_000;

export type StatusListener = (request: ArmariumRequest, state: InstallState) => void;

export interface InstallerDeps {
  /** Shows the import review of verified bytes; the outcome comes back through the handed callbacks. */
  review: (pending: ExternalImport) => void;
  fetchList?: () => Promise<InstallableListing[]>;
  download?: (listing: InstallableListing) => Promise<ArrayBuffer>;
  installed?: (listed: ReadonlySet<string>) => Promise<ArmariumRequest[]>;
  now?: () => number;
}

/** A failure the GM is told about in a notice; the install ends as `failed`. */
class InstallStop extends Error {
  constructor(readonly notice: string) {
    super(notice);
  }
}

const sameRequest = (a: ArmariumRequest, b: ArmariumRequest): boolean => a.uid === b.uid && a.version === b.version;

/**
 * Installs free Armarium collections, one at a time: reads the installable list, downloads the release through the
 * counting route (or the listing's own file on an allowed host), checks its size and SHA-256 and hands it to the
 * asset manager's import review, which the GM confirms or cancels. Every request may come from any web page (an
 * `obsidian://` link), so the review is the consent, and nothing is written without it. One per app.
 */
export class ArmariumInstaller {
  private static readonly installers = new WeakMap<App, ArmariumInstaller>();

  static open(app: App, deps: InstallerDeps): ArmariumInstaller {
    ArmariumInstaller.installers.get(app)?.release();
    const installer = new ArmariumInstaller(app, deps);
    ArmariumInstaller.installers.set(app, installer);
    return installer;
  }

  static forApp(app: App): ArmariumInstaller | null {
    return ArmariumInstaller.installers.get(app) ?? null;
  }

  static release(app: App): void {
    ArmariumInstaller.installers.get(app)?.release();
    ArmariumInstaller.installers.delete(app);
  }

  private current: { request: ArmariumRequest; state: InstallState } | null = null;
  private readonly listeners = new Set<StatusListener>();
  private list: { at: number; listings: InstallableListing[] } | null = null;
  private released = false;

  constructor(private readonly app: App, private readonly deps: InstallerDeps) {}

  /** Hears where every install stands, from the first download to its end. */
  onStatus(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return (): void => { this.listeners.delete(listener); };
  }

  isBusy(): boolean {
    return this.current !== null;
  }

  /**
   * Installs one release. Never rejects: whatever stops it ends in a notice (or the review's own dialog) and a
   * `failed` or `cancelled` status. A request while another runs is refused, the same one only reports where it is.
   */
  async install(request: ArmariumRequest): Promise<void> {
    if (this.released) return;
    if (this.current) {
      if (sameRequest(this.current.request, request)) this.emit(request, this.current.state);
      else {
        showNotice(t('armarium.busy'));
        this.emit(request, 'cancelled');
      }
      return;
    }
    this.current = { request, state: 'downloading' };
    this.emit(request, 'downloading');
    let state: InstallState = 'failed';
    try {
      state = await this.run(request);
    } catch (error) {
      if (error instanceof InstallStop) showNotice(error.notice);
      else {
        console.error('[Atlas] Installing from the Armarium failed:', error);
        showNotice(t('armarium.failed'));
      }
    } finally {
      this.current = null;
      this.emit(request, state);
    }
  }

  /** The releases of the Armarium's listings the vault holds; none when the list cannot be read. */
  async installedItems(): Promise<ArmariumRequest[]> {
    try {
      const listings = await this.listings(false);
      const listed = new Set(listings.map((listing) => listing.uid));
      const installed = this.deps.installed ?? ((uids: ReadonlySet<string>): Promise<ArmariumRequest[]> => installedListings(this.app, AssetService.getInstance(this.app), uids));
      return await installed(listed);
    } catch (error) {
      console.warn('[Atlas] The Armarium\'s installed collections could not be read:', error);
      return [];
    }
  }

  private async run(request: ArmariumRequest): Promise<InstallState> {
    const listing = await this.listingFor(request);
    const progress = showNotice(t('armarium.downloading', { name: listing.name }), 0);
    let bytes: ArrayBuffer;
    try {
      bytes = await (this.deps.download ?? downloadRelease)(listing);
    } catch (error) {
      console.error('[Atlas] Downloading from the Armarium failed:', error);
      const mismatch = error instanceof ArmariumDownloadError && error.reason === 'mismatch';
      throw new InstallStop(t(mismatch ? 'armarium.mismatch' : 'armarium.downloadFailed', { name: listing.name }));
    } finally {
      progress.hide();
    }
    if (this.released) return 'cancelled';
    const outcome = await this.review(request, new Blob([bytes], { type: 'application/zip' }));
    return outcome.kind;
  }

  /** The listing of the requested release, read anew: a page loaded earlier may offer a release that is gone. */
  private async listingFor(request: ArmariumRequest): Promise<InstallableListing> {
    let listings: InstallableListing[];
    try {
      listings = await this.listings(true);
    } catch (error) {
      console.error('[Atlas] Reading the Armarium\'s list failed:', error);
      const offline = error instanceof ArmariumListError && error.offline;
      throw new InstallStop(t(offline ? 'armarium.unreachable' : 'armarium.listFailed'));
    }
    const listing = listings.find((entry) => entry.uid === request.uid);
    if (!listing) throw new InstallStop(t('armarium.notListed'));
    if (listing.version !== request.version) throw new InstallStop(t('armarium.versionChanged', { name: listing.name, version: listing.version }));
    return listing;
  }

  private async listings(fresh: boolean): Promise<InstallableListing[]> {
    const now = (this.deps.now ?? Date.now)();
    if (!fresh && this.list && now - this.list.at < LIST_REUSE_MS) return this.list.listings;
    const listings = await (this.deps.fetchList ?? fetchInstallableList)();
    this.list = { at: now, listings };
    return listings;
  }

  /** Hands the bytes to the import review and waits for the GM; only the first outcome counts. */
  private review(request: ArmariumRequest, data: Blob): Promise<ExternalImportOutcome> {
    return new Promise((resolve) => {
      let settled = false;
      this.deps.review({
        data,
        onReview: () => {
          if (settled || !this.current) return;
          this.current.state = 'reviewing';
          this.emit(request, 'reviewing');
        },
        onSettled: (outcome) => {
          if (settled) return;
          settled = true;
          resolve(outcome);
        },
      });
    });
  }

  private emit(request: ArmariumRequest, state: InstallState): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(request, state);
      } catch (error) {
        console.error('[Atlas] An Armarium status listener failed:', error);
      }
    }
  }

  private release(): void {
    this.released = true;
    this.listeners.clear();
  }
}
