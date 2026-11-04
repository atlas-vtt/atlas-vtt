/** Readers of single values in a campaign file, which may hold anything. */

/** The longest asset id a campaign refers to. */
export const MAX_ASSET_ID = 200;

export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A time in milliseconds since the epoch. */
export const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Whether `value` can be an asset id a campaign refers to. */
export const isAssetId = (value: unknown): value is string => typeof value === 'string' && value !== '' && value.length <= MAX_ASSET_ID;
