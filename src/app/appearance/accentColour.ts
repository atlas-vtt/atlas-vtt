import type { App } from 'obsidian';
import type { MessageKey } from '../i18n';

/** A colour the Appearance page offers for the accent, named in the GM's language. */
export interface AccentPreset {
  id: string;
  hex: string;
  labelKey: MessageKey;
}

export const ACCENT_PRESETS: readonly AccentPreset[] = [
  { id: 'crimson', hex: '#c0392b', labelKey: 'appearance.accentPresets.crimson' },
  { id: 'ember', hex: '#d9822b', labelKey: 'appearance.accentPresets.ember' },
  { id: 'gold', hex: '#c9a227', labelKey: 'appearance.accentPresets.gold' },
  { id: 'moss', hex: '#6b8f3a', labelKey: 'appearance.accentPresets.moss' },
  { id: 'teal', hex: '#2a9d8f', labelKey: 'appearance.accentPresets.teal' },
  { id: 'azure', hex: '#3b82c4', labelKey: 'appearance.accentPresets.azure' },
  { id: 'violet', hex: '#8b5cf6', labelKey: 'appearance.accentPresets.violet' },
  { id: 'rose', hex: '#d46a8a', labelKey: 'appearance.accentPresets.rose' },
];

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
export function presetOfAccent(hex: string): AccentPreset | undefined {
  const wanted = hex.toLowerCase();
  return ACCENT_PRESETS.find((preset) => preset.hex === wanted);
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
