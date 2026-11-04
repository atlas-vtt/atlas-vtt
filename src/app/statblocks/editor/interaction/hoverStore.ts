/**
 * What the pointer points at on a card (spec §3.3): the innermost target
 * (an ability, else a block) and whether that is frozen. Hover is read from
 * the DOM and kept here, outside React's render of the card: the card never
 * renders again for hover, only the handle that reads this store does.
 */

/** Marks the frame or ability the pointer is over; its outline shows. */
export const HOVER_ATTRIBUTE = 'data-sb-hover';
/** Marks the target whose handle is hovered, pressed or whose menu is open: its outline turns accent (§3.5). */
export const MENU_TARGET_ATTRIBUTE = 'data-sb-menu-target';

export type HoverKind = 'block' | 'item';

export interface HoverTarget {
  kind: HoverKind;
  /** The block's frame, or the ability's own element. */
  element: HTMLElement;
  /** The block, or for an ability the block of its list. */
  blockId: string;
  /** An ability's identity in its list (`data-item-key`). */
  itemKey?: string | undefined;
}

export interface HoverState {
  target: HoverTarget | null;
  /** From a press on a handle to its drop, cancel or menu: nothing changes the target (the frozen-handle rule, §3.4). */
  frozen: boolean;
}

const EMPTY: HoverState = { target: null, frozen: false };

export function sameTarget(a: HoverTarget | null, b: HoverTarget | null): boolean {
  if (a === null || b === null) return a === b;
  return a.element === b.element && a.kind === b.kind && a.itemKey === b.itemKey;
}

/** How long a target keeps its handle after the pointer left both (§3.3): a fast pass leaves no trail. */
export const HOVER_GRACE_MS = 150;

export class HoverStore {
  private state: HoverState = EMPTY;
  private marked: HTMLElement | null = null;
  private readonly listeners = new Set<() => void>();
  private clearTimer: { win: Window; id: number } | null = null;
  /** The pointer is on the handle itself: the target stays however long it rests there. */
  handleHovered = false;
  private menuOpen = false;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): HoverState => this.state;

  /** The pointer left the target and its handle: the target goes after the grace, unless it comes back first. */
  scheduleClear(win: Window): void {
    if (this.state.frozen || this.handleHovered) return;
    this.cancelClear();
    this.clearTimer = { win, id: win.setTimeout(() => this.set(null), HOVER_GRACE_MS) };
  }

  cancelClear(): void {
    if (!this.clearTimer) return;
    this.clearTimer.win.clearTimeout(this.clearTimer.id);
    this.clearTimer = null;
  }

  /** Points at `target`; ignored while frozen. */
  set(target: HoverTarget | null): void {
    if (target) this.cancelClear();
    if (this.state.frozen || sameTarget(this.state.target, target)) return;
    if (this.state.target && this.state.target.element !== target?.element) this.state.target.element.removeAttribute(HOVER_ATTRIBUTE);
    target?.element.setAttribute(HOVER_ATTRIBUTE, '');
    this.update({ ...this.state, target });
  }

  freeze(): void {
    if (!this.state.frozen) this.update({ ...this.state, frozen: true });
  }

  thaw(): void {
    if (this.state.frozen) this.update({ ...this.state, frozen: false });
  }

  /** Marks the target the handle's menu will act on (null takes the mark away). */
  markMenuTarget(element: HTMLElement | null): void {
    if (this.marked === element) return;
    this.marked?.removeAttribute(MENU_TARGET_ATTRIBUTE);
    this.marked = element;
    element?.setAttribute(MENU_TARGET_ATTRIBUTE, '');
  }

  /** A menu opened on `element`: its outline stays accent until `menuClosed`, wherever the pointer goes. */
  menuOpenedOn(element: HTMLElement | null): void {
    this.menuOpen = true;
    this.markMenuTarget(element);
  }

  menuClosed(): void {
    this.menuOpen = false;
    this.markMenuTarget(null);
  }

  /** Whether the mark may go when the pointer leaves the handle: not while pressed or while its menu is open. */
  get markHeld(): boolean {
    return this.state.frozen || this.menuOpen;
  }

  /** Lets go of everything: the surface unmounts. */
  clear(): void {
    this.cancelClear();
    this.handleHovered = false;
    this.menuOpen = false;
    this.markMenuTarget(null);
    this.state.target?.element.removeAttribute(HOVER_ATTRIBUTE);
    this.update(EMPTY);
  }

  private update(next: HoverState): void {
    this.state = next;
    for (const listener of [...this.listeners]) listener();
  }
}

/** One hover store per surface root: the parts that draw over one card (its handle, its tags, its toolbar) share it. */
const stores = new WeakMap<Element, HoverStore>();

export function hoverStoreOf(root: Element): HoverStore {
  let store = stores.get(root);
  if (!store) {
    store = new HoverStore();
    stores.set(root, store);
  }
  return store;
}
