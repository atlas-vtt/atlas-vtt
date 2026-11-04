import type { Message } from '../../types';

export const mapIcon = {
  'mapIcon.doorOpen': 'Open Door',
  'mapIcon.doorClosed': 'Closed Door',
  'mapIcon.lock': 'Locked',
  'mapIcon.key': 'Key',
  'mapIcon.trap': 'Trap',
  'mapIcon.danger': 'Danger',
  'mapIcon.fire': 'Fire',
  'mapIcon.loot': 'Loot',
  'mapIcon.treasure': 'Treasure',
  'mapIcon.combat': 'Combat',
  'mapIcon.tracks': 'Tracks',
  'mapIcon.blocked': 'Blocked',
} as const satisfies Record<string, Message>;
