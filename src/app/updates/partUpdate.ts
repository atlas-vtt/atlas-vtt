import { version } from '../../../manifest.json';

/** The version this code was built from: the bundler writes the manifest's version into the bundle. */
export const BUILT_VERSION: string = version;

/**
 * Whether the manifest beside the running code names another version than the code was built from.
 * A sync tool that skips large files carries a new `manifest.json` and `styles.css` to a device and
 * leaves the old `main.js` there, which then runs under the new version number.
 */
export function isPartUpdate(installed: string, built: string): boolean {
  return installed !== built;
}
