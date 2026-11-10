import { Platform } from 'obsidian';

type Modifier = 'Mod' | 'Shift' | 'Alt';

const MAC_SYMBOLS: Readonly<Record<Modifier, string>> = { Mod: '⌘', Shift: '⇧', Alt: '⌥' };
const NAMES: Readonly<Record<Modifier, string>> = { Mod: 'Ctrl', Shift: 'Shift', Alt: 'Alt' };
/** The order macOS writes modifiers in; elsewhere Ctrl+Shift+Alt. */
const MAC_ORDER: readonly Modifier[] = ['Alt', 'Shift', 'Mod'];
const OTHER_ORDER: readonly Modifier[] = ['Mod', 'Shift', 'Alt'];

/** A shortcut as the platform writes it: "⌥⌘R" on macOS, "Ctrl+Alt+R" elsewhere. */
export function shortcutText(modifiers: readonly Modifier[], key: string, mac: boolean = Platform.isMacOS): string {
  const order = mac ? MAC_ORDER : OTHER_ORDER;
  const held = order.filter((modifier) => modifiers.includes(modifier));
  if (mac) return `${held.map((modifier) => MAC_SYMBOLS[modifier]).join('')}${key}`;
  return [...held.map((modifier) => NAMES[modifier]), key].join('+');
}
