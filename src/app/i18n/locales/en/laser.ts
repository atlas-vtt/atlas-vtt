import type { Message } from '../../types';

export const laser = {
  'laser.color.red': 'Red',
  'laser.color.orange': 'Orange',
  'laser.color.yellow': 'Yellow',
  'laser.color.mint': 'Mint',
  'laser.color.sky': 'Sky blue',
  'laser.color.blue': 'Blue',
  'laser.color.pink': 'Pink',
  'laser.color.white': 'White',
  'laser.colorHint': 'Sky blue, blue and white stay clear for colour-blind players.',
} as const satisfies Record<string, Message>;
