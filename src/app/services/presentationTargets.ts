import { SlotRegistry, safely } from '../extensions/SlotRegistry';

export interface PresentationTargetEntry {
  id: string;
  label: string;
  isActive(): boolean;
}

/** Audiences besides the player window, kept like the extension API's other registrations (`SlotRegistry`). */
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

/** For React (useSyncExternalStore): targets were added, removed, or asked to be re-read. */
export function subscribePresentationTargets(listener: () => void): () => void {
  return presentationTargetSlot.subscribe(listener);
}

export function invalidatePresentationTargets(): void {
  presentationTargetSlot.invalidate();
}
