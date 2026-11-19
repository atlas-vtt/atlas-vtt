import { requestUrl, type RequestUrlResponse } from 'obsidian';
import { isRecord } from '../utils/guards';
import { ARMARIUM_FORMAT, ARMARIUM_LIST_URL } from './armariumUrls';
import { isListingUid, isReleaseVersion } from './armariumRequest';

/** No collection bundle the Armarium takes comes near this; a listing naming more is not believed. */
const MAX_BUNDLE_BYTES = 1024 ** 3;
const SHA256 = /^[0-9a-f]{64}$/;

/** A listing the plugin may install: its newest release and the file that release is. */
export interface InstallableListing {
  uid: string;
  name: string;
  version: number;
  fileName: string;
  bytes: number;
  sha256: string;
  /** Where the file lies; used only when the counting route fails, and only on an allowed host. */
  downloadUrl: string;
}

/** Why the installable list could not be had. */
export class ArmariumListError extends Error {
  constructor(message: string, readonly offline: boolean) {
    super(message);
    this.name = 'ArmariumListError';
  }
}

const nonEmpty = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;

function readListing(entry: unknown): InstallableListing | null {
  if (!isRecord(entry)) return null;
  const { uid, name, version, fileName, bytes, sha256, downloadUrl } = entry;
  if (!isListingUid(uid) || !isReleaseVersion(version) || !nonEmpty(name, 500) || !nonEmpty(fileName, 500) || !nonEmpty(downloadUrl, 2000)) return null;
  if (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes <= 0 || bytes > MAX_BUNDLE_BYTES) return null;
  if (typeof sha256 !== 'string' || !SHA256.test(sha256)) return null;
  return { uid, name, version, fileName, bytes, sha256, downloadUrl };
}

/**
 * The listings of the installable list, when it is format 1. A listing that misses a field or names one
 * the plugin cannot trust (no SHA-256, an impossible size) is left out, as is a second listing of one uid.
 */
export function parseInstallableList(data: unknown): InstallableListing[] | null {
  if (!isRecord(data) || data.format !== ARMARIUM_FORMAT || !Array.isArray(data.listings)) return null;
  const listings = new Map<string, InstallableListing>();
  for (const entry of data.listings) {
    const listing = readListing(entry);
    if (listing && !listings.has(listing.uid)) listings.set(listing.uid, listing);
  }
  return [...listings.values()];
}

/** Reads the installable list from the site. Nothing about the user or the vault goes with the request. */
export async function fetchInstallableList(): Promise<InstallableListing[]> {
  let response: RequestUrlResponse;
  try {
    response = await requestUrl({ url: ARMARIUM_LIST_URL, throw: false });
  } catch (error) {
    throw new ArmariumListError(`The Armarium could not be reached: ${error instanceof Error ? error.message : String(error)}`, true);
  }
  if (response.status !== 200) throw new ArmariumListError(`The Armarium's list answered ${response.status}.`, false);
  let body: unknown;
  try {
    body = response.json;
  } catch {
    body = null;
  }
  const listings = parseInstallableList(body);
  if (!listings) throw new ArmariumListError('The Armarium\'s list is of another format.', false);
  return listings;
}
