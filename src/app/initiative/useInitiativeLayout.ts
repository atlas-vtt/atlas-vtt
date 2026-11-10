import { useAtlasSettings } from '../keyboard/useMapHotkeys';
import { DEFAULT_INITIATIVE_LAYOUT, type InitiativeLayout } from './initiativeLayout';

/** The initiative lists' layout (`SettingsService.initiativeLayout`), followed as it changes, and a way to change it. */
export function useInitiativeLayout(): { layout: InitiativeLayout; setLayout: (changes: Partial<InitiativeLayout>) => void } {
  const settings = useAtlasSettings();
  return {
    layout: settings?.initiativeLayout() ?? DEFAULT_INITIATIVE_LAYOUT,
    setLayout: (changes) => settings?.setInitiativeLayout(changes),
  };
}
