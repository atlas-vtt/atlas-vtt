import { fetchBytes, matchesFile, type FetchBytes } from '../services/stockPacks/verifiedFetch';
import { armariumDownloadUrl, isArmariumFileUrl } from './armariumUrls';
import type { InstallableListing } from './installableList';

/** Why a release could not be downloaded: no source answered, or what came was not the file the list names. */
export class ArmariumDownloadError extends Error {
  constructor(message: string, readonly reason: 'unreachable' | 'mismatch') {
    super(message);
    this.name = 'ArmariumDownloadError';
  }
}

/** Where a release is fetched from, in order: the counting route, then the listing's own file on an allowed host. */
export function downloadSources(listing: InstallableListing): string[] {
  const sources = [armariumDownloadUrl(listing.uid, listing.version)];
  if (isArmariumFileUrl(listing.downloadUrl)) sources.push(listing.downloadUrl);
  return sources;
}

/**
 * Downloads a listing's release and checks it against the size and SHA-256 the installable list names, so a
 * broken or tampered file never reaches the import. The listing's own `downloadUrl` is tried only when the
 * counting route fails, and only on one of the Armarium's file hosts.
 */
export async function downloadRelease(listing: InstallableListing, fetch: FetchBytes = fetchBytes): Promise<ArrayBuffer> {
  let mismatched = false;
  const failures: string[] = [];
  for (const source of downloadSources(listing)) {
    try {
      const bytes = await fetch(source);
      if (await matchesFile(bytes, listing)) return bytes;
      mismatched = true;
      failures.push(`${source} sent ${bytes.byteLength} bytes that are not the listed file`);
    } catch (error) {
      failures.push(`${source}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new ArmariumDownloadError(`Downloading ${listing.uid} v${listing.version} failed (${failures.join('; ')}).`, mismatched ? 'mismatch' : 'unreachable');
}
