import type { OpenFailure } from './tileProtocol';

/** What `TileDecoderClient` rejects with, besides the errors of the worker's replies. */

/**
 * A tile or overview request whose map was closed, or lost with a crashed worker: the map is
 * gone, which is no failure to report.
 */
export class MapClosedError extends Error {
  constructor() {
    super('The map image was closed.');
    this.name = 'MapClosedError';
  }
}

/** Whether `error` says only that the map was closed meanwhile. */
export function isMapClosed(error: unknown): boolean {
  return error instanceof MapClosedError;
}

/** A map image that cannot be shown; reported once per open. */
export class TileOpenError extends Error {
  constructor(readonly failure: OpenFailure) {
    super(failure.kind === 'too-large' ? `The image is too large to decode (${failure.width} × ${failure.height}).` : failure.message);
  }
}
