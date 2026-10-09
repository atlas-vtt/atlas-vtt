import type { Message } from '../../types';

export const present = {
  'present.noMap': 'No active map to send to the player view',
  'present.noCanvas': 'No map canvas found. Please ensure a map is loaded.',
  'present.shows': 'Player view shows {name}',
  'present.chosen': 'Players will see {name} when you open the player window',
  'present.reconnect': 'Open the presented scene and send it to the player view to reconnect.',
  'present.loadFailed': 'The presented scene could not be loaded. Send a scene to reconnect.',
} as const satisfies Record<string, Message>;
