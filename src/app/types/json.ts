/** Plain JSON: all an extension may keep on Atlas's records. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
