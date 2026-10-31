import { isAssetId, isRecord, type AssetKind } from '../../protocol/index.ts';

/**
 * The asset store's routes on the relay, and what their answers mean: the one place that knows their
 * shapes. Every route is on the relay's own origin, with the account's token in `Authorization`.
 */
export const ASSET_ROUTES = {
  offer: '/api/assets/offer',
  salt: '/api/assets/salt',
  whole: (id: string): string => `/api/assets/${id}`,
  parts: (id: string): string => `/api/assets/${id}/parts`,
  part: (id: string, part: number): string => `/api/assets/${id}/parts/${part}`,
  complete: (id: string): string => `/api/assets/${id}/complete`,
  tiles: (id: string): string => `/api/assets/${id}/tiles`,
} as const;

/** An asset as an offer names it. */
export interface OfferedAsset {
  readonly id: string;
  readonly kind: AssetKind;
  readonly size: number;
  /** A tile pyramid's levels and tile count (its pieces are those tiles and the manifest). */
  readonly tiles?: { readonly levels: number; readonly count: number };
}

/** How an asset goes up: one body, parts, or batches of tiles. */
export type UploadWay = 'single' | 'multipart' | 'tiles';

/**
 * Why the store will not take an asset: no room for it now (`retry`: the store makes room on its own,
 * so it may later), its kind, its size (larger than one asset or all the account may keep), an
 * account that may not store now, or another size than the one it holds part of the asset at
 * (`changed`: a pyramid it settled at its true size, offered again at its bound).
 */
export type OfferRefusal = 'quota' | 'too-large' | 'kind' | 'restricted' | 'changed';
const REFUSALS: readonly OfferRefusal[] = ['quota', 'too-large', 'kind', 'restricted', 'changed'];

/** The store's answer for one asset. */
export type OfferAnswer =
  | { readonly answer: 'have' }
  | { readonly answer: 'need'; readonly upload: UploadWay; readonly partBytes: number }
  | { readonly answer: 'refused'; readonly reason: OfferRefusal; readonly retry?: true };

function answerOf(value: unknown): OfferAnswer | null {
  if (!isRecord(value)) return null;
  if (value.answer === 'have') return { answer: 'have' };
  if (value.answer === 'need' && (value.upload === 'single' || value.upload === 'multipart' || value.upload === 'tiles')) {
    const partBytes = typeof value.partBytes === 'number' && Number.isSafeInteger(value.partBytes) && value.partBytes > 0 ? value.partBytes : PART_BYTES;
    return { answer: 'need', upload: value.upload, partBytes };
  }
  if (value.answer === 'refused') {
    const reason = REFUSALS.find((known) => known === value.reason);
    if (reason === undefined) return null;
    return reason === 'quota' && value.retry === true ? { answer: 'refused', reason, retry: true } : { answer: 'refused', reason };
  }
  return null;
}

/** The answers of an offer by id; an answer this version cannot read is left out (the asset is offered again later). */
export function offerAnswers(json: unknown): Map<string, OfferAnswer> {
  const answers = new Map<string, OfferAnswer>();
  const assets = isRecord(json) ? json.assets : undefined;
  if (!isRecord(assets)) return answers;
  for (const [id, value] of Object.entries(assets)) {
    const answer = answerOf(value);
    if (isAssetId(id) && answer !== null) answers.set(id, answer);
  }
  return answers;
}

/** What the store let go of older copies to make room for an offer. */
export interface OfferEviction {
  readonly count: number;
  readonly bytes: number;
}

/** An offer's `evicted`, read leniently: null where it is missing or malformed. */
export function offerEvicted(json: unknown): OfferEviction | null {
  const evicted = isRecord(json) ? json.evicted : undefined;
  if (!isRecord(evicted) || !isBytes(evicted.count) || !isBytes(evicted.bytes)) return null;
  return { count: evicted.count, bytes: evicted.bytes };
}

/** What a multipart upload under way holds: its id, and the parts (numbered from 1, as the store numbers them) that arrived. */
export interface PartsSession {
  readonly uploadId: string;
  readonly arrived: ReadonlySet<number>;
}

export function partsSessionOf(json: unknown): PartsSession | null {
  if (!isRecord(json) || typeof json.uploadId !== 'string' || json.uploadId === '') return null;
  const arrived = Array.isArray(json.arrived) ? json.arrived.filter((part): part is number => Number.isSafeInteger(part) && (part as number) > 0) : [];
  return { uploadId: json.uploadId, arrived: new Set(arrived) };
}

/** Where a pyramid stands after a batch: stored whole, and how many of its pieces (tiles and manifest) the store holds. */
export interface TilesProgress {
  readonly stored: boolean;
  readonly pieces: number;
  readonly of: number;
}

export function tilesProgressOf(json: unknown): TilesProgress | null {
  if (!isRecord(json) || typeof json.stored !== 'boolean' || !isBytes(json.pieces) || !isBytes(json.of)) return null;
  return { stored: json.stored, pieces: json.pieces, of: json.of };
}

const isBytes = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Parts of a multipart upload: 16 MiB, the last shorter. */
export const PART_BYTES = 16 * 1024 * 1024;

/** The sizes of the parts of an object of `size` bytes, in parts of `partBytes`. */
export function partSizes(size: number, partBytes: number = PART_BYTES): number[] {
  const count = Math.max(1, Math.ceil(size / partBytes));
  return Array.from({ length: count }, (_, index) => (index < count - 1 ? partBytes : size - partBytes * (count - 1)));
}
