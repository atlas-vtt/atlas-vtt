import type { Message } from '../../types';

/** The names of a dungeon's pieces: on the GM's hover label, and counted in a room's note. */
export const dungeonProp = {
  'dungeonProp.name.dais': 'Dais',
  'dungeonProp.name.statue': 'Statue',
  'dungeonProp.name.fountain': 'Fountain',
  'dungeonProp.name.well': 'Well',
  'dungeonProp.name.hearth': 'Fireplace',
  'dungeonProp.name.bust': 'Bust',
  'dungeonProp.name.stalagmites': 'Stalagmites',
  'dungeonProp.name.columnFormation': 'Stone column',
  'dungeonProp.name.flowstone': 'Flowstone',
  'dungeonProp.name.curtain': 'Stone curtain',
  'dungeonProp.name.crystals': 'Crystals',
  'dungeonProp.name.mushrooms': 'Mushrooms',
  'dungeonProp.name.boulder': 'Boulder',
  'dungeonProp.name.campfire': 'Fire pit',

  'dungeonProp.count.dais': { one: 'a dais', other: '{count} daises' },
  'dungeonProp.count.statue': { one: 'a statue', other: '{count} statues' },
  'dungeonProp.count.fountain': { one: 'a fountain', other: '{count} fountains' },
  'dungeonProp.count.well': { one: 'a well', other: '{count} wells' },
  'dungeonProp.count.hearth': { one: 'a fireplace', other: '{count} fireplaces' },
  'dungeonProp.count.bust': { one: 'a bust', other: '{count} busts' },
  'dungeonProp.count.stalagmites': { one: 'a cluster of stalagmites', other: '{count} clusters of stalagmites' },
  'dungeonProp.count.columnFormation': { one: 'a stone column', other: '{count} stone columns' },
  'dungeonProp.count.flowstone': { one: 'a sheet of flowstone', other: '{count} sheets of flowstone' },
  'dungeonProp.count.curtain': { one: 'a stone curtain', other: '{count} stone curtains' },
  'dungeonProp.count.crystals': { one: 'a cluster of crystals', other: '{count} clusters of crystals' },
  'dungeonProp.count.mushrooms': { one: 'a patch of mushrooms', other: '{count} patches of mushrooms' },
  'dungeonProp.count.boulder': { one: 'a boulder', other: '{count} boulders' },
  'dungeonProp.count.campfire': { one: 'a fire pit', other: '{count} fire pits' },
} as const satisfies Record<string, Message>;
