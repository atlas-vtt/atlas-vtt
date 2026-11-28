import { readFogEdge } from '../../fog/fogEdge';
import { readDragDistance } from '../../measure/dragDistance';
import { resolveLaserPointerSettings } from '../../tools/laserPointerSettings';
import { isDiceDisplay, type DiceDisplay } from '../../dice3d/diceDisplay';
import type { ExperimentalFeatureId } from '../../experimental/experimentalFeatures';
import { readToolbarLayout, type StoredToolbarLayout } from '../../toolbar/toolbarLayout';
import { readDungeonGeneratorSettings } from '../../dungeons/generatorSettings';
import { readSharedSoundRoots } from '../../soundLibrary/soundRootsStore';
import { isRecord } from '../../utils/guards';
import { readSoundSettings } from '../soundSettings';
import { readTableTvSettings } from '../tableTvSettings';
import { readGmScreenKeys, type GmScreenKeys } from '../gmScreenKeysSettings';
import { DEFAULT_SETTINGS, type AtlasSettings } from '../atlasSettings';
import { fields, whole, type PreferenceRow } from './preferenceRow';

type SyncedKey = keyof AtlasSettings;
type BooleanKey = { [K in SyncedKey]-?: AtlasSettings[K] extends boolean | undefined ? K : never }[SyncedKey];

/** A switch: anything but `true` or `false` reads as `fallback`. */
const flag = (key: BooleanKey, fallback: boolean): PreferenceRow<boolean> =>
  whole('synced', key, (stored) => (typeof stored === 'boolean' ? stored : fallback));

/** A list of ids as stored (collection uids, offer ids); anything else reads as none. Stored only while it holds one. */
const idList = (key: 'hiddenStarterOffers' | 'hiddenSoundOffers'): PreferenceRow<readonly string[]> =>
  whole('synced', key, (stored) => (Array.isArray(stored) ? [...new Set(stored.filter((id): id is string => typeof id === 'string' && id !== ''))] : []), {
    encode: (ids) => ((ids as readonly string[]).length > 0 ? ids : undefined),
  });

/** `list` with `id` in it or not, the others in their order. */
export function withListed(list: readonly string[], id: string, listed: boolean): readonly string[] {
  const others = list.filter((other) => other !== id);
  return listed ? [...others, id] : others;
}

function readOnboarding(stored: unknown): AtlasSettings['onboarding'] {
  const record = isRecord(stored) ? stored : {};
  const completed = isRecord(record.completed) ? record.completed : {};
  return {
    enabled: record.enabled !== false,
    // Tours of a newer Atlas stay in the list, so changing one here keeps theirs
    completed: Object.fromEntries(Object.entries(completed).filter(([, done]) => typeof done === 'boolean')),
    tokenImported: record.tokenImported === true,
  };
}

type ExperimentalSwitches = Partial<Record<ExperimentalFeatureId, boolean>>;

/**
 * Experimental features the GM switched on, by id: anything but `true` reads as off, so switching
 * off one that was never on changes nothing. A switch is stored as `true` or `false` beside the
 * others, those of features no longer experimental included.
 */
const experimental: PreferenceRow<ExperimentalSwitches, ExperimentalSwitches> = {
  store: 'synced',
  keys: ['experimental'],
  read: (stored) => {
    const record = stored('experimental');
    return isRecord(record) ? Object.fromEntries(Object.entries(record).filter(([, on]) => on === true)) : {};
  },
  write: (change, stored) => {
    const record = stored('experimental');
    return { experimental: { ...(isRecord(record) ? record : {}), ...change } };
  },
};

/** The GM's preferences that follow them to every device, each under its key in the plugin's `data.json`. */
export const SYNCED_PREFERENCES = {
  showChangelogOnUpdate: flag('showChangelogOnUpdate', DEFAULT_SETTINGS.showChangelogOnUpdate),
  changelogMajorUpdatesOnly: flag('changelogMajorUpdatesOnly', DEFAULT_SETTINGS.changelogMajorUpdatesOnly),
  /** Whether Atlas looks for a newer version of itself at start and hourly (`registerUpdateWatch`). */
  checkForUpdates: flag('checkForUpdates', DEFAULT_SETTINGS.checkForUpdates),
  /** The starter tokens were added to the default collection once; deleted ones stay deleted. */
  starterTokensAdded: flag('starterTokensAdded', DEFAULT_SETTINGS.starterTokensAdded),
  /** The tutorials finished or skipped, whether the others show, and whether a token was ever imported. */
  onboarding: fields('synced', 'onboarding', readOnboarding),
  /** Uids of the collections whose sidebar no longer offers the starter tokens: a uid outlives a rename of the collection's folder. */
  hiddenStarterOffers: idList('hiddenStarterOffers'),
  /** Ids of the Sound page's download offers the GM dismissed; the root's ⋯ menu still offers them. */
  hiddenSoundOffers: idList('hiddenSoundOffers'),
  laserPointer: fields('synced', 'laserPointer', (stored) => resolveLaserPointerSettings(isRecord(stored) ? stored : undefined)),
  /** How rolls show: a result card, or 3D dice at double or normal speed. */
  diceDisplay: whole('synced', 'diceDisplay', (stored): DiceDisplay => (isDiceDisplay(stored) ? stored : 'full')),
  /** Loudness of dice sounds, 0 (silent) to 1. */
  diceVolume: whole('synced', 'diceVolume', (stored) => (typeof stored === 'number' && stored >= 0 && stored <= 1 ? stored : 1), {
    encode: (volume) => Math.min(1, Math.max(0, volume as number)),
  }),
  /** Levels, default fade and following scenes for music and ambience. */
  sound: fields('synced', 'sound', readSoundSettings),
  /** The sound library's linked folders, as far as devices share them. */
  soundRoots: whole('synced', 'soundRoots', readSharedSoundRoots),
  /** Whether a new scene looks for the grid of its map. Off for tables that play without one. */
  detectGridOnNewScenes: flag('detectGridOnNewScenes', DEFAULT_SETTINGS.detectGridOnNewScenes),
  /** How the fog's edge looks, on the GM's map and the players'. */
  fogEdge: fields('synced', 'fogEdge', readFogEdge),
  /** When a dragged token shows how far it has moved: always, only while a fight runs, or never. */
  dragDistance: whole('synced', 'dragDistance', readDragDistance),
  /** The GM's tracker is a compact list without portraits. */
  initiativeCompact: flag('initiativeCompact', false),
  experimental,
  /** The GM's toolbar layout, only what differs from the default; resolve it with `resolveToolbarLayout`. */
  toolbar: whole<StoredToolbarLayout>('synced', 'toolbar', readToolbarLayout, { encode: readToolbarLayout }),
  /** Whether the bars along the bottom and the level switcher show only while the pointer is near them. */
  toolbarAutoHide: flag('toolbarAutoHide', false),
  /** The GM screen's grids of keys, by kind of device, each only once the GM changed it. The devices' pages send them. */
  gmScreenKeys: { ...whole('synced', 'gmScreenKeys', (stored): GmScreenKeys => readGmScreenKeys(stored) ?? {}), onLoad: readGmScreenKeys },
  /** The dungeon generator's style, view and last tags. */
  dungeonGenerator: fields('synced', 'dungeonGenerator', readDungeonGeneratorSettings),
  /** What the player view shows. Its fields are not checked: what is stored reads as it is. */
  localPlayerView: fields('synced', 'localPlayerView', (stored): AtlasSettings['localPlayerView'] => ({ ...DEFAULT_SETTINGS.localPlayerView, ...(isRecord(stored) ? stored : {}) })),
  /** The player view on a TV lying on the table (TrueScale). */
  tableTv: fields('synced', 'tableTv', readTableTvSettings),
};
