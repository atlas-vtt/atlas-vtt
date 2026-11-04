import type { Message } from '../../types';

export const menu = {
  'menu.clearRing': 'Clear ring',
  'menu.conditions': 'Conditions',
  'menu.conditionsFor': { one: 'Conditions ({count} token)', other: 'Conditions ({count} tokens)' },
  'menu.lower': 'Lower {label}',
  'menu.raise': 'Raise {label}',
  'menu.ring.blue': 'Blue',
  'menu.ring.brown': 'Brown',
  'menu.ring.cyan': 'Cyan',
  'menu.ring.gray': 'Gray',
  'menu.ring.green': 'Green',
  'menu.ring.lime': 'Lime',
  'menu.ring.orange': 'Orange',
  'menu.ring.pink': 'Pink',
  'menu.ring.purple': 'Purple',
  'menu.ring.red': 'Red',
  'menu.ring.white': 'White',
  'menu.ring.yellow': 'Yellow',
  'menu.ringColour': 'Ring colour {name}',
  'menu.size': 'Size',
  'menu.unnamedCondition': 'Unnamed condition',
} as const satisfies Record<string, Message>;
