import { useEffect, useState } from 'react';
import { requestUrl } from 'obsidian';
import { armariumListingUrl } from '../armariumUrls';

/** How often the site is asked whether a published listing's page is there yet. */
const POLL_MS = 5_000;
/** After this long the page is offered all the same: its build may be late, and the site's not-found page says so. */
const GIVE_UP_MS = 15 * 60_000;

/**
 * Whether the listing's page is on the site. The Armarium's pages are a static export, rebuilt after every publish, so a
 * listing's page appears a few minutes after it was published. The query keeps a cached answer from before out.
 */
export async function listingPageExists(slug: string): Promise<boolean> {
  try {
    const response = await requestUrl({ url: `${armariumListingUrl(slug)}?built=${Date.now()}`, method: 'HEAD', throw: false });
    return response.status === 200;
  } catch {
    return false;
  }
}

/**
 * Whether the page of the listing `slug` can be opened: false while its build is still on the way, so Open in the
 * Armarium never leads to a page that is not there yet. `slug` null asks nothing.
 */
export function useListingPageReady(slug: string | null): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    if (slug === null) return undefined;
    let stopped = false;
    let timer: number | undefined;
    const giveUpAt = Date.now() + GIVE_UP_MS;
    const check = async (): Promise<void> => {
      const exists = await listingPageExists(slug);
      if (stopped) return;
      if (exists || Date.now() >= giveUpAt) setReady(true);
      else timer = window.setTimeout(() => void check(), POLL_MS);
    };
    void check();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [slug]);
  return ready;
}
