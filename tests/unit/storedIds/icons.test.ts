/**
 * The icon ids that files in users' vaults name: a pin stores its icon's id, and a widget or a
 * condition the id of an icon of the widget set. Each list is written out, so a renamed id
 * fails here instead of turning every pin or condition that names it into the default icon.
 */
import { describe, expect, it } from 'vitest';
import { PIN_ICON_PATHS, resolvePinIcon } from '../../../src/app/types/pinIcons';
import { WIDGET_ICON_PATHS, resolveWidgetIcon } from '../../../src/app/types/widgetIcons';
import { expectStoredIds } from './storedIdList';

const PIN_ICON_IDS = [
  'altar',
  'barrel',
  'bed',
  'boss',
  'bridge',
  'camp',
  'castle',
  'cauldron',
  'cave',
  'cell',
  'city',
  'coffin',
  'combat',
  'crate',
  'crossroads',
  'desert',
  'desk',
  'door',
  'dungeon',
  'farm',
  'fireplace',
  'forest',
  'gate',
  'graveyard',
  'hills',
  'house',
  'important',
  'inn',
  'island',
  'jungle',
  'lever',
  'library',
  'lighthouse',
  'location',
  'lore',
  'manor',
  'map',
  'mine',
  'mirror',
  'mountain',
  'note',
  'npc',
  'oasis',
  'outpost',
  'pin',
  'pit',
  'port',
  'portal',
  'quest',
  'ritual-circle',
  'road',
  'ruins',
  'secret',
  'secret-door',
  'shipwreck',
  'shop',
  'shrine',
  'signpost',
  'smithy',
  'stable',
  'stairs',
  'standing-stones',
  'statue',
  'swamp',
  'temple',
  'throne',
  'torch',
  'tower',
  'trap',
  'trapdoor',
  'treasure',
  'village',
  'volcano',
  'waterfall',
  'well',
  'world',
];

/** What pins of older versions store, and the icon each opens with: an entry is never removed or pointed elsewhere. */
const RETIRED_PIN_ICONS: Record<string, string> = {
  'alert-triangle': 'trap',
  'coins': 'treasure',
  'eye': 'secret',
  'flag': 'quest',
  'heart': 'npc',
  'info': 'lore',
  'map-pin': 'location',
  'scroll': 'note',
  'skull': 'boss',
  'star': 'important',
  'swords': 'combat',
};

/** A pin that shows the next label of a sequence stores the sequence in place of an icon. */
const PIN_LABEL_KINDS = ['letter', 'number'];

const WIDGET_ICON_IDS = [
  'arm-sling',
  'bleeding-eye',
  'bleeding-wound',
  'blindfold',
  'brain',
  'brain-freeze',
  'brain-tentacle',
  'broken-bone',
  'campfire',
  'clover',
  'coins',
  'cracked-shield',
  'crossed-swords',
  'crown',
  'd20',
  'd6',
  'dragon',
  'drop',
  'eye',
  'falling',
  'flame',
  'fog',
  'foot-trip',
  'footprints',
  'frozen-body',
  'gem',
  'ghost',
  'grab',
  'grim-reaper',
  'guard',
  'health-potion',
  'hearing-disabled',
  'heart',
  'heartbeat',
  'hidden',
  'hood',
  'hourglass',
  'imprisoned',
  'invisible',
  'key',
  'knocked-out-stars',
  'knockout',
  'life-tap',
  'lightning',
  'magic',
  'meditation',
  'moon',
  'poison',
  'potion',
  'prayer',
  'psychic-waves',
  'puppet',
  'rations',
  'run',
  'screaming',
  'scroll',
  'shield',
  'skull',
  'sleepy',
  'snail',
  'snowflake',
  'spellbook',
  'spider-web',
  'spiral-bloom',
  'star',
  'stoned-skull',
  'stopwatch',
  'strength',
  'sun',
  'surprised',
  'sword',
  'terror',
  'tired-eye',
  'torch',
  'vomiting',
  'weight',
  'wings',
  'wolf',
];

/** What widgets of older versions store, and the icon each shows. */
const RETIRED_WIDGET_ICONS: Record<string, string> = {
  book: 'spellbook',
  hand: 'strength',
  timer: 'hourglass',
};

const resolvedWith = (resolve: (stored: string) => string, retired: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.keys(retired).map((stored) => [stored, resolve(stored)]));

describe('icon ids that vault files name: a list only grows, and no id on it is renamed or removed', () => {
  it('keeps every pin icon id, which the pins of a scene store', () => {
    expectStoredIds(
      {
        what: 'Pin icon ids',
        namedBy: 'Pins in scenes and snapshots (`icon`)',
        retiredThrough: 'An icon that must go is given an entry in `LEGACY_PIN_ICONS` (src/app/types/pinIcons.ts) that names the icon its pins open with; '
          + 'only then does its id move from this list to the retired ones below, with the maintainer.',
      },
      Object.keys(PIN_ICON_PATHS),
      PIN_ICON_IDS,
    );
  });

  it('still opens the pins of older versions with the icon each retired id stands for', () => {
    expect(
      resolvedWith(resolvePinIcon, RETIRED_PIN_ICONS),
      'A retired pin icon id opens with another icon than before, or with the default one: its entry in `LEGACY_PIN_ICONS` (src/app/types/pinIcons.ts) '
      + 'was removed or changed. Pins in older scenes still store these ids, so an entry stays for good. A new entry is added to the list in this test.',
    ).toEqual(RETIRED_PIN_ICONS);
  });

  it('keeps the label sequences a pin stores in place of an icon', () => {
    expect(
      PIN_LABEL_KINDS.map(resolvePinIcon),
      'A numbered or lettered pin no longer opens as one: `isPinLabelKind` (src/app/tools/pinLabels.ts) lost or renamed a kind that pins in scenes store as their `icon`.',
    ).toEqual(PIN_LABEL_KINDS);
  });

  it('keeps every id of the widget icon set, which widgets and conditions store', () => {
    expectStoredIds(
      {
        what: 'Widget and condition icon ids',
        namedBy: 'Widgets and conditions in collections (`collection.json`), scenes and game system presets (`icon`)',
        retiredThrough: 'An icon that must go is given a line in `resolveWidgetIcon` (src/app/types/widgetIcons.ts) that names the icon it shows as; '
          + 'only then does its id move from this list to the retired ones below, with the maintainer.',
      },
      Object.keys(WIDGET_ICON_PATHS),
      WIDGET_ICON_IDS,
    );
  });

  it('still shows the widgets of older versions with the icon each retired id stands for', () => {
    expect(
      resolvedWith(resolveWidgetIcon, RETIRED_WIDGET_ICONS),
      'A retired widget icon id shows another icon than before, or the default one: its line in `resolveWidgetIcon` (src/app/types/widgetIcons.ts) '
      + 'was removed or changed. Widgets in older files still store these ids, so a line stays for good. A new line is added to the list in this test.',
    ).toEqual(RETIRED_WIDGET_ICONS);
  });
});
