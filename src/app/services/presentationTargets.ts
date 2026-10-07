import { SlotRegistry, safely } from '../extensions/SlotRegistry';

export interface PresentationTargetEntry {
  id: string;
  label: string;
  isActive(): boolean;
  /** A short mark after a tab's eye, or null for none (`PresentationTarget.tabBadge`). */
  tabBadge?(tab: { viewId: string; tabId: string }): string | null;
}

/** The longest badge an eye shows; a longer one is cut with an ellipsis. */
const TAB_BADGE_MAX = 24;
/** Targets whose `tabBadge` failed already: the failure is logged once, not on every render. */
const failedBadges = new WeakSet<PresentationTargetEntry>();

/** Audiences besides the player window, one slot of the extension API like the rest of `extensions/slots.ts`. */
export const presentationTargetSlot = new SlotRegistry<PresentationTargetEntry>();

/**
 * Adds an audience besides the player window for extension `owner`; returns the removal (idempotent).
 * Adding a target object that is already added changes nothing and returns a removal that does nothing.
 */
export function addPresentationTarget(target: PresentationTargetEntry, owner = 'an extension'): () => void {
  if (presentationTargetSlot.list().some((entry) => entry.item === target)) return () => undefined;
  return presentationTargetSlot.add(owner, target);
}

/** The first active target, which decides what the eye does and says; null when only the player window watches. */
export function activePresentationTarget(): PresentationTargetEntry | null {
  for (const { owner, item } of presentationTargetSlot.list()) {
    if (safely(owner, 'presentation target', () => item.isActive(), false)) return item;
  }
  return null;
}

/**
 * Whether any extension has registered a target, active or not. Only then does Atlas present a scene of its own
 * (`PresentedScene`): the eye marker stays until Stop presenting, the player window follows a scene presented from
 * anywhere, and the Present to players and Stop presenting commands exist. Without one, presenting is Atlas's stock
 * behaviour: "Send current map to player view" and the eye, marked while the player window shows the tab.
 */
export function presentationTargetsRegistered(): boolean {
  return presentationTargetSlot.list().length > 0;
}

/** For React (useSyncExternalStore) and `ui.invalidate()`: targets were added, removed, or asked to be re-read. */
export function subscribePresentationTargets(listener: () => void): () => void {
  return presentationTargetSlot.subscribe(listener);
}

export function invalidatePresentationTargets(): void {
  presentationTargetSlot.invalidate();
}

function badgeFailed(owner: string, target: PresentationTargetEntry, problem: unknown): null {
  if (!failedBadges.has(target)) {
    failedBadges.add(target);
    console.error(`[Atlas API] ${owner}: presentation target "${target.id}" tabBadge failed:`, problem);
  }
  return null;
}

/** One target's badge for a tab: plain text, trimmed, at most `TAB_BADGE_MAX` characters; null for none, a throw or a non-string. */
function badgeOf(owner: string, target: PresentationTargetEntry, viewId: string, tabId: string): string | null {
  let value: unknown;
  try {
    value = target.tabBadge?.(Object.freeze({ viewId, tabId }));
  } catch (error) {
    return badgeFailed(owner, target, error);
  }
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return badgeFailed(owner, target, new TypeError(`expected a string or null, got ${typeof value}`));
  // Characters, not UTF-16 units, so a cut never splits an emoji.
  const text = [...value.replace(/\p{Cc}/gu, ' ').trim()];
  if (text.length === 0) return null;
  return text.length > TAB_BADGE_MAX ? `${text.slice(0, TAB_BADGE_MAX - 1).join('').trimEnd()}…` : text.join('');
}

/** The mark after a tab's eye: the first active target's non-null badge; null when no active target gives one. */
export function tabBadgeFor(viewId: string, tabId: string): string | null {
  for (const { owner, item } of presentationTargetSlot.list()) {
    if (!item.tabBadge || !safely(owner, 'presentation target', () => item.isActive(), false)) continue;
    const badge = badgeOf(owner, item, viewId, tabId);
    if (badge !== null) return badge;
  }
  return null;
}

/** For React (useSyncExternalStore): changes whenever targets are added, removed or asked to be re-read, so badges are read again. */
export function presentationTargetsVersion(): number {
  return presentationTargetSlot.version();
}
