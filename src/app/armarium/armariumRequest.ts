/** One release of an Armarium listing: what an install asks for. */
export interface ArmariumRequest {
  uid: string;
  version: number;
}

/** A listing uid as the Armarium writes them (UUIDs) and Atlas makes collection uids: letters, digits, `.`, `_`, `-`. */
const UID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function isListingUid(value: unknown): value is string {
  return typeof value === 'string' && UID.test(value);
}

export function isReleaseVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/** The release a link names: `uid` and `version` as text (`obsidian://atlas-vtt-install?uid=…&version=…`); null when either is not one. */
export function requestFromParams(params: Readonly<Record<string, string | undefined>>): ArmariumRequest | null {
  const { uid, version: versionText } = params;
  if (!isListingUid(uid) || versionText === undefined || !/^[1-9][0-9]{0,8}$/.test(versionText)) return null;
  return { uid, version: Number(versionText) };
}
