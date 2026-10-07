import type { Plugin } from 'obsidian';
import { customLook, onCustomLooksChange, type CustomDiceLook } from '../dice3d/customLooks';
import { applyDiceLook } from '../dice3d/diceLookRuntime';
import { onLateLookArt } from '../dice3d/customLookArt';
import { refreshDieArtwork } from '../dice3d/dieMesh';
import type { SettingsService } from '../services/SettingsService';

/** The extension look the settings chose, while its extension has it registered; null for Atlas's own. */
export function chosenCustomLook(settings: SettingsService): CustomDiceLook | null {
  const id = settings.getDiceLookId();
  return id === '' ? null : customLook(id);
}

/**
 * Keeps the dice painted with the look in Atlas' settings: at start, when the
 * setting changes, when Obsidian's CSS changes, since accent dice take the
 * accent colour and a theme or accent switch changes it, and when an extension
 * registers or removes the dice look chosen. A chosen look whose extension is
 * not loaded paints Atlas's own look; the choice stays, so it returns with it.
 */
export function registerDiceLookSync(plugin: Plugin, settings: SettingsService): void {
  let applied: { key: string; custom: CustomDiceLook | null } | null = null;
  const apply = (force: boolean): void => {
    const look = settings.getDiceLook();
    const custom = chosenCustomLook(settings);
    const key = `${look.colour}:${look.font}`;
    // The same registration with the same colour and font paints the same faces.
    if (!force && applied?.key === key && applied.custom === custom) return;
    applied = { key, custom };
    void applyDiceLook(look, undefined, custom);
  };
  apply(true);
  plugin.register(settings.onChange(() => apply(false)));
  plugin.register(onCustomLooksChange(() => apply(false)));
  plugin.registerEvent(plugin.app.workspace.on('css-change', () => apply(true)));
  // A look's art that arrived after its 10 s is in its art by now: the faces are painted again.
  plugin.register(onLateLookArt(() => refreshDieArtwork()));
}
