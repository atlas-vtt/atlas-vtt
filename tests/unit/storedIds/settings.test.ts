/**
 * The ids that Atlas' settings (`data.json`) and a collection's settings (`collection.json`)
 * store choices under. Each list is written out, so a renamed id fails here instead of
 * silently dropping the GM's choice: a switch back off, a key back at its default, a hidden
 * tool or filter shown again.
 */
import { describe, it } from 'vitest';
import { CATALOG_CREATURE_FILTERS } from '../../../src/app/creatures/creatureFieldCatalog';
import { EXPERIMENTAL_FEATURES } from '../../../src/app/experimental/experimentalFeatures';
import { MAP_HOTKEYS } from '../../../src/app/keyboard/mapHotkeys';
import { SIDE_BAR_IDS, TOOLBAR_CONTROLS } from '../../../src/app/toolbar/toolbarCatalog';
import { expectStoredIds } from './storedIdList';

const EXPERIMENTAL_FEATURE_IDS = [
  'onlinePlay',
  'statblockEditor',
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

describe('ids that settings store choices under: a list only grows, and no id on it is renamed or removed', () => {
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

  it('keeps every map hotkey id, under which a key the GM chose is saved', () => {
    expectStoredIds(
      { what: 'Map hotkey ids', namedBy: "Atlas' settings (`hotkeys` in `data.json`)" },
      MAP_HOTKEYS.map((hotkey) => hotkey.id),
      HOTKEY_IDS,
    );
  });
});
