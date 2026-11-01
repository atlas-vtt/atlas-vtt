import type { Asset, AssetOfType, AssetService, SoundAsset } from '../services/AssetService';
import type { SoundKind, SoundLicence, SoundRecord, SoundStreaming } from '../sound/soundTypes';
import { isFiniteNumber, isRecord } from '../utils/guards';

/** How far the GM's trim goes either way, in dB. */
export const MAX_TRIM_DB = 24;

/** Under this length a file named like a loop is ambience. */
const AMBIENCE_MAX_SECONDS = 10 * 60;
const LOOP_LOOKING_NAME = /\b(loops?|looped|looping|ambien[ct]e?|ambient|atmos|atmosphere|soundscape|drone|room ?tone|bed)\b|[_-]loop/i;

const LICENCES: ReadonlySet<string> = new Set<SoundLicence>(['unknown', 'cc0', 'cc-by', 'other']);
const STREAMING: ReadonlySet<string> = new Set<SoundStreaming>(['unknown', 'licensed', 'not-for-streaming']);

/** A sound's kind when nobody chose one: ambience for a short file named like a loop, music otherwise. An unknown length leaves the name to decide. */
export function defaultSoundKind(fileName: string, seconds: number | null): SoundKind {
  const short = seconds === null || seconds < AMBIENCE_MAX_SECONDS;
  return short && LOOP_LOOKING_NAME.test(fileName) ? 'ambience' : 'music';
}

export const clampTrim = (db: number): number => Math.max(-MAX_TRIM_DB, Math.min(MAX_TRIM_DB, db));

function readLoop(value: unknown): SoundRecord['loop'] {
  if (!isRecord(value)) return undefined;
  const { startFrame, endFrame } = value;
  return isFiniteNumber(startFrame) && isFiniteNumber(endFrame) && startFrame >= 0 && endFrame > startFrame ? { startFrame, endFrame } : undefined;
}

/**
 * A sound's record as the engine and the tab read it. A record file arrives unchecked, so what
 * cannot be read here reads as unset; the file keeps what it holds, for the version that wrote it.
 */
export function soundRecordOf(asset: SoundAsset): SoundRecord {
  const { id, name, audioPath, tags, kind, licence, streaming, trimDb, credit, sourceUrl } = asset;
  const loop = readLoop(asset.loop);
  return {
    id,
    name,
    kind: kind === 'ambience' ? 'ambience' : 'music',
    filePath: audioPath,
    tags,
    licence: LICENCES.has(licence) ? licence : 'unknown',
    streaming: STREAMING.has(streaming) ? streaming : 'unknown',
    ...(loop && { loop }),
    ...(isFiniteNumber(trimDb) && { trimDb: clampTrim(trimDb) }),
    ...(typeof credit === 'string' && credit !== '' && { credit }),
    ...(typeof sourceUrl === 'string' && sourceUrl !== '' && { sourceUrl }),
  };
}

/** The sounds of a collection, or of every collection, as records. */
export async function soundRecordsOf(assets: Pick<AssetService, 'getAssets'>, collectionId?: string): Promise<SoundRecord[]> {
  const sounds: AssetOfType<'sound'>[] = await assets.getAssets(collectionId, 'sound');
  return sounds.map(soundRecordOf);
}

/** One sound by id, in whichever collection it lies; null when none is. */
export async function soundRecordById(assets: Pick<AssetService, 'getAssetById'>, id: string): Promise<SoundRecord | null> {
  const asset: Asset | null = await assets.getAssetById(id);
  return asset?.type === 'sound' ? soundRecordOf(asset) : null;
}

/** Fields to change on sounds; `undefined` removes the field. */
export type SoundChanges = { [K in keyof SoundAsset]?: SoundAsset[K] | undefined };

/** Changes the sounds named in one save: every save rewrites the whole index. */
export async function updateSounds(assets: Pick<AssetService, 'rewriteAssets'>, ids: readonly string[], changes: SoundChanges, now = Date.now()): Promise<void> {
  const chosen = new Set(ids);
  await assets.rewriteAssets((asset) => {
    if (asset.type !== 'sound' || !chosen.has(asset.id)) return false;
    Object.assign(asset, changes, { modifiedAt: now });
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined) Reflect.deleteProperty(asset, key);
    }
    return true;
  });
}
