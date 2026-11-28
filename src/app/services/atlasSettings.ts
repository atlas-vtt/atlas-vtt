import type { HotkeyOverrides } from '../keyboard/hotkeyOverrides';
import { DEFAULT_LASER_POINTER_SETTINGS, type LaserPointerSettings } from '../tools/laserPointerSettings';
import type { DiceDisplay } from '../dice3d/diceDisplay';
import type { ExperimentalFeatureId } from '../experimental/experimentalFeatures';
import { DEFAULT_DICE_LOOK, type DiceColour, type DiceFont } from '../dice3d/diceLook';
import type { StoredToolbarLayout } from '../toolbar/toolbarLayout';
import type { PlayersListEdge } from '../initiative/initiativeLayout';
import { DEFAULT_DUNGEON_GENERATOR_SETTINGS, type DungeonGeneratorSettings } from '../dungeons/generatorSettings';
import { DEFAULT_SOUND_SETTINGS, type SoundSettings } from './soundSettings';
import type { SharedSoundRoots } from '../soundLibrary/soundRootsStore';
import { DEFAULT_TABLE_TV_SETTINGS, type TableTvSettings } from './tableTvSettings';
import type { GmScreenKeys } from './gmScreenKeysSettings';
import { DEFAULT_FOG_EDGE, type FogEdge } from '../fog/fogEdge';
import { DEFAULT_DRAG_DISTANCE, type DragDistance } from '../measure/dragDistance';
import { isRecord } from '../utils/guards';

/** Every tutorial Atlas has; the settings list those the user finished or skipped. */
export const TUTORIAL_IDS = ['welcome', 'dashboard', 'map', 'online', 'tableLog', 'assets', 'palette', 'tokenStatblocks', 'lootSettings', 'lootRoller', 'lootResults', 'savedRolls'] as const;
export type TutorialId = typeof TUTORIAL_IDS[number];

/**
 * What the plugin's `data.json` holds, key by key. Each key is read and changed through its row in
 * `PREFERENCES` (`preferences/preferences.ts`); a file may lack any of them, or hold keys of other versions.
 */
export interface AtlasSettings {
  showChangelogOnUpdate: boolean;
  changelogMajorUpdatesOnly: boolean;
  /** Whether Atlas looks for a newer version of itself at start and hourly (`registerUpdateWatch`). */
  checkForUpdates: boolean;
  /** Only the bindings the user changed; read the effective ones with `getHotkeys`. */
  hotkeys: HotkeyOverrides;
  onboarding: { enabled: boolean; completed: Partial<Record<TutorialId, boolean>>; tokenImported: boolean };
  /** The starter tokens were added to the default collection once; deleted ones stay deleted. */
  starterTokensAdded: boolean;
  /**
   * Uids of the collections whose sidebar no longer offers the starter tokens: a uid outlives a rename of the
   * collection's folder. Absent while none is hidden.
   */
  hiddenStarterOffers?: readonly string[] | undefined;
  /**
   * Ids of the Sound page's download offers the GM dismissed (`starter-ambience`, `starter-music`; ids never
   * change). Absent while none is. The root's ⋯ menu still offers them.
   */
  hiddenSoundOffers?: readonly string[] | undefined;
  laserPointer: LaserPointerSettings;
  /** How rolls show: a result card, or 3D dice at double or normal speed. */
  diceDisplay: DiceDisplay;
  /** Loudness of dice sounds, 0 (silent) to 1. */
  diceVolume: number;
  /** Levels, default fade and following scenes for music and ambience. */
  sound: SoundSettings;
  /** The sound library's linked folders, as far as devices share them. */
  soundRoots?: SharedSoundRoots;
  /** Whether a new scene looks for the grid of its map. Off for tables that play without one. */
  detectGridOnNewScenes: boolean;
  /** How the fog's edge looks, on the GM's map and the players'. */
  fogEdge: FogEdge;
  /** When a dragged token shows how far it has moved: always, only while a fight runs, or never. */
  dragDistance: DragDistance;
  /** Colour of the dice: card stock, dark, the accent colour or a colour of the Appearance page. */
  diceColour: DiceColour;
  /** Face of the dice numerals and roll totals. */
  diceFont: DiceFont;
  /** The GM's tracker is a compact list without portraits. */
  initiativeCompact?: boolean;
  /** The edge the players' list stands at; `top` and `bottom` run it as a row. */
  initiativeDock: PlayersListEdge;
  /** Every edge the players' list stands at; unset, `initiativeDock` alone, which stays the first of them for older versions. */
  initiativeEdges?: PlayersListEdge[];
  /** Whether each copy of the players' list turns to face its edge; unset, upright. */
  initiativeFacesPlayers?: boolean;
  /** Whether a turn change shows the turn banner. */
  initiativeBanner: boolean;
  /** Whether online players move their tokens in a fight only on their turn. */
  initiativeMovesOnTurn: boolean;
  /** Experimental features the GM switched on. */
  experimental: Partial<Record<ExperimentalFeatureId, boolean>>;
  /** The GM's toolbar layout, only what differs from the default. */
  toolbar: StoredToolbarLayout;
  /** Whether the bars along the bottom and the level switcher show only while the pointer is near them; unset, always shown. */
  toolbarAutoHide?: boolean;
  /** The GM screen's grids of keys, by kind of device, each only once the GM changed it. */
  gmScreenKeys?: GmScreenKeys | undefined;
  /** The dungeon generator's style, view and last tags. */
  dungeonGenerator: DungeonGeneratorSettings;
  localPlayerView: {
    // UI element visibility toggles
    showToolbar: boolean;
    showTokenNameplates: boolean;
    showNotePreviews: boolean;
    showWidgets: boolean;
    showInitiative: boolean;
    /** Show the DM's dice rolls to players as toasts in the player window. */
    showDiceRolls: boolean;
    showCommandPalette: boolean;
    /** Online play: everyone at the table sees everyone else's cursor on the shared map. */
    showCursors: boolean;
    /** How large the initiative list is drawn, 1 to `MAX_INITIATIVE_SCALE`. Read with `initiativeScaleOf`. */
    initiativeScale: number;
    /** The border of the combatant whose turn it is pulses instead of standing still. */
    initiativePulse: boolean;
    /** The turn banner stands just above each initiative list, turned with it, instead of in the middle. */
    turnBannerAtLists: boolean;
    /** A turn dims the table instead of showing its banner, the initiative lists left lit. A fight's start and end keep theirs. */
    turnDim: boolean;
    /** The most cards each initiative list shows, 0 for all. Read with `initiativeMaxCardsOf`. */
    initiativeMaxCards: number;
    /** Online play: players draw and write on the shared map with a Draw tool of their own. */
    playersDraw: boolean;
    /** Online play: players at a closed door may ask the GM to open it. */
    playersOpenDoors: boolean;
    /** Online play: every player sees through every player character's vision; off, each through their own characters' alone. */
    sharedVision: boolean;
  };
  /** The player view on a TV lying on the table (TrueScale). */
  tableTv: TableTvSettings;
}

export const DEFAULT_SETTINGS: AtlasSettings = {
  showChangelogOnUpdate: true,
  changelogMajorUpdatesOnly: false,
  checkForUpdates: true,
  hotkeys: {},
  onboarding: { enabled: true, completed: {}, tokenImported: false },
  starterTokensAdded: false,
  laserPointer: DEFAULT_LASER_POINTER_SETTINGS,
  diceDisplay: 'full',
  diceVolume: 1,
  sound: DEFAULT_SOUND_SETTINGS,
  detectGridOnNewScenes: true,
  fogEdge: DEFAULT_FOG_EDGE,
  dragDistance: DEFAULT_DRAG_DISTANCE,
  diceColour: DEFAULT_DICE_LOOK.colour,
  diceFont: DEFAULT_DICE_LOOK.font,
  initiativeDock: 'right',
  initiativeBanner: true,
  initiativeMovesOnTurn: false,
  experimental: {},
  toolbar: {},
  dungeonGenerator: DEFAULT_DUNGEON_GENERATOR_SETTINGS,
  localPlayerView: {
    // UI element visibility defaults
    showToolbar: false, // Hide toolbar by default in player view
    showTokenNameplates: false, // Hide nameplates
    showNotePreviews: false, // Hide note previews
    showWidgets: true,
    showInitiative: true,
    showDiceRolls: false,
    showCommandPalette: false, // Hide command palette
    showCursors: false,
    initiativeScale: 1,
    initiativePulse: false,
    turnBannerAtLists: false,
    turnDim: false,
    initiativeMaxCards: 0,
    playersDraw: false,
    playersOpenDoors: false,
    sharedVision: false,
  },
  tableTv: DEFAULT_TABLE_TV_SETTINGS,
};

/** `target` with `source`'s values on top, records merged key by key; keys only `source` has are kept. */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(source)) {
    const base = target[key];
    if (isRecord(value) && isRecord(base)) result[key] = deepMerge(base, value);
    else if (value !== undefined) result[key] = value;
  }
  return result;
}

/**
 * A key's value as the settings take it when comparing what changed: what is stored, merged over
 * the key's default, so a key the file lacks equals its default.
 */
export function overDefault(key: string, stored: unknown): unknown {
  const fallback: unknown = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[key];
  if (stored === undefined) return fallback;
  return isRecord(stored) && isRecord(fallback) ? deepMerge(fallback, stored) : stored;
}
