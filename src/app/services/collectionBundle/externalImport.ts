/** How a bundle handed to the asset manager ended. */
export type ExternalImportOutcome =
  | { kind: 'installed'; collectionId: string }
  | { kind: 'cancelled' }
  | { kind: 'failed' };

/**
 * A collection bundle that came from outside the asset manager (an Armarium install), waiting for the import
 * review. The asset manager reads it, shows the review and imports it only when the GM confirms, exactly as for
 * a file the GM picked. Its callbacks may be called more than once; only the first outcome counts.
 */
export interface ExternalImport {
  readonly data: Blob;
  /** The review is shown and waits for the GM. */
  onReview(): void;
  onSettled(outcome: ExternalImportOutcome): void;
}
