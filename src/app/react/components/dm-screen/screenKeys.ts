import { isTextEntryTarget } from '../../../keyboard/textEntry';
import { isShortcutScopeActive } from '../../../utils/activeLeafGuard';

function isInLibrary(target: EventTarget | null): boolean {
  const node = target as Node | null;
  return !!node && typeof node.instanceOf === 'function' && node.instanceOf(Element) && node.closest('.atlas-sound-lib') !== null;
}

/** What a key on the DM screen must leave alone: another dialog, another leaf, or a field it types in. */
export function screenTakesKey(event: KeyboardEvent, screen: Element | null, viewId: string | undefined): boolean {
  if (event.defaultPrevented || event.isComposing || !isShortcutScopeActive(screen, viewId)) return false;
  if (document.querySelector('.atlas-onboarding-overlay, .atlas-hotkey-help, .modal-container, [role="menu"], [aria-modal="true"]')) return false;
  // The sound library is a list with keys of its own: a digit there is no mood.
  if (isInLibrary(event.target)) return false;
  return !isTextEntryTarget(event.target);
}

const CONTROLS = 'button, a[href], [role="slider"], [role="radio"]';

/** Whether the key's target is a control of its own, which Enter or an arrow may mean. */
export function isControlTarget(target: EventTarget | null): boolean {
  const node = target as Node | null;
  return !!node && typeof node.instanceOf === 'function' && node.instanceOf(Element) && node.closest(CONTROLS) !== null;
}

type Direction = 'left' | 'right' | 'up' | 'down';

const DIRECTIONS: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

export const arrowDirection = (key: string): Direction | undefined => DIRECTIONS[key];

function isVisible(element: Element): boolean {
  return element.getClientRects().length > 0;
}

/**
 * Moves focus to the nearest control in a direction, by where things are on screen. `Tab` opens and closes
 * the DM screen, so the arrow keys are how the keyboard gets around it.
 */
export function moveFocus(root: Element, from: Element, direction: Direction): boolean {
  const start = from.getBoundingClientRect();
  const startX = start.left + start.width / 2;
  const startY = start.top + start.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const element of root.querySelectorAll<HTMLElement>(CONTROLS)) {
    if (element === from || !isVisible(element) || element.hasAttribute('disabled') || element.hasAttribute('data-focus-skip')) continue;
    const box = element.getBoundingClientRect();
    const horizontal = direction === 'left' || direction === 'right';
    const ahead = direction === 'left' ? start.left - box.right : direction === 'right' ? box.left - start.right : direction === 'up' ? start.top - box.bottom : box.top - start.bottom;
    // Beside it, or overlapping by less than half, is not ahead of it.
    if (ahead < -Math.min(horizontal ? box.width : box.height, horizontal ? start.width : start.height) / 2) continue;
    const across = horizontal ? Math.abs(box.top + box.height / 2 - startY) : Math.abs(box.left + box.width / 2 - startX);
    const score = Math.max(0, ahead) + across * 2;
    if (score < bestScore) {
      best = element;
      bestScore = score;
    }
  }
  best?.focus();
  return best !== null;
}
