import { isMusicText, shownText } from '../../services/musicBundle/musicBundleFormat';
import { isRecord } from '../../utils/guards';
import { ARMARIUM_FILES_ORIGIN, isArmariumFileUrl } from '../armariumUrls';
import type { OwnListing } from './uploadContract';

/** Reads a public JSON file of the Armarium; null where it cannot be had or read. */
export type FetchPublicJson = (url: string) => Promise<unknown>;

/** Where the public index lies: beside the listing's cover, which the files domain serves, else on the files domain. */
export function publicIndexUrl(coverUrl: string | null): string {
  const origin = coverUrl !== null && isArmariumFileUrl(coverUrl) ? new URL(coverUrl).origin : ARMARIUM_FILES_ORIGIN;
  return `${origin}/index/v1.json`;
}

/**
 * Where the public index says a listing's contents lie: those of `version`, else of the newest version it lists (the
 * index is written a little after a version is published). Null where it names none on the Armarium's file hosts.
 */
export function contentsUrlOf(index: unknown, uid: string, version: number | null): string | null {
  if (!isRecord(index) || !Array.isArray(index.listings)) return null;
  const listing: unknown = index.listings.find((entry: unknown) => isRecord(entry) && entry.uid === uid);
  if (!isRecord(listing) || !Array.isArray(listing.versions)) return null;
  const versions = listing.versions.flatMap((entry: unknown) => (isRecord(entry) && typeof entry.version === 'number' ? [{ version: entry.version, url: entry.contentsUrl }] : []));
  const newest = versions.reduce<{ version: number; url: unknown } | null>((best, entry) => (best === null || entry.version > best.version ? entry : best), null);
  const url = (versions.find((entry) => entry.version === version) ?? newest)?.url;
  return typeof url === 'string' && isArmariumFileUrl(url) ? url : null;
}

/** The artist a published version's contents name; null where they name none Atlas would carry. */
export function artistOfContents(contents: unknown): string | null {
  const item = isRecord(contents) ? contents.item : undefined;
  const artist = isRecord(item) ? item.artist : undefined;
  return isMusicText(artist) ? shownText(artist).trim() : null;
}

/**
 * The artist of a music listing's published version, read from the Armarium's public files (the index, then that
 * version's contents), since `/mine` names none. Nothing about the user goes with either request. Null wherever
 * something cannot be read: the share never waits on it.
 */
export async function readPublishedArtist(listing: Pick<OwnListing, 'uid' | 'newestVersion' | 'coverUrl'>, fetchJson: FetchPublicJson): Promise<string | null> {
  try {
    const contentsUrl = contentsUrlOf(await fetchJson(publicIndexUrl(listing.coverUrl)), listing.uid, listing.newestVersion);
    return contentsUrl === null ? null : artistOfContents(await fetchJson(contentsUrl));
  } catch (error) {
    console.warn('[Atlas] The listing\'s published artist could not be read:', error);
    return null;
  }
}
