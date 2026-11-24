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
  'rooms.bucketTip': 'Click or drag inside a room on the map: the floor around it is found up to the walls the art draws within the outer ring, its holes are filled and the inner ring is carved whatever the art shows. Pour several buckets to fill a room bit by bit',
  'rooms.bucketRadius': 'Bucket radius',
  'rooms.bucketSensitivity': 'Edge sensitivity',
  'rooms.stabilize': 'Stabilization',
  'rooms.experimental.label': 'Room bucket',
  'rooms.experimental.hint': 'The Bucket in the lighting tool\'s rooms mode: click or drag over a painted map and the floor is found up to the walls the art draws, and carved. While off, the bucket is hidden.',
  'rooms.bucketFoundNothing': 'The bucket found no floor here. Try another spot or another sensitivity',
  'rooms.carveTip': 'Carve a room out of the rock: its edge becomes walls, and it opens into any room it reaches. Hold Alt to fill in instead',
  'rooms.fillTip': 'Fill rock back in: the walls inside go, and a room it cuts into is walled off there. Hold Alt to carve instead',
  'rooms.rectangleTip': 'Rectangle. Hold Shift to snap its corners to the grid',
  'rooms.pointsTip': 'Points, closed by clicking the first again. Hold Shift to snap them to the grid',
  'rooms.doorHint': 'Drag across an opening. Alt makes a secret door. Click a door\'s badge to open or close it.',
} as const satisfies Record<string, Message>;
