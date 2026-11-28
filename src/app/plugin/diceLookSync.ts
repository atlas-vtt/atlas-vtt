import type { Plugin } from 'obsidian';
import { applyDiceLook } from '../dice3d/diceLookRuntime';
import type { SettingsService } from '../services/SettingsService';

/**
 * Keeps the dice painted with the look in Atlas' settings: at start, when the
 * setting changes, and when Obsidian's CSS changes, since accent dice take the
 * accent colour and a theme or accent switch changes it.
 */
export function registerDiceLookSync(plugin: Plugin, settings: SettingsService): void {
  let applied = '';
  const apply = (force: boolean): void => {
    const look = settings.get('diceLook');
    const key = `${look.colour}:${look.font}`;
    if (!force && key === applied) return;
    applied = key;
    void applyDiceLook(look);
  };
  apply(true);
  plugin.register(settings.onChange(() => apply(false)));
  plugin.registerEvent(plugin.app.workspace.on('css-change', () => apply(true)));
}
