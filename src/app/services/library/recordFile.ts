import type { Asset, MapAsset } from '../AssetService';
import { collectionIdOfPath } from '../assetPaths';
import { isRecord, isStringArray } from '../../utils/guards';

/** The key under which a record file keeps the asset record, beside the payload older versions read. */
export const RECORD_KEY = 'atlasRecord';

/** The record format this version writes. A file with a higher one comes from a newer Atlas and is never rewritten. */
export const RECORD_FORMAT = 1;

const ASSET_TYPES: ReadonlySet<string> = new Set(['token', 'map', 'note', 'statblock', 'character', 'scene', 'encounter', 'player']);

/** Types whose payload is `data`, written at the top level of their JSON as older versions expect. */
const PAYLOAD_TYPES: ReadonlySet<string> = new Set(['scene', 'encounter', 'player', 'character', 'statblock']);

/** Fields group assets keep both on the record and in their payload; the record file stores them once, in the payload. */
const MIRRORED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  encounter: ['tokens', 'difficulty', 'formation'],
  player: ['tokens', 'level', 'class'],
};

/**
 * Fields the file's place decides. The collection a record was written for is
 * kept (it tells a copied collection folder's files from the original's); the
 * collection a record belongs to is always its file's folder.
 */
const PLACE_FIELDS = ['filePath'] as const;

/** What older versions read from a map's JSON; kept at the top level beside the record. */
function legacyMapFields(asset: MapAsset): Record<string, unknown> {
  return {
    id: asset.id,
    name: asset.name,
    mapFilePath: asset.mapFilePath,
    tags: asset.tags,
    collection: asset.collection,
    createdAt: asset.createdAt,
    modifiedAt: asset.modifiedAt,
  };
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The record without its payload, its place and the fields its payload already holds. */
function envelopeOf(asset: Asset, payload: Record<string, unknown>): Record<string, unknown> {
  const envelope: Record<string, unknown> = { format: RECORD_FORMAT };
  const mirrored = new Set(MIRRORED_FIELDS[asset.type] ?? []);
  for (const [key, value] of Object.entries(asset)) {
    if (key === 'data' || (PLACE_FIELDS as readonly string[]).includes(key)) continue;
    if (mirrored.has(key) && key in payload && sameJson(payload[key], value)) continue;
    envelope[key] = value;
  }
  return envelope;
}

/** The payload an asset writes at the top level of its record file. */
function payloadOf(asset: Asset): Record<string, unknown> {
  if (asset.type === 'map') return legacyMapFields(asset);
  if (!PAYLOAD_TYPES.has(asset.type)) return {};
  const data: unknown = 'data' in asset ? asset.data : undefined;
  if (!isRecord(data)) return {};
  const { [RECORD_KEY]: _ignored, ...payload } = data;
  return payload;
}

/**
 * A JSON-backed record whose payload only its file holds (an index from before
 * payloads were kept in it). Writing its record before the payload is read would empty the file.
 */
export function isPayloadUnread(asset: Asset): boolean {
  return PAYLOAD_TYPES.has(asset.type) && !isRecord('data' in asset ? asset.data : undefined);
}

/** The content of an asset's record file: its payload as older versions read it, and the whole record beside it. */
export function serializeRecord(asset: Asset): string {
  const payload = payloadOf(asset);
  return JSON.stringify({ ...payload, [RECORD_KEY]: envelopeOf(asset, payload) }, null, 2);
}

/** A record file as read: the record when it carries one, and the payload around it. */
export interface ParsedRecordFile {
  /** The record's format, or null for a file without a record (written by an older version). */
  format: number | null;
  record: Asset | null;
  /** The collection the record was written for, which differs from its folder's when the file was copied or moved there. */
  writtenFor: string | null;
  payload: Record<string, unknown>;
}

const numberOr = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

/** Whether a record names the file its type requires. */
function hasRequiredFields(record: Record<string, unknown>): boolean {
  switch (record.type) {
    case 'token': return typeof record.imagePath === 'string';
    case 'map': return typeof record.mapFilePath === 'string';
    case 'note': return typeof record.notePath === 'string';
    case 'encounter':
    case 'player': return Array.isArray(record.tokens);
    default: return true;
  }
}

/** Whether `value` is a whole asset record as the index keeps it. */
function isAssetRecord(value: unknown): value is Asset {
  return isRecord(value)
    && typeof value.id === 'string' && value.id !== ''
    && typeof value.type === 'string' && ASSET_TYPES.has(value.type)
    && typeof value.name === 'string'
    && typeof value.collection === 'string' && value.collection !== ''
    && isStringArray(value.tags)
    && typeof value.createdAt === 'number'
    && typeof value.modifiedAt === 'number'
    && hasRequiredFields(value);
}

/** The asset a record file stands for; its collection and, for JSON-backed types, its place come from where the file lies. */
function assetFromEnvelope(envelope: Record<string, unknown>, payload: Record<string, unknown>, path: string): Asset | null {
  const { format: _format, ...fields } = envelope;
  const createdAt = numberOr(fields.createdAt, 0);
  const record: Record<string, unknown> = {
    ...fields,
    tags: isStringArray(fields.tags) ? fields.tags : [],
    collection: collectionIdOfPath(path) ?? '',
    createdAt,
    modifiedAt: numberOr(fields.modifiedAt, createdAt),
  };
  const type = typeof fields.type === 'string' ? fields.type : '';
  if (type !== 'token' && type !== 'note') record.filePath = path;
  if (PAYLOAD_TYPES.has(type)) {
    record.data = payload;
    for (const key of MIRRORED_FIELDS[type] ?? []) {
      if (!(key in record) && key in payload) record[key] = payload[key];
    }
  }
  if ((type === 'encounter' || type === 'player') && !Array.isArray(record.tokens)) record.tokens = [];
  return isAssetRecord(record) ? record : null;
}

/** Reads a record file; null when it is no JSON object. */
export function parseRecordFile(text: string, path: string): ParsedRecordFile | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const { [RECORD_KEY]: envelope, ...payload } = parsed;
  if (!isRecord(envelope)) return { format: null, record: null, writtenFor: null, payload };
  const format = numberOr(envelope.format, RECORD_FORMAT);
  const writtenFor = typeof envelope.collection === 'string' && envelope.collection ? envelope.collection : null;
  return { format, record: assetFromEnvelope(envelope, payload, path), writtenFor, payload };
}
