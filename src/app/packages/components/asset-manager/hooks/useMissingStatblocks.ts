import { useEffect, useState } from 'react';
import type { App, EventRef } from 'obsidian';
import type { AnyAsset } from '../types';

const NONE: ReadonlySet<string> = new Set();

/** The statblock notes the tokens among `assets` link to that the vault does not hold. */
function missingStatblockPaths(app: App, assets: readonly AnyAsset[]): ReadonlySet<string> {
  const missing = new Set<string>();
  for (const asset of assets) {
    const path = asset.type === 'tokens' ? asset.statblockPath : undefined;
    if (path && !app.vault.getFileByPath(path)) missing.add(path);
  }
  return missing.size > 0 ? missing : NONE;
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((path) => b.has(path));
}

/**
 * The statblock notes shown tokens link to that are gone from the vault, kept
 * current while the vault changes: a note a sync tool delivers later counts as
 * there again once it arrives. Only what is shown changes; the link itself stays.
 */
export function useMissingStatblocks(app: App, assets: readonly AnyAsset[]): ReadonlySet<string> {
  const [missing, setMissing] = useState(() => missingStatblockPaths(app, assets));

  useEffect(() => {
    const update = (): void => {
      const next = missingStatblockPaths(app, assets);
      setMissing((previous) => (sameSet(previous, next) ? previous : next));
    };
    update();
    if (!assets.some((asset) => asset.type === 'tokens' && asset.statblockPath)) return undefined;
    const refs: EventRef[] = [app.vault.on('create', update), app.vault.on('delete', update), app.vault.on('rename', update)];
    return () => { for (const ref of refs) app.vault.offref(ref); };
  }, [app, assets]);

  return missing;
}
