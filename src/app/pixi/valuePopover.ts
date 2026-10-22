/**
 * The small popover in which a GM types a token's numbers over the map: it hangs below a point of
 * the canvas (above where there is no room), Enter or a press outside applies a valid value,
 * Escape discards, and no key reaches the map's shortcuts.
 */

/** Screen rectangle the popover hangs from, in canvas-local pixels. */
export interface BarAnchor {
  x: number;
  top: number;
  bottom: number;
}

/** What the popover's content does: built into its root once it is open. */
export interface PopoverContent {
  /** Applies what is typed; false where it reads as nothing, and the popover stays open. */
  commit: () => boolean;
  /** Whether anything was typed: a press outside applies only then. */
  isDirty: () => boolean;
  /** The field that takes focus when the popover opens. */
  first: HTMLInputElement;
  /** Keys the content handles itself (the bar editor's arrow steps); Enter and Escape are the popover's. */
  onKey?: (event: KeyboardEvent) => void;
}

export interface ValuePopoverOptions {
  /** Element the anchor is measured against (the Pixi canvas). */
  anchorEl: HTMLElement;
  anchor: BarAnchor;
  /** Names the dialog for screen readers. */
  label: string;
  /** Extra class of the popover's root. */
  className?: string;
  build: (root: HTMLElement, close: () => void) => PopoverContent;
  onClose: () => void;
}

export interface ValuePopover {
  close: () => void;
  reposition: (anchor: BarAnchor) => void;
}

const POPOVER_GAP = 6;
const VIEWPORT_MARGIN = 8;

/**
 * Opens the popover in the anchor's own window (a map in a popout has its own document), and
 * closes it when its content commits, Escape is pressed or `close` is called.
 */
export function openValuePopover({ anchorEl, anchor, label, className, build, onClose }: ValuePopoverOptions): ValuePopover {
  const { doc, win } = anchorEl;
  const root = doc.body.createDiv({
    cls: ['atlas-vtt-plugin', 'atlas-token-value-editor', ...(className ? [className] : [])],
    attr: { role: 'dialog', 'aria-label': label },
  });

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    doc.removeEventListener('pointerdown', onOutsidePointerDown, true);
    root.remove();
    onClose();
  };
  const content = build(root, close);

  const onOutsidePointerDown = (e: PointerEvent): void => {
    if (root.contains(e.target as Node)) return;
    if (!content.isDirty() || !content.commit()) close();
  };
  doc.addEventListener('pointerdown', onOutsidePointerDown, true);

  root.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      content.commit();
    } else if (e.key === 'Escape') {
      close();
    } else {
      content.onKey?.(e);
    }
  });

  const reposition = (next: BarAnchor): void => {
    const rect = anchorEl.getBoundingClientRect();
    const halfWidth = root.offsetWidth / 2;
    const x = Math.min(Math.max(rect.left + next.x, VIEWPORT_MARGIN + halfWidth), win.innerWidth - VIEWPORT_MARGIN - halfWidth);
    const below = rect.top + next.bottom + POPOVER_GAP;
    const fitsBelow = below + root.offsetHeight <= win.innerHeight - VIEWPORT_MARGIN;
    root.style.left = `${x}px`;
    root.style.top = `${fitsBelow ? below : rect.top + next.top - POPOVER_GAP - root.offsetHeight}px`;
  };
  reposition(anchor);

  content.first.focus();
  content.first.select();
  return { close, reposition };
}

/** A text field of the popover for a number or a change typed as a sum (`-9/2`). */
export function createValueField(root: HTMLElement, label: string, initial: string, className?: string): HTMLInputElement {
  const input = root.createEl('input', {
    cls: ['atlas-token-value-editor__input', ...(className ? [className] : [])],
    type: 'text',
    attr: { autocomplete: 'off', spellcheck: 'false', 'aria-label': label },
  });
  input.value = initial;
  return input;
}
