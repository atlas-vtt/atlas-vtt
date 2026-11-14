import { Platform } from 'obsidian';
import { shortcutText } from '../../../../statblocks/editor/template-editor/shortcutText';

/** A Cmd/Ctrl shortcut of the asset manager, as its tooltip shows it and as `aria-keyshortcuts` names it. */
export interface ModShortcut {
  /** "⌘N" on macOS, "Ctrl+N" elsewhere. */
  label: string;
  /** "Meta+N" on macOS, "Control+N" elsewhere. */
  aria: string;
}

/** The asset manager's shortcut of Cmd (Ctrl off macOS) with `key` (`useAssetManagerShortcuts`). */
export function modShortcut(key: string, mac: boolean = Platform.isMacOS): ModShortcut {
  const shown = key.toUpperCase();
  return { label: shortcutText(['Mod'], shown, mac), aria: `${mac ? 'Meta' : 'Control'}+${shown}` };
}
