/**
 * What lies outside the asset manager's window in the document yet belongs to it or to what opened over it: a press
 * there is no press outside the window. Atlas' notices (`.atlas-toast-container`, in the portal host under <body>)
 * among them: a press on a move's "Open folder" closed the window before its click could open the folder (decision #37).
 */
const OWN_SURFACES = [
  '.atlas-onboarding-overlay',
  '.menu',
  '.atlas-ctx-menu',
  '.modal-container',
  '.modal',
  '.atlas-text-dialog-backdrop',
  '.atlas-collection-settings-overlay',
  '.atlas-statblock-preview-window',
  '.atlas-toast-container',
  // A map's dice rolls stand in front of the window (`useMapRollLayer`): a click dismisses the roll alone.
  '.atlas-dice-rolls',
].join(', ');

/** Whether a press on `target` lies outside the window `windowEl`, and outside every surface that belongs to it. */
export function isPressOutsideWindow(target: EventTarget | null, windowEl: HTMLElement | null): boolean {
  const node = target as (Node & Partial<Pick<Element, 'closest'>>) | null;
  if (!windowEl || !node) return false;
  const element = node.closest ? (node as Element) : node.parentElement;
  if (element?.closest(OWN_SURFACES)) return false;
  return !windowEl.contains(node);
}
