import type { Plugin } from 'obsidian';
import { forgetObsidianAccentColor } from '../pixi/utils/colorUtils';

/**
 * The canvas resolves Obsidian's accent once per value of `--interactive-accent`. A theme may
 * write a value whose text stays the same while its colour changes (`light-dark()`,
 * `currentColor`), so the accent is resolved anew whenever Obsidian's CSS changes.
 */
export function registerAccentColorSync(plugin: Plugin): void {
  plugin.registerEvent(plugin.app.workspace.on('css-change', forgetObsidianAccentColor));
}
