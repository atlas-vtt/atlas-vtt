import type { ApiVersion } from './apiTypes';

/**
 * The version of `AtlasApi`. Major 0 while companions are built against one exact minor; every change
 * raises the minor. Major 1 freezes it; from then on only additions, which raise the minor.
 */
export const API_VERSION: ApiVersion = Object.freeze({ major: 0, minor: 1 });
