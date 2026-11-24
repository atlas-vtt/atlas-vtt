import { useEffect, useState } from 'react';
import type { App } from 'obsidian';

/** Which mounted welcome shows for an app, and the others waiting to take over once it goes. */
interface WelcomeClaim {
  owner: symbol | null;
  waiting: Set<() => void>;
}

const claims = new WeakMap<App, WelcomeClaim>();

function claimOf(app: App): WelcomeClaim {
  let claim = claims.get(app);
  if (!claim) claims.set(app, claim = { owner: null, waiting: new Set() });
  return claim;
}

/**
 * Whether this welcome is the one that shows for `app`: the start page and a map side by side each mount one, and only
 * the first mounted shows. When it unmounts before the GM is done, another mounted one takes over.
 */
export function useWelcomeOwner(app: App): boolean {
  const [me] = useState(() => Symbol('welcome'));
  const [owns, setOwns] = useState(false);
  useEffect(() => {
    const claim = claimOf(app);
    const take = (): void => {
      if (claim.owner === null) claim.owner = me;
      setOwns(claim.owner === me);
    };
    claim.waiting.add(take);
    take();
    return () => {
      claim.waiting.delete(take);
      if (claim.owner !== me) return;
      claim.owner = null;
      for (const waiting of Array.from(claim.waiting)) waiting();
    };
  }, [app, me]);
  return owns;
}
