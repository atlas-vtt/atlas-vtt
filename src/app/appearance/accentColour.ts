import type { App } from 'obsidian';
import { COLOUR_PRESETS, type ColourPreset } from './colourPresets';

/** Obsidian's own accent setting, which Atlas shares rather than keeping one of its own. */
const ACCENT_CONFIG_KEY = 'accentColor';

/** The accent colour the GM picked, in Atlas or in Obsidian's settings; `''` while the look's own is in use. */
export function customAccent(app: App): string {
  const value = app.vault.getConfig?.(ACCENT_CONFIG_KEY);
  return typeof value === 'string' ? value : '';
}

/**
 * Picks the accent for the whole vault, as Obsidian's Appearance setting does: Obsidian applies it itself
 * (`--accent-h/s/l` on every window's body). `''` gives the look its own accent back.
 */
export function setAccent(app: App, hex: string): void {
  app.vault.setConfig?.(ACCENT_CONFIG_KEY, hex);
}

/** The preset a stored colour is, whatever its case; none for the look's own or a colour of the GM's. */
export function presetOfAccent(hex: string): ColourPreset | undefined {
  const wanted = hex.toLowerCase();
  return COLOUR_PRESETS.find((preset) => preset.hex === wanted);
}

/**
 * Calls `listener` whenever the accent setting changes: from Atlas, from Obsidian's settings, or from its file after
 * another device's sync. Obsidian announces each setting it writes on the vault (`config-changed`), after it applied it.
 */
export function onAccentChange(app: App, listener: () => void): () => void {
  const ref = app.vault.on('config-changed', (key) => {
    if (key === ACCENT_CONFIG_KEY) listener();
  });
  return () => app.vault.offref(ref);
}
