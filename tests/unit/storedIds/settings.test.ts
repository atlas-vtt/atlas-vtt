/**
 * The ids that Atlas' settings (`data.json`) and a collection's settings (`collection.json`)
 * store choices under. Each list is written out, so a renamed id fails here instead of
 * silently dropping the GM's choice: a switch back off, a key back at its default, a hidden
 * tool or filter shown again.
 */
import { describe, it } from 'vitest';
import { DICE_COLOUR_OPTIONS } from '../../../src/app/dice3d/diceLook';
import { CATALOG_CREATURE_FILTERS } from '../../../src/app/creatures/creatureFieldCatalog';
import { EXPERIMENTAL_FEATURES } from '../../../src/app/experimental/experimentalFeatures';
import { MAP_HOTKEYS } from '../../../src/app/keyboard/mapHotkeys';
import { FOLDER_GLYPHS, GM_SCREEN_DEVICES, KEY_COMMANDS } from '../../../src/app/online/protocol/index.ts';
import { SIDE_BAR_IDS, TOOLBAR_CONTROLS } from '../../../src/app/toolbar/toolbarCatalog';
import { PREFERENCES } from '../../../src/app/services/preferences/preferences';
import { DEVICE_PREFERENCES } from '../../../src/app/services/deviceSettings';
import { expectStoredIds } from './storedIdList';

/** The keys of Atlas' settings file a preference is stored under. */
const SETTINGS_FILE_KEYS = [
  'changelogMajorUpdatesOnly',
  'checkForUpdates',
  'detectGridOnNewScenes',
  'diceColour',
  'diceDisplay',
  'diceFont',
  'diceVolume',
  'dragDistance',
  'dungeonGenerator',
  'experimental',
  'fogEdge',
  'gmScreenKeys',
  'hiddenSoundOffers',
  'hiddenStarterOffers',
  'hotkeys',
  'initiativeBanner',
  'initiativeCompact',
  'initiativeDock',
  'initiativeEdges',
  'initiativeFacesPlayers',
  'initiativeMovesOnTurn',
  'laserPointer',
  'localPlayerView',
  'onboarding',
  'showChangelogOnUpdate',
  'sound',
  'soundRoots',
  'starterTokensAdded',
  'tableTv',
  'toolbar',
  'toolbarAutoHide',
];

/** The keys of the vault's local storage a preference of the device is stored under. */
const DEVICE_STORAGE_KEYS = [
  'atlas-vtt:animate-maps',
  'atlas-vtt:draw-tool',
  'atlas-vtt:finger-use',
  'atlas-vtt:gm-fog-opacity',
  'atlas-vtt:graphics',
  'atlas-vtt:input-mode',
  'atlas-vtt:lighting-quality',
  'atlas-vtt:lighting-quality-picked',
  'atlas-vtt:pen-seen',
  'atlas-vtt:player-view-4k',
  'atlas-vtt:selection-bar',
  'atlas-vtt:table-tv',
  'atlas-vtt:zoom-buttons',
];

const EXPERIMENTAL_FEATURE_IDS = [
  'onlinePlay',
  'statblockEditor',
  'roomBucket',
];

const CATALOG_CREATURE_FILTER_IDS = [
  'alignment',
  'cr',
  'level',
  'rarity',
  'source',
  'tier',
  'traits',
  'type',
];

/** The main toolbar's controls and the bars beside it: a stored layout orders and hides both by id. */
const TOOLBAR_UNIT_IDS = [
  'assets',
  'audio',
  'dice',
  'draw',
  'fog',
  'help',
  'loot',
  'measure',
  'move',
  'online',
  'palette',
  'pin',
  'undo',
  'wall',
];

const DICE_COLOUR_IDS = [
  'light',
  'dark',
  'accent',
  'crimson',
  'ember',
  'gold',
  'moss',
  'teal',
  'azure',
  'violet',
  'rose',
];

const HOTKEY_IDS = [
  'assets',
  'audio',
  'cancel',
  'copy',
  'cut',
  'dashboard',
  'decrease',
  'delete',
  'deleteAlt',
  'diceLog',
  'diceTray',
  'draw',
  'drawLarger',
  'drawSmaller',
  'duplicate',
  'erase',
  'fitMap',
  'fitToken',
  'fog',
  'gmView',
  'help',
  'increase',
  'increaseAlt',
  'initiative',
  'levelDown',
  'levelUp',
  'lightingPeek',
  'lootRoller',
  'measure',
  'measureKeep',
  'move',
  'nextMood',
  'nextTurn',
  'palette',
  'paste',
  'pin',
  'previousTurn',
  'redo',
  'redoAlt',
  'sceneSwitcher',
  'selectAll',
  'silence',
  'soundPage',
  'text',
  'timerPlayPause',
  'timerReset',
  'undo',
  'wall',
  'widget1',
  'widget2',
  'widget3',
  'widget4',
  'widget5',
];

/** The GM screen's grids of keys: by kind of device, a key's command by name, a folder's glyph. */
const GM_SCREEN_DEVICE_IDS = ['phone', 'tablet'];
const GM_SCREEN_KEY_COMMAND_IDS = [
  'combat',
  'curtain',
  'freeze',
  'handout',
  'muteMusic',
  'nextMood',
  'nextTrack',
  'pause',
  'playerWindow',
  'present',
  'previousTrack',
  'repeat',
  'rollInitiative',
  'shareRolls',
  'shuffle',
  'stopAll',
];
const GM_SCREEN_FOLDER_GLYPH_IDS = ['dice', 'flame', 'folder', 'map', 'moon', 'music', 'shield', 'skull', 'star', 'swords'];

describe('ids that settings store choices under: a list only grows, and no id on it is renamed or removed', () => {
  it('keeps every key of the settings file a preference is stored under', () => {
    expectStoredIds(
      { what: 'Settings file keys', namedBy: "Atlas' settings (`data.json`)" },
      Object.values(PREFERENCES).filter((row) => row.store === 'synced').flatMap((row) => row.keys),
      SETTINGS_FILE_KEYS,
    );
  });

  it("keeps every key of the device's local storage a preference is stored under", () => {
    expectStoredIds(
      { what: 'Device storage keys', namedBy: "Each device's local storage of the vault" },
      Object.values(DEVICE_PREFERENCES).flatMap((row) => row.keys),
      DEVICE_STORAGE_KEYS,
    );
  });

  it('keeps every experimental feature id, under which the GM switched the feature on', () => {
    expectStoredIds(
      { what: 'Experimental feature ids', namedBy: "Atlas' settings (`experimental` in `data.json`)" },
      EXPERIMENTAL_FEATURES.map((feature) => feature.id),
      EXPERIMENTAL_FEATURE_IDS,
    );
  });

  it('keeps every catalog creature filter id, by which a collection hides a filter', () => {
    expectStoredIds(
      { what: 'Catalog creature filter ids', namedBy: 'Collections (`hiddenCreatureFilters` in `collection.json`)' },
      CATALOG_CREATURE_FILTERS.map((filter) => filter.id),
      CATALOG_CREATURE_FILTER_IDS,
    );
  });

  it("keeps the id of every toolbar control and bar beside it, by which the GM's layout orders and hides them", () => {
    expectStoredIds(
      { what: 'Toolbar control and side bar ids', namedBy: "Atlas' settings (`toolbar.order` and `toolbar.hidden` in `data.json`)" },
      [...TOOLBAR_CONTROLS.map((control) => control.id), ...SIDE_BAR_IDS],
      TOOLBAR_UNIT_IDS,
    );
  });

  it('keeps every dice colour id, under which the GM picked the colour of the dice', () => {
    expectStoredIds(
      { what: 'Dice colour ids', namedBy: "Atlas' settings (`diceColour` in `data.json`)" },
      DICE_COLOUR_OPTIONS.map((option) => option.value),
      DICE_COLOUR_IDS,
    );
  });

  it('keeps every map hotkey id, under which a key the GM chose is saved', () => {
    expectStoredIds(
      { what: 'Map hotkey ids', namedBy: "Atlas' settings (`hotkeys` in `data.json`)" },
      MAP_HOTKEYS.map((hotkey) => hotkey.id),
      HOTKEY_IDS,
    );
  });

  it("keeps every id the GM screen's grids of keys are stored under", () => {
    const namedBy = "Atlas' settings (`gmScreenKeys` in `data.json`)";
    expectStoredIds({ what: 'GM screen device kinds', namedBy }, GM_SCREEN_DEVICES, GM_SCREEN_DEVICE_IDS);
    expectStoredIds({ what: 'GM screen key commands', namedBy }, KEY_COMMANDS, GM_SCREEN_KEY_COMMAND_IDS);
    expectStoredIds({ what: 'GM screen folder glyphs', namedBy }, FOLDER_GLYPHS, GM_SCREEN_FOLDER_GLYPH_IDS);
  });
});
