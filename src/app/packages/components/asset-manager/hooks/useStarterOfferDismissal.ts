import type { App } from 'obsidian';
import { t } from '../../../../i18n';
import { useAtlasSettings } from '../../../../keyboard/useMapHotkeys';
import { SettingsService } from '../../../../services/SettingsService';
import { showAtlasToast } from '../../../../react/components/AtlasToast';
import { MOVED_TOAST_MS } from '../utils/moveNotice';

export interface StarterOfferDismissal {
  /** The sidebar does not offer the starter tokens in this collection. */
  dismissed: boolean;
  /** Hides the offer in this collection and says so, with Undo; absent while the collection's uid is unknown. */
  dismiss: (() => void) | undefined;
}

/**
 * Whether the GM hid the sidebar's starter tokens offer in the collection with `collectionUid`. It is the GM's
 * preference (`SettingsService`, `data.json`), keyed by the uid so a renamed folder keeps it, and follows the
 * settings as they change, another device's included.
 */
export function useStarterOfferDismissal(app: App | undefined, collectionUid: string | undefined): StarterOfferDismissal {
  const settings = useAtlasSettings(SettingsService.forApp(app));
  if (!settings || !collectionUid) return { dismissed: false, dismiss: undefined };
  return {
    dismissed: settings.isStarterOfferHidden(collectionUid),
    dismiss: () => {
      settings.setStarterOfferHidden(collectionUid, true);
      showAtlasToast(t('am.bestiary.hidden'), MOVED_TOAST_MS, {
        label: t('history.undo'),
        run: () => settings.setStarterOfferHidden(collectionUid, false),
      });
    },
  };
}
