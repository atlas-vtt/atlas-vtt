import type { Message } from '../../types';

export const measure = {
  'measure.popover': 'Measurement',
  'measure.heading': '{shape} · {value}',
  'measure.shape.ruler': 'Ruler',
  'measure.shape.circle': 'Circle',
  'measure.shape.cone': 'Cone',
  'measure.shape.square': 'Square',
  'measure.shape.line': 'Line',
} as const satisfies Record<string, Message>;
