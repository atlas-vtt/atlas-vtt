/**
 * The keys of the template editor's shell (§11.1), asked before the block
 * keys: Shift+Enter opens the selected tile's Options. Only while focus is
 * inside the editor (its root's listener).
 */

/** Text being typed keeps Enter. */
function typing(target: EventTarget | null): boolean {
  const element = target as Partial<HTMLElement> | null;
  if (!element || typeof element.closest !== 'function') return false;
  return element.isContentEditable === true || (element as Element).closest('input, textarea, select') !== null;
}

/** True when the shell took the key. */
export function handleShellKey(event: KeyboardEvent, openOptions: () => void): boolean {
  const mod = event.metaKey || event.ctrlKey;
  if (event.key === 'Enter' && event.shiftKey && !mod && !event.altKey && !typing(event.target)) {
    openOptions();
    return true;
  }
  return false;
}
