import type { Plugin } from 'obsidian';
import { t } from '../i18n';
import { presentedScene } from '../services/PresentedScene';
import { presentationTargetsRegistered, subscribePresentationTargets } from '../services/presentationTargets';
import { presentActiveTabToPlayers, stopPresenting } from '../services/presentToPlayers';

const PRESENT = 'present-to-players';
const STOP = 'stop-presenting';

/**
 * Present to players and Stop presenting exist only while an extension has registered a presentation target
 * (`presentationTargetsRegistered`): they are added with the first target and removed with the last, so stock Atlas
 * keeps its one command, "Send current map to player view". Returns the stop, which removes them too.
 */
export function syncPresentingCommands(plugin: Plugin): () => void {
  let added = false;
  const remove = (): void => {
    if (!added) return;
    added = false;
    plugin.removeCommand(PRESENT);
    plugin.removeCommand(STOP);
  };
  const sync = (): void => {
    if (!presentationTargetsRegistered()) {
      remove();
      return;
    }
    if (added) return;
    added = true;
    plugin.addCommand({ id: PRESENT, name: t('command.presentToPlayers'), callback: () => void presentActiveTabToPlayers(plugin.app) });
    plugin.addCommand({
      id: STOP,
      name: t('command.stopPresenting'),
      checkCallback: (checking) => {
        if (!presentedScene.current()) return false;
        if (!checking) stopPresenting();
        return true;
      },
    });
  };
  sync();
  const unsubscribe = subscribePresentationTargets(sync);
  return () => {
    unsubscribe();
    remove();
  };
}
