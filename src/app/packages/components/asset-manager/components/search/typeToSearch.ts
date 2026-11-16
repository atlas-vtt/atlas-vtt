import { isTextEntryTarget } from '../../../../../keyboard/textEntry';

/** The search where a narrow header has folded it into a button; focus opens it over the toolbar row. */
const FOLDED_SEARCH_FIELD = '.atlas-am-toolbar[data-compact~="search"] .atlas-asset-manager-search input';
/** Controls of the window that take typed characters themselves (a menu's typeahead, a dialog's own keys). */
const OWNS_CHARACTERS = '[role="dialog"], [role="menu"], [role="menubar"], .menu, .atlas-ctx-menu';

/** A key that types one character and nothing else: no Cmd, Ctrl or Alt, no Space (it presses buttons), no composition. */
function typesCharacter(event: KeyboardEvent): boolean {
  return event.key.length === 1 && event.key !== ' ' && !event.metaKey && !event.ctrlKey && !event.altKey && !event.isComposing;
}

/**
 * Type-to-search (decision #42), as Finder and Slack's quick switcher do: where the header has folded the search
 * into a button, a character typed while focus rests in the window opens the field with that character, as the
 * field focused with its query selected would take it. The tabs stay in the row until then. Returns whether it
 * took the key.
 */
export function typeToSearch(event: KeyboardEvent, root: HTMLElement | null, setSearch: (value: string) => void): boolean {
  if (event.defaultPrevented || !typesCharacter(event) || !root) return false;
  const target = event.target as Node | null;
  if (!target || !root.contains(target) || isTextEntryTarget(target)) return false;
  if ((target as Partial<Element>).closest?.(OWNS_CHARACTERS)) return false;
  const field = root.querySelector<HTMLInputElement>(FOLDED_SEARCH_FIELD);
  if (!field) return false;
  event.preventDefault();
  field.focus({ preventScroll: true });
  setSearch(event.key);
  return true;
}
