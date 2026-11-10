/** Set by the client's and the companion's builds (`buildDefine` in `vite.base.mts`); absent in tests and the relay. */
declare const __ATLAS_ONLINE_BUILD__: string | undefined;

/** The commit this build was made from, or `dev` where no build set it. */
export const BUILD: string = typeof __ATLAS_ONLINE_BUILD__ === 'string' ? __ATLAS_ONLINE_BUILD__ : 'dev';
