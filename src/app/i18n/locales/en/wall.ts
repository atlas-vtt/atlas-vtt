import type { Message } from '../../types';

export const wall = {
  'wall.placeDoor': 'Place door',
  'wall.placeSecretDoor': 'Place secret door',
  'wall.direction': 'Light direction',
  'wall.blockBoth': 'Block both sides',
  'wall.allowLeft': 'Allow from left',
  'wall.allowRight': 'Allow from right',
  'wall.deleteMany': { one: 'Delete ({count} wall)', other: 'Delete ({count} walls)' },
  'wall.openDoor': 'Open door',
  'wall.closeDoor': 'Close door',
  'wall.lockDoor': 'Lock door',
  'wall.unlockDoor': 'Unlock door',
  'wall.removeDoor': 'Remove door',
  'wall.removePoint': 'Remove point',
  'wall.blocks': 'Blocks',
  'wall.blocksBoth': 'Sight and light',
  'wall.blocksSight': 'Sight only',
  'wall.blocksLight': 'Light only',
  'wall.limited': 'Limited (see past the first)',
  'wall.deleteOne': 'Delete this wall',
} as const satisfies Record<string, Message>;
