import type { Message } from '../../types';

export const drawing = {
  'drawing.color': 'Color',
  'drawing.changeIcon': 'Change Icon',
} as const satisfies Record<string, Message>;
