import type { App } from 'obsidian';
import type { SettingsService } from '../services/SettingsService';
import { ChangelogModal } from './ChangelogModal';
import releaseBundle from './releases.json';
import type { ReleaseBundle } from './types';
import { compareVersions, crossesFeatureRelease, isReleaseVersion, releaseBaseVersion } from './version';

export const CHANGELOG_STORAGE_KEY = 'atlas-vtt:changelog';

interface ChangelogServiceOptions {
  installedVersion: string;
  existingInstallation: boolean;
  releaseBuild: boolean;
  bundle?: ReleaseBundle;
}

/** One owner per plugin, independent of scene/player-window lifetimes. */
export class ChangelogService {
  private modal: ChangelogModal | undefined;
  private destroyed = false;
  private pendingOpen: 'automatic' | 'manual' | undefined;
  private lastAcknowledged: string | null = null;
  private readonly bundle: ReleaseBundle;

  constructor(
    private readonly app: App,
    private readonly settings: SettingsService,
    private readonly options: ChangelogServiceOptions,
  ) {
    this.bundle = options.bundle ?? releaseBundle;
    try {
      const stored: unknown = app.loadLocalStorage(CHANGELOG_STORAGE_KEY);
      this.lastAcknowledged = isReleaseVersion(stored) ? stored : null;
    } catch (error) {
      console.error('[Atlas] Could not read changelog acknowledgment', error);
    }
  }

  showUpdates(): void {
    if (this.destroyed || !this.options.releaseBuild || !this.matchesInstalledVersion()) return;
    // Beta builds neither announce nor move the acknowledgment, so the stable release they precede still does.
    if (!isReleaseVersion(this.options.installedVersion)) return;
    if ((!this.lastAcknowledged && !this.options.existingInstallation) || !this.settings.get('showChangelogOnUpdate')) {
      this.acknowledge();
      return;
    }
    if (this.lastAcknowledged && compareVersions(this.options.installedVersion, this.lastAcknowledged) <= 0) return;
    if (this.lastAcknowledged && this.settings.get('changelogMajorUpdatesOnly')
      && !crossesFeatureRelease(this.lastAcknowledged, this.options.installedVersion)) {
      this.acknowledge();
      return;
    }
    if (!this.isMainWindowActive()) {
      this.waitForMainWindow('automatic');
      return;
    }
    this.open();
  }

  open(): void {
    if (this.destroyed || this.modal) return;
    if (!this.isMainWindowActive()) {
      this.waitForMainWindow('manual');
      window.focus();
      return;
    }
    this.cancelPendingOpen();
    const currentVersion = this.options.installedVersion;
    const baseVersion = releaseBaseVersion(currentVersion);
    // Beta builds also carry their own pending notes, versioned as the build itself.
    const releases = this.bundle.releases.filter(release => release.version === currentVersion
      || (baseVersion !== null && compareVersions(release.version, baseVersion) <= 0),
    );
    const newVersions = new Set(releases.filter(release => this.lastAcknowledged
      ? compareVersions(release.version, this.lastAcknowledged) > 0
      : release.version === currentVersion,
    ).map(release => release.version));
    const modal = new ChangelogModal(this.app, {
      releases, currentVersion, newVersions,
      showOnUpdate: this.settings.get('showChangelogOnUpdate'),
      majorUpdatesOnly: this.settings.get('changelogMajorUpdatesOnly'),
      onPreferenceChange: enabled => this.settings.set('showChangelogOnUpdate', enabled),
      onMajorUpdatesChange: enabled => this.settings.set('changelogMajorUpdatesOnly', enabled),
      onClose: rendered => {
        if (this.modal !== modal) return;
        this.modal = undefined;
        if (!this.destroyed && rendered && this.matchesInstalledVersion()) this.acknowledge();
      },
    });
    this.modal = modal;
    try {
      modal.open();
    } catch (error) {
      this.modal = undefined;
      modal.close();
      console.error('[Atlas] Could not open changelog', error);
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.cancelPendingOpen();
    this.modal?.close();
    this.modal = undefined;
  }

  private isMainWindowActive(): boolean {
    return typeof activeWindow === 'undefined' || activeWindow === window;
  }

  private waitForMainWindow(mode: 'automatic' | 'manual'): void {
    if (this.pendingOpen !== 'manual') this.pendingOpen = mode;
    window.addEventListener('focus', this.onMainWindowFocus);
  }

  private readonly onMainWindowFocus = (): void => {
    // Let Obsidian update activeWindow before Modal.open reads it.
    queueMicrotask(() => {
      if (this.destroyed || !this.pendingOpen || !this.isMainWindowActive()) return;
      const mode = this.pendingOpen;
      this.cancelPendingOpen();
      if (mode === 'manual') this.open();
      else this.showUpdates();
    });
  };

  private cancelPendingOpen(): void {
    this.pendingOpen = undefined;
    window.removeEventListener('focus', this.onMainWindowFocus);
  }

  private matchesInstalledVersion(): boolean {
    return this.options.installedVersion === this.bundle.version;
  }

  private acknowledge(): void {
    const version = this.options.installedVersion;
    if (!isReleaseVersion(version)) return;
    if (this.lastAcknowledged && compareVersions(this.lastAcknowledged, version) >= 0) return;
    this.lastAcknowledged = version;
    try {
      this.app.saveLocalStorage(CHANGELOG_STORAGE_KEY, version);
    } catch (error) {
      console.error('[Atlas] Could not save changelog acknowledgment', error);
    }
  }
}
