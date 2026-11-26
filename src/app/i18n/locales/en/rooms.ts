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
  'rooms.bucket': 'Bucket',
  'rooms.bucketTip': 'Click or drag inside a room to carve its floor up to the drawn walls',
  'rooms.bucketRadius': 'Bucket radius',
  'rooms.bucketSensitivity': 'Edge sensitivity',
  'rooms.stabilize': 'Stabilization',
  'rooms.experimental.label': 'Room bucket',
  'rooms.experimental.hint': 'The Bucket in the lighting tool\'s rooms mode: click or drag over a painted map and the floor is found up to the walls the art draws, and carved. While off, the bucket is hidden.',
  'rooms.bucketFoundNothing': 'The bucket found no floor here. Try another spot or another sensitivity',
  'rooms.carveTip': 'Carve a room out of the rock. Hold Alt to fill in',
  'rooms.fillTip': 'Fill rock back in. Hold Alt to carve',
  'rooms.rectangleTip': 'Hold Shift to snap to the grid',
  'rooms.pointsTip': 'Click corners, then the first again to close. Shift snaps to the grid',
  'rooms.doorHint': 'Drag across an opening. Hold Alt for a secret door',
} as const satisfies Record<string, Message>;
