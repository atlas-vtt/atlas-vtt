import { useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { useKeepInView } from '../../packages/components/primitives/useKeepInView';
import { classes } from './classes.ts';

export interface ComposerMenuProps {
  /** Names the button, in its tooltip, and the menu. */
  readonly label: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly disabled?: boolean;
  readonly triggerClassName: string;
  /** What the button shows. */
  readonly face: ReactNode;
  readonly menuClassName?: string;
  /** The menu's rows: elements with `role="menuitem"`. */
  readonly children: ReactNode;
}

const ITEM = '[role="menuitem"]:not(:disabled)';

/**
 * A button of the message field with a menu above it, in the look of Atlas's dropdowns. The arrow
 * keys move through its rows, a press outside closes it, and the panel closes it on Escape (the
 * composer asks). Closed while the focus was in it, it gives the focus back to its button.
 */
export function ComposerMenu({ label, open, onOpenChange, disabled, triggerClassName, face, menuClassName, children }: ComposerMenuProps): ReactElement {
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const keepInView = useKeepInView(menu, open, 'top');
  const wasOpen = useRef(open);

  useLayoutEffect(() => {
    if (open) {
      const items = Array.from(menu.current?.querySelectorAll<HTMLElement>(ITEM) ?? []);
      (items.find((item) => item.dataset.chosen === 'true') ?? items[0])?.focus({ preventScroll: true });
    } else if (wasOpen.current) {
      const doc = root.current?.ownerDocument;
      const focused = doc?.activeElement ?? null;
      if (focused === null || focused === doc?.body || root.current?.contains(focused) === true) trigger.current?.focus({ preventScroll: true });
    }
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    const doc = root.current?.ownerDocument;
    if (!open || doc === undefined) return undefined;
    const onPress = (event: PointerEvent): void => {
      // Not `instanceof Node`: an element of a popout window is none of this window's classes.
      const target = event.target as Node | null;
      if (target !== null && root.current?.contains(target) !== true) onOpenChange(false);
    };
    doc.addEventListener('pointerdown', onPress, true);
    return () => doc.removeEventListener('pointerdown', onPress, true);
  }, [open, onOpenChange]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(ITEM));
    const at = items.indexOf(event.target as HTMLElement);
    const next = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: items.length - 1 }[event.key];
    if (event.key === 'Tab') onOpenChange(false);
    if (next === undefined || items.length === 0) return;
    event.preventDefault();
    items[(next + items.length) % items.length]?.focus({ preventScroll: true });
  };

  return (
    <div ref={root} className="atlas-dropdown-menu atlas-online-log__menu-anchor">
      <LabelTooltip label={label}>
        <button
          ref={trigger} type="button" className={triggerClassName} disabled={disabled}
          aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => onOpenChange(!open)}
        >
          {face}
        </button>
      </LabelTooltip>
      {open && (
        <div
          ref={menu} id={menuId} role="menu" aria-label={label} style={keepInView.style} onKeyDown={onKeyDown}
          className={classes('atlas-dropdown-content atlas-dropdown-content--top atlas-online-log__menu', keepInView.capped && 'atlas-keep-in-view--capped', menuClassName)}
        >
          {children}
        </div>
      )}
    </div>
  );
}
