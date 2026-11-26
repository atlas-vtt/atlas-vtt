const CARD = '[data-asset-id]';

/** The mounted card of the asset `id`. */
export function cardIn(doc: Document, id: string | null | undefined): HTMLElement | null {
  if (!id) return null;
  return Array.from(doc.querySelectorAll<HTMLElement>(CARD)).find((card) => card.dataset.assetId === id) ?? null;
}

/** The asset of the card focus is in, the ⋯ button's card too. */
export function focusedCardId(doc: Document): string | null {
  return doc.activeElement?.closest<HTMLElement>(CARD)?.dataset.assetId ?? null;
}

/**
 * The mounted card after the cards of `leaving` in the grid's order, else the one before them: where focus goes once
 * they have left the grid.
 */
export function neighbourOf(doc: Document, leaving: readonly string[]): string | null {
  const gone = new Set(leaving);
  const order = Array.from(doc.querySelectorAll<HTMLElement>(CARD), (card) => card.dataset.assetId ?? '');
  const last = order.reduce((at, id, index) => (gone.has(id) ? index : at), -1);
  const first = order.findIndex((id) => gone.has(id));
  const after = order.slice(last + 1).find((id) => !gone.has(id));
  const before = first === -1 ? undefined : order.slice(0, first).reverse().find((id) => !gone.has(id));
  return after ?? before ?? null;
}

/** The first folder tile of the open level, else the way up out of it: what holds focus where no card is left. */
function levelFallback(doc: Document): HTMLElement | null {
  const manager = doc.querySelector('.atlas-asset-manager-container');
  const folder = manager?.querySelector<HTMLElement>('.atlas-folder-grid [role="option"]');
  if (folder) return folder;
  const ways = manager?.querySelectorAll<HTMLElement>('.atlas-asset-manager-breadcrumb .atlas-breadcrumb-btn:not(.atlas-current)');
  return ways && ways.length > 0 ? ways[ways.length - 1]! : null;
}

/**
 * Where focus goes once the cards of `leaving` have left the grid, read while they are still there: the card beside
 * them, else (the level is left without cards) its first folder, else the way up out of it, never the window itself.
 */
export function landingAfterLeaving(doc: Document, leaving: readonly string[]): () => HTMLElement | null {
  const neighbour = neighbourOf(doc, leaving);
  return () => (neighbour === null ? levelFallback(doc) : cardIn(doc, neighbour));
}

/** Elements focus was put on by code, until it leaves them or the pointer moves over them. */
const quietlyFocused = new WeakSet<Element>();

/**
 * Whether focus came to `el` by code (a dialog closing, the card before it moved away) and nobody has moved since: its
 * tooltip waits for the pointer or the keyboard, as nobody pointed at it (cold run: a moved card's neighbour popped
 * its tooltip over the folder the card went to).
 */
export function isQuietlyFocused(el: Element): boolean {
  return quietlyFocused.has(el);
}

/** Focuses `target` without its tooltip opening for it (`isQuietlyFocused`). */
function focusQuietly(target: HTMLElement): void {
  quietlyFocused.add(target);
  const settle = (): void => {
    quietlyFocused.delete(target);
    target.removeEventListener('blur', settle);
    target.removeEventListener('pointermove', settle);
  };
  target.addEventListener('blur', settle);
  target.addEventListener('pointermove', settle);
  target.focus({ preventScroll: true });
}

/**
 * Focuses what `find` names now, and again in the next two frames should the grid have rendered it anew: a dialog
 * took focus with it, and a page body holding it leaves the keyboard nowhere (WAI-ARIA dialog pattern). `mayTake`
 * says whether focus may still be moved, so a place the user chose meanwhile keeps it. Focus put there opens no
 * tooltip (`isQuietlyFocused`).
 */
export function focusSoon(doc: Document, find: () => HTMLElement | null, mayTake: () => boolean = () => true): void {
  const focus = (): void => {
    const target = find();
    if (!target || !mayTake()) return;
    if (doc.activeElement !== target && !target.contains(doc.activeElement)) focusQuietly(target);
  };
  focus();
  const view = doc.defaultView;
  view?.requestAnimationFrame(() => {
    focus();
    view.requestAnimationFrame(focus);
  });
}
