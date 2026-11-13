import type { Message } from '../../types';

/** The lighting tool's rooms mode: rooms carved out of the rock as walls. */
export const rooms = {
  'rooms.carve': 'Carve',
  'rooms.fill': 'Fill in',
  'rooms.door': 'Door',
  'rooms.rectangle': 'Rectangle',
  'rooms.points': 'Points',
  'rooms.lasso': 'Lasso',
  'rooms.brush': 'Brush',
  'rooms.brushSize': 'Brush size',
  'rooms.carveTip': 'Carve a room out of the rock: its edge becomes walls, and it opens into any room it reaches. Hold Alt to fill in instead',
  'rooms.fillTip': 'Fill rock back in: the walls inside go, and a room it cuts into is walled off there. Hold Alt to carve instead',
  'rooms.rectangleTip': 'Rectangle. Hold Shift to snap its corners to the grid',
  'rooms.pointsTip': 'Points, closed by clicking the first again. Hold Shift to snap them to the grid',
  'rooms.doorHint': 'Drag across an opening. Alt makes a secret door. Click a door\'s badge to open or close it.',
} as const satisfies Record<string, Message>;
