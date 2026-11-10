/**
 * The template editor's keys (§7.7), as a pure map from a key press to what it
 * asks for. Letters are read from `code` where it names one, since Alt turns
 * them into other characters on macOS (Alt+R is "®").
 */

export type KeyCommand =
  | 'select-previous' | 'select-next'
  | 'move-up' | 'move-down'
  | 'edit-label' | 'insert' | 'duplicate' | 'delete' | 'toggle-hidden'
  | 'copy' | 'paste' | 'undo' | 'redo' | 'save'
  | 'escape' | 'open-menu' | 'next-region' | 'previous-region';

/** What a command needs of focus: the canvas, or anywhere in the view. */
export type KeyScope = 'blocks' | 'view';

export interface KeyPress {
  key: string;
  code?: string | undefined;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/** The letter a press names: `KeyZ` → "z", else the key in lower case. */
function letterOf(press: KeyPress): string {
  const fromCode = /^Key([A-Z])$/.exec(press.code ?? '')?.[1];
  return fromCode ? fromCode.toLowerCase() : press.key.toLowerCase();
}

function modCommand(press: KeyPress): KeyCommand | null {
  const { altKey: alt, shiftKey: shift } = press;
  switch (letterOf(press)) {
    case 'z': return alt ? null : shift ? 'redo' : 'undo';
    case 'y': return alt || shift ? null : 'redo';
    case 'd': return alt || shift ? null : 'duplicate';
    case 'c': return alt || shift ? null : 'copy';
    case 'v': return alt || shift ? null : 'paste';
    case 's': return alt || shift ? null : 'save';
    default: return null;
  }
}

/** Tiles are stepped through in reading order, which runs along a row before the next: ← and ↑ go back, → and ↓ on. */
const ARROWS: Readonly<Record<string, readonly [plain: KeyCommand, alt: KeyCommand]>> = {
  ArrowUp: ['select-previous', 'move-up'],
  ArrowDown: ['select-next', 'move-down'],
  ArrowLeft: ['select-previous', 'move-up'],
  ArrowRight: ['select-next', 'move-down'],
};

/** The command a press asks for, or null for a key the editor leaves alone. `mac`: Mod is Cmd. */
export function keyCommand(press: KeyPress, mac: boolean): KeyCommand | null {
  const mod = mac ? press.metaKey : press.ctrlKey;
  const otherMod = mac ? press.ctrlKey : press.metaKey;
  if (otherMod) return null;
  if (mod) return modCommand(press);
  const arrow = ARROWS[press.key];
  if (arrow) return press.shiftKey ? null : press.altKey ? arrow[1] : arrow[0];
  if (press.altKey) return null;
  switch (press.key) {
    case 'Tab': return press.shiftKey ? 'previous-region' : 'next-region';
    case 'F10': return press.shiftKey ? 'open-menu' : null;
    case 'ContextMenu': return 'open-menu';
    // Shift types "/" on some layouts (German: Shift+7).
    case '/': return 'insert';
  }
  if (press.shiftKey) return null;
  switch (press.key) {
    case 'Enter': return 'edit-label';
    case 'Delete': case 'Backspace': return 'delete';
    case 'Escape': return 'escape';
    default: return null;
  }
}

/** Undo, redo and save act wherever focus is in the view; everything else needs the blocks. */
export function scopeOf(command: KeyCommand): KeyScope {
  return command === 'undo' || command === 'redo' || command === 'save' ? 'view' : 'blocks';
}
