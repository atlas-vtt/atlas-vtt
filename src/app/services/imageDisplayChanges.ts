const listeners = new Set<() => void>();

/**
 * Calls `listener` whenever what `ImageDisplayService.isImageDisplayed` answers may have changed: an image
 * shown or taken away in the player window, or by whatever stands in front of the service. Returns what
 * stops it.
 */
export function onImageDisplayChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Tells everyone who follows the image display that its answer may have changed. */
export function imageDisplayChanged(): void {
  for (const listener of [...listeners]) listener();
}
