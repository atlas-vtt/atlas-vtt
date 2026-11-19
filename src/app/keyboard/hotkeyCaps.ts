import { Platform } from 'obsidian';

type Modifier = 'Mod' | 'Alt' | 'Shift';

const MAC_MODIFIERS: Readonly<Record<Modifier, string>> = { Mod: '⌘', Alt: '⌥', Shift: '⇧' };
const OTHER_MODIFIERS: Readonly<Record<Modifier, string>> = { Mod: 'Ctrl', Alt: 'Alt', Shift: 'Shift' };
/** The order each platform writes held modifiers in: ⌥⇧⌘ on macOS, Ctrl Alt Shift elsewhere. */
const MAC_ORDER: readonly Modifier[] = ['Alt', 'Shift', 'Mod'];
const OTHER_ORDER: readonly Modifier[] = ['Mod', 'Alt', 'Shift'];
const KEY_NAMES: Readonly<Record<string, string>> = {
  Escape: 'Esc', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Arrows: '←↑↓→',
  PageUp: 'Page Up', PageDown: 'Page Down', Delete: 'Del',
};
const MAC_KEY_NAMES: Readonly<Record<string, string>> = { Backspace: '⌫' };
const LEADING_MODIFIER = /^(Mod|Alt|Shift)\+(?=.)/;

const isModifier = (key: string): key is Modifier => key === 'Mod' || key === 'Alt' || key === 'Shift';

/**
 * A binding as the keys printed on the GM's keyboard, one cap each: `Mod+Shift+z` is ⇧ ⌘ Z on macOS and
 * Ctrl Shift Z elsewhere. A bare modifier (`Mod`) is a cap of its own, and `Arrows` stands for all four arrow keys.
 * An empty binding has no caps.
 */
export function hotkeyCaps(binding: string, mac: boolean = Platform.isMacOS): string[] {
  if (!binding) return [];
  const held = new Set<Modifier>();
  let key = binding;
  for (let match = LEADING_MODIFIER.exec(key); match; match = LEADING_MODIFIER.exec(key)) {
    held.add(match[1] as Modifier);
    key = key.slice(match[0].length);
  }
  const modifiers = mac ? MAC_MODIFIERS : OTHER_MODIFIERS;
  const caps = (mac ? MAC_ORDER : OTHER_ORDER).filter((modifier) => held.has(modifier)).map((modifier) => modifiers[modifier]);
  if (isModifier(key)) return [...caps, modifiers[key]];
  const name = (mac ? MAC_KEY_NAMES[key] : undefined) ?? KEY_NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : key);
  return [...caps, name];
}
