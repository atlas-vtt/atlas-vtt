import { useEffect, useState } from 'react';
import { fetchInstallableList } from '../installableList';

/** How often the site is asked whether it shows the published version yet. */
const POLL_MS = 5_000;
/** After this long the page is offered all the same: its build may be late, and the page then shows the version before. */
const GIVE_UP_MS = 15 * 60_000;

/** The release a share published, which the site shows once its next build is done. */
export interface PublishedRelease {
  uid: string;
  version: number;
}

/**
 * Whether the site shows `version` of the listing `uid` (or a later one). The Armarium's pages are a static export,
 * rebuilt after every publish, so a version appears a few minutes after it was published, and a listing's page of the
 * version before stands until then. Each build writes the installable list anew with every listing's newest version;
 * the query keeps a cached list from before out.
 */
export async function siteShows({ uid, version }: PublishedRelease): Promise<boolean> {
  try {
    const listings = await fetchInstallableList(`built=${Date.now()}`);
    return listings.some((listing) => listing.uid === uid && listing.version >= version);
  } catch {
    return false;
  }
}

/**
 * Whether the published release's page can be opened: false while the site's build is still on the way, so Open in the
 * Armarium never leads to a page without the new version. `release` null asks nothing.
 */
export function useListingPageReady(release: PublishedRelease | null): boolean {
  const [ready, setReady] = useState(false);
  const uid = release?.uid ?? null;
  const version = release?.version ?? null;
  useEffect(() => {
    setReady(false);
    if (uid === null || version === null) return undefined;
    let stopped = false;
    let timer: number | undefined;
    const giveUpAt = Date.now() + GIVE_UP_MS;
    const check = async (): Promise<void> => {
      const shown = await siteShows({ uid, version });
      if (stopped) return;
      if (shown || Date.now() >= giveUpAt) setReady(true);
      else timer = window.setTimeout(() => void check(), POLL_MS);
    };
    void check();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [uid, version]);
  // A release Atlas could not name (no uid or version came back) is not waited for.
  return uid === null || version === null ? true : ready;
}
