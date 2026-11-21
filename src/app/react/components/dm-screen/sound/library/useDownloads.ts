import { useSyncExternalStore } from 'react';
import { t } from '../../../../../i18n';
import { useAtlasSettings } from '../../../../../keyboard/useMapHotkeys';
import { DownloadManager } from '../../../../../downloads/DownloadManager';
import type { DownloadJob } from '../../../../../downloads/downloadTypes';
import { useAtlasUI } from '../../../../root/AtlasUIContext';
import { showAtlasToast } from '../../../AtlasToast';

/** How long the toast that hid an offer stays, with its Undo. */
const HIDDEN_TOAST_MS = 6000;

/** The app's downloads: the DM screen's Sound page and the Sound tab show the same. */
export function useDownloadManager(): DownloadManager {
  return DownloadManager.forApp(useAtlasUI().app);
}

/** Every job; renders again only when the manager announces, a few times a second at most. */
export function useDownloadJobs(manager: DownloadManager): readonly DownloadJob[] {
  return useSyncExternalStore(manager.subscribe, manager.jobs);
}

/** One job, or null while there is none of that id. */
export function useDownloadJob(manager: DownloadManager, id: string): DownloadJob | null {
  return useSyncExternalStore(manager.subscribe, () => manager.job(id));
}

export interface OfferDismissal {
  dismissed: boolean;
  /** Hides the offer and says so, with Undo; absent where the settings cannot be reached. */
  dismiss: (() => void) | undefined;
}

/**
 * Whether the GM dismissed one of the Sound page's offers. It is the GM's preference (`SettingsService`,
 * `data.json`), so it follows other devices; the root's ⋯ menu still offers the download.
 */
export function useOfferDismissal(offerId: string, rootName: string): OfferDismissal {
  const settings = useAtlasSettings();
  if (!settings) return { dismissed: false, dismiss: undefined };
  return {
    dismissed: settings.isSoundOfferHidden(offerId),
    dismiss: () => {
      settings.setSoundOfferHidden(offerId, true);
      showAtlasToast(t('audio.library.offerHidden', { root: rootName }), HIDDEN_TOAST_MS, {
        label: t('history.undo'),
        run: () => settings.setSoundOfferHidden(offerId, false),
      });
    },
  };
}
