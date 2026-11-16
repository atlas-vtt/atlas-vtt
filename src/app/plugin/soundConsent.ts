import type { App, Plugin } from 'obsidian';
import type { SoundKind } from '../sound/soundTypes';
import type { SoundDirector } from '../soundDirector/SoundDirector';
import { ConversionConsentModal, type ConversionConsentOptions } from '../soundLibrary/ConversionConsentModal';
import { isLinked } from '../soundLibrary/SoundRoots';
import type { SoundLibrary } from '../soundLibrary/SoundLibrary';
import { runInBackground } from '../utils/backgroundTask';

const KINDS: readonly SoundKind[] = ['music', 'ambience'];

export interface ConsentDialog {
  open(options: ConversionConsentOptions): { close(): void };
}

const realDialog = (app: App): ConsentDialog => ({
  open: (options) => {
    const modal = new ConversionConsentModal(app, options);
    modal.open();
    return modal;
  },
});

const folderNameOf = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

/**
 * Asks the GM what Atlas may do before it converts a linked folder: once per folder while sound is on, and again
 * once a folder is unlinked and linked anew; for a root without a choice whose walk ended, one dialog at a time.
 * Closing a dialog without a choice unlinks the folder (a vault folder for every device that shares its settings).
 * Returns the release.
 */
export function registerConversionConsent(
  plugin: Plugin,
  library: SoundLibrary,
  director: SoundDirector,
  dialog: ConsentDialog = realDialog(plugin.app),
): () => void {
  /** The folder each root was last asked about; one unlinked since is asked about again once it is linked. */
  const asked = new Map<SoundKind, string>();
  let showing = false;
  let disposed = false;
  let current: { kind: SoundKind; path: string; handle: { close(): void } | null } | null = null;

  /** Whether the root is still the folder that was asked about, and still without a choice. */
  const stillAsking = (kind: SoundKind, path: string): boolean => {
    const state = library.rootOf(kind);
    return !disposed && isLinked(state) && state.path === path && library.roots.originalsOf(kind) === null;
  };

  const ask = async (kind: SoundKind, path: string): Promise<void> => {
    try {
      const location = library.locationOf(kind);
      const canWrite = location ? await location.canWrite() : false;
      if (!location || !stillAsking(kind, path)) {
        showing = false;
        current = null;
        check();
        return;
      }
      const asking: NonNullable<typeof current> = { kind, path, handle: null };
      current = asking;
      asking.handle = dialog.open({
        folderName: folderNameOf(path),
        fileCount: library.filesOf(kind).length,
        canTrash: location.canTrash(),
        canWrite,
        onChoose: (choice) => {
          if (disposed) return;
          if (current === asking) current = null;
          if (stillAsking(kind, path)) {
            if (choice === null) library.roots.unlink(kind);
            else library.roots.setOriginals(kind, choice);
          }
          showing = false;
          check();
        },
      });
      // A modal that answered while opening has already reset `current`.
      if (current !== asking) asking.handle = null;
    } catch (error) {
      showing = false;
      current = null;
      check();
      throw error;
    }
  };

  /** A modal about a root that was relinked, or that got its choice elsewhere, closes without touching it. */
  const dropStale = (): void => {
    if (!current || stillAsking(current.kind, current.path)) return;
    current.handle?.close();
  };

  function check(): void {
    if (disposed || showing || !director.isOn) return;
    for (const kind of KINDS) {
      const state = library.rootOf(kind);
      if (!isLinked(state) || library.roots.originalsOf(kind) !== null || !library.isWalked(kind)) continue;
      if (asked.get(kind) === state.path) continue;
      asked.set(kind, state.path);
      showing = true;
      runInBackground(ask(kind, state.path), 'Asking before converting a linked sound folder');
      return;
    }
  }

  const forgetUnlinked = (): void => {
    for (const kind of KINDS) if (!isLinked(library.rootOf(kind))) asked.delete(kind);
  };

  const stops = [library.onChange(check), library.roots.onChange(() => { forgetUnlinked(); dropStale(); check(); }), director.subscribe(check)];
  check();
  return () => {
    disposed = true;
    for (const stop of stops) stop();
    current?.handle?.close();
    current = null;
  };
}
