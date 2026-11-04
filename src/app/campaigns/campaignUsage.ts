import { CAMPAIGN_FORMAT } from './campaignPaths';
import type { CampaignUsage, StoredCampaign, UsedSpan } from './campaignTypes';
import { isAssetId, isRecord, isTime } from './campaignValues';

/** The most scenes a campaign remembers; past it the one used longest ago is forgotten. */
export const MAX_USED_SCENES = 5000;

function readSpan(value: unknown): UsedSpan | undefined {
  if (!isRecord(value) || !isTime(value.first) || !isTime(value.last) || value.first > value.last) return undefined;
  return { first: value.first, last: value.last };
}

const storedScenes = (stored: StoredCampaign): Record<string, unknown> => {
  const used = isRecord(stored.used) ? stored.used : undefined;
  return used && isRecord(used.scenes) ? used.scenes : {};
};

/** What a campaign file says it used, or undefined when it names nothing that can be read. Unreadable entries are left out. */
export function readUsage(value: unknown): CampaignUsage | undefined {
  if (!isRecord(value) || !isRecord(value.scenes)) return undefined;
  const scenes = Object.entries(value.scenes).flatMap(([id, entry]): [string, UsedSpan][] => {
    const span = isAssetId(id) ? readSpan(entry) : undefined;
    return span ? [[id, span]] : [];
  }).slice(0, MAX_USED_SCENES);
  return scenes.length > 0 ? { scenes: Object.fromEntries(scenes) } : undefined;
}

/**
 * The campaign as stored, with the scene `sceneId` played at `at`: its span of use grows to `at`,
 * and it becomes the last scene unless the file already names a later play (another device's).
 * Every other field, of `used` too, stays as it is; a file of a later format is returned unchanged.
 */
export function withScenePlayed(stored: StoredCampaign, sceneId: string, at: number): StoredCampaign {
  if (typeof stored.format === 'number' && stored.format > CAMPAIGN_FORMAT) return stored;
  const scenes = storedScenes(stored);
  const before = Object.hasOwn(scenes, sceneId) ? readSpan(scenes[sceneId]) : undefined;
  const span: UsedSpan = before ? { first: Math.min(before.first, at), last: Math.max(before.last, at) } : { first: at, last: at };
  const nextScenes = forgetOldest({ ...scenes, [sceneId]: span }, sceneId);
  const used = isRecord(stored.used) ? stored.used : {};
  const isLatest = !isTime(stored.lastPlayed) || stored.lastPlayed <= at;
  return {
    ...stored,
    used: { ...used, scenes: nextScenes },
    ...(isLatest && { lastScene: sceneId, lastPlayed: at }),
  };
}

/** Drops the scenes used longest ago while there are more than `MAX_USED_SCENES`, never `keep`. */
function forgetOldest(scenes: Record<string, unknown>, keep: string): Record<string, unknown> {
  const ids = Object.keys(scenes);
  if (ids.length <= MAX_USED_SCENES) return scenes;
  const lastUse = (id: string): number => readSpan(scenes[id])?.last ?? -1;
  const dropped = new Set(ids.filter((id) => id !== keep).sort((a, b) => lastUse(a) - lastUse(b)).slice(0, ids.length - MAX_USED_SCENES));
  return Object.fromEntries(Object.entries(scenes).filter(([id]) => !dropped.has(id)));
}
