import { useEffect, useState } from 'react';
import type { App } from 'obsidian';
import { SettingsService } from '../../services/SettingsService';

/** Whether players see the DM's dice rolls ("Show dice rolls"), kept current as the setting changes. */
export function useShowDiceRolls(app: App | undefined): boolean {
  const settings = SettingsService.forApp(app);
  const [show, setShow] = useState(() => settings?.getLocalPlayerViewSettings().showDiceRolls ?? false);

  useEffect(() => {
    if (!settings) return;
    setShow(settings.getLocalPlayerViewSettings().showDiceRolls);
    return settings.onChange(() => setShow(settings.getLocalPlayerViewSettings().showDiceRolls));
  }, [settings]);

  return show;
}
