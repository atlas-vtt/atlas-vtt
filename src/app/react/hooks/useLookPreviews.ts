import { useEffect, useState } from 'react';
import type { App } from 'obsidian';
import { onCustomLooksChange } from '../../dice3d/customLooks';
import { renderLookPreviews } from '../../dice3d/lookPreviews';
import { SettingsService } from '../../services/SettingsService';

/**
 * A preview of every dice look to choose from, by choice value (`renderLookPreviews`): made again
 * when a look is added or removed, when the GM's colour or numbers change, and when Obsidian's CSS
 * changes (accent dice). A later render wins over one still running. Without `app` it makes none.
 */
export function useLookPreviews(app: App | undefined): Record<string, string> {
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [version, setVersion] = useState(0);
  const settings = SettingsService.forApp(app);

  useEffect(() => {
    let key = settings ? JSON.stringify(settings.getDiceLook()) : '';
    const bump = (): void => setVersion((value) => value + 1);
    const stops = [
      onCustomLooksChange(bump),
      settings?.onChange(() => {
        const next = JSON.stringify(settings.getDiceLook());
        if (next !== key) { key = next; bump(); }
      }),
    ];
    const ref = app?.workspace.on('css-change', bump);
    return (): void => {
      stops.forEach((stop) => stop?.());
      if (ref) app?.workspace.offref(ref);
    };
  }, [app, settings]);

  useEffect(() => {
    if (!app) return undefined;
    let alive = true;
    void renderLookPreviews().then((next) => { if (alive) setPreviews(next); });
    return (): void => { alive = false; };
  }, [app, version]);

  return previews;
}
