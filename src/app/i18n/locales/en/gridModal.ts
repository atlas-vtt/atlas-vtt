import type { Message } from '../../types';

export const gridModal = {
  'gridModal.apply': 'Apply Settings',
  'gridModal.opacity': 'Grid Opacity',
  'gridModal.perHex': 'per hex',
  'gridModal.perSquare': 'per square',
  'gridModal.show': 'Show Grid',
  'gridModal.size': 'Grid Size',
  'gridModal.title': 'Grid Settings',
  'gridModal.type': 'Grid Type',
  'gridModal.unit.feet': 'feet',
  'gridModal.unit.meters': 'meters',
  'gridModal.unit.units': 'units',
  'gridModal.unit.yards': 'yards',
  'gridModal.units': 'Grid Units',
} as const satisfies Record<string, Message>;
