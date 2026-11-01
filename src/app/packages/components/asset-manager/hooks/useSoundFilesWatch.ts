import { useEffect } from 'react';
import { debounce, type App } from 'obsidian';

/** How long the vault stays quiet before the Sounds tab looks at its files again. */
const QUIET_MS = 500;

/** Reloads the cards while the Sounds tab shows: a card says whether its audio is here, and a sync may deliver a long track well after its record. */
export function useSoundFilesWatch(app: App, showing: boolean, reload: () => Promise<void>): void {
  useEffect(() => {
    if (!showing) return;
    const quietly = debounce(() => { void reload(); }, QUIET_MS, true);
    const refs = [app.vault.on('create', quietly), app.vault.on('delete', quietly), app.vault.on('rename', quietly)];
    return () => {
      quietly.cancel();
      for (const ref of refs) app.vault.offref(ref);
    };
  }, [app, showing, reload]);
}
