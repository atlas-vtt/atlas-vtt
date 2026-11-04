import { useEffect, useState } from 'react';
import type { App } from 'obsidian';
import { SettingsService } from '../../services/SettingsService';

/** Whether new scenes look for the grid of their map, kept current as the setting changes, and its switch. */
export function useDetectGridOnNewScenes(app: App | undefined): { detects: boolean; toggle: () => void } {
  const settings = SettingsService.forApp(app);
  const [detects, setDetects] = useState(() => settings?.detectsGridOnNewScenes() ?? true);

  useEffect(() => {
    if (!settings) return;
    setDetects(settings.detectsGridOnNewScenes());
    return settings.onChange(() => setDetects(settings.detectsGridOnNewScenes()));
  }, [settings]);

  return { detects, toggle: () => settings?.setDetectGridOnNewScenes(!detects) };
}
