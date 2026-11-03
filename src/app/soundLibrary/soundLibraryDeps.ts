import { FileSystemAdapter, Platform, TFolder, type App } from 'obsidian';
import { systemTrash } from '../services/electronRemote';
import { SettingsService } from '../services/SettingsService';
import type { SoundKind } from '../sound/soundTypes';
import { readAudioSecondsAt } from './audioDuration';
import { ExternalLocation } from './externalLocation';
import { nodeFilesOf } from './nodeFiles';
import type { SoundLibraryDeps } from './SoundLibrary';
import { SoundRoots, type SoundRootFacts } from './SoundRoots';
import { VaultLocation } from './vaultLocation';

const localKey = (kind: SoundKind): string => `atlas-vtt:sound-root:${kind}`;

const vaultFolderOf = (app: App): string | null => (app.vault.adapter instanceof FileSystemAdapter ? app.vault.adapter.getBasePath() : null);

function rootFacts(app: App): SoundRootFacts {
  const settings = (): SettingsService | undefined => SettingsService.forApp(app);
  return {
    shared: () => settings()?.getSoundRoots() ?? {},
    setShared: (roots) => settings()?.setSoundRoots(roots),
    onSharedChange: (listener) => settings()?.onChange(listener) ?? (() => undefined),
    local: (kind) => {
      const path: unknown = app.loadLocalStorage(localKey(kind));
      return typeof path === 'string' && path !== '' ? path : null;
    },
    setLocal: (kind, path) => app.saveLocalStorage(localKey(kind), path),
    vaultBase: () => vaultFolderOf(app),
    realPath: async (path) => {
      const files = nodeFilesOf(window);
      return files ? files.fs.promises.realpath(path).catch(() => path) : path;
    },
  };
}

/** A URL a media element loads a file on disk from, through the scheme Obsidian serves local files with. */
function diskResourceUrl(absolute: string): string {
  return `${Platform.resourcePathPrefix}${absolute.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/').replace(/^\//, '')}`;
}

/** What the library runs on in Obsidian. */
export function realLibraryDeps(app: App): SoundLibraryDeps {
  const roots = new SoundRoots(rootFacts(app));
  const renamed = app.vault.on('rename', (file, oldPath) => {
    if (file instanceof TFolder) roots.followVaultMove(oldPath, file.path);
  });
  return {
    roots,
    open: (root) => {
      if (root.status === 'vault') return new VaultLocation(app, root.path);
      const files = nodeFilesOf(window);
      return files ? new ExternalLocation(root.path, { files, trashItem: systemTrash(window), resourceUrl: diskResourceUrl, vaultFolder: vaultFolderOf(app) }) : null;
    },
    probeSeconds: readAudioSecondsAt,
    dispose: () => {
      app.vault.offref(renamed);
      roots.dispose();
    },
  };
}
