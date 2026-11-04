import type { Message } from '../../types';

export const color = {
  'color.auto': 'Auto',
  'color.black': 'Black',
  'color.blue': 'Blue',
  'color.gray': 'Gray',
  'color.green': 'Green',
  'color.magenta': 'Magenta',
  'color.orange': 'Orange',
  'color.pink': 'Pink',
  'color.purple': 'Purple',
  'color.red': 'Red',
  'color.white': 'White',
  'color.yellow': 'Yellow',
  'color.cyan': 'Cyan',
  'color.darkGray': 'Dark Gray',
  'color.brown': 'Brown',
  'color.default': 'Default',
} as const satisfies Record<string, Message>;
