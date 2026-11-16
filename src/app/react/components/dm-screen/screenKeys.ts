import { isTextEntryTarget } from '../../../keyboard/textEntry';
import { isShortcutScopeActive } from '../../../utils/activeLeafGuard';

export function isWithin(target: EventTarget | null, selector: string): boolean {
  const node = target as Node | null;
  return !!node && typeof node.instanceOf === 'function' && node.instanceOf(Element) && node.closest(selector) !== null;
}

/** What a key on the DM screen must leave alone: another dialog, another leaf, or a field it types in. */
export function screenTakesKey(event: KeyboardEvent, screen: Element | null, viewId: string | undefined): boolean {
  if (event.defaultPrevented || event.isComposing || !isShortcutScopeActive(screen, viewId)) return false;
  if ((screen?.ownerDocument ?? document).querySelector('.atlas-onboarding-overlay, .atlas-hotkey-help, .modal-container, [role="menu"], [aria-modal="true"]')) return false;
  return !isTextEntryTarget(event.target);
}

const CONTROLS = 'button, a[href], [role="slider"], [role="radio"], [role="grid"]';

/** Whether the key's target is a control of its own, which Enter or an arrow may mean. */
export function isControlTarget(target: EventTarget | null): boolean {
  return isWithin(target, CONTROLS);
}

export type Direction = 'left' | 'right' | 'up' | 'down';

const DIRECTIONS: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

export const arrowDirection = (key: string): Direction | undefined => DIRECTIONS[key];
