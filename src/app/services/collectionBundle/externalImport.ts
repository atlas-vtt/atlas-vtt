/** How a bundle handed to the asset manager ended. */
export type ExternalImportOutcome =
  /** Installed: a collection names the collection it went into; a single item names none. */
  | { kind: 'installed'; collectionId?: string | undefined }
  | { kind: 'cancelled' }
  | { kind: 'failed' };

/**
 * A bundle (a collection's, or a single item's) that came from outside the asset manager (an Armarium install),
 * waiting for the import review. The asset manager reads it, shows the review and imports it only when the GM confirms, exactly as for
 * a file the GM picked. Its callbacks may be called more than once; only the first outcome counts.
 */
export interface ExternalImport {
  readonly data: Blob;
  /** Who shared it, where the source knows: the item review names them. */
  readonly creator?: string | undefined;
  /** The review is shown and waits for the GM. */
  onReview(): void;
  onSettled(outcome: ExternalImportOutcome): void;
}
