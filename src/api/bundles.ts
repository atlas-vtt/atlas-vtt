import { bundleNoteKeys } from '../app/extensions/bundleNoteKeys';
import type { ExtensionScope } from './extension';
import type { Disposer } from './types/common';
import type { BundlesApi } from './types/scenes';

/** The most note properties one call may strip, and the longest name, so the list kept in Atlas's settings stays small. */
export const MAX_STRIPPED_KEYS = 100;
export const MAX_STRIPPED_KEY_LENGTH = 200;

const isKey = (key: unknown): key is string => typeof key === 'string' && key.trim() !== '' && key.length <= MAX_STRIPPED_KEY_LENGTH;

export function bundlesApi(scope: Pick<ExtensionScope, 'id' | 'disposers'>): BundlesApi {
  return Object.freeze({
    stripNoteProperties: (given: readonly string[]): Disposer => {
      // Copied once, so the caller changing its array later changes nothing Atlas keeps.
      const keys: unknown[] | null = Array.isArray(given) ? [...(given as unknown[])] : null;
      if (!keys || keys.length > MAX_STRIPPED_KEYS || !keys.every(isKey)) {
        throw new Error(`[Atlas API] bundles.stripNoteProperties: the keys must be an array of at most ${MAX_STRIPPED_KEYS} non-empty property names of at most ${MAX_STRIPPED_KEY_LENGTH} characters.`);
      }
      // Unloading the extension ends only the live registration; Atlas keeps the keys until the returned disposer is called.
      const stopLive = scope.disposers.add(bundleNoteKeys.add(scope.id, keys));
      bundleNoteKeys.remember(scope.id, keys);
      let done = false;
      return (): void => {
        // Once only: a second call must not forget keys a later stripNoteProperties remembered.
        if (done) return;
        done = true;
        stopLive();
        bundleNoteKeys.forget(scope.id, keys);
      };
    },
    forgetNoteProperties: (): void => bundleNoteKeys.forgetAll(scope.id),
  });
}
