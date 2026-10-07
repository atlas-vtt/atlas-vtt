import type { Message } from '../../types';

export const present = {
  'present.noMap': 'No active map to send to the player view',
  'present.noCanvas': 'No map canvas found. Please ensure a map is loaded.',
  'present.shows': 'Player view shows {name}',
  'present.reconnect': 'Open the presented scene and send it to the player view to reconnect.',
  'present.loadFailed': 'The presented scene could not be loaded. Send a scene to reconnect.',
  'present.openSceneFirst': 'Open a scene to present it to players',
  'present.playersSeeThisScene': 'Players see this scene',
  'present.playersSeeThisSceneOnceLoaded': 'Players see this scene once it loads',
  'present.playersSee': 'Players see {name}',
  'present.playersSeeOnceLoaded': 'Players see {name} once it loads',
  'present.stopped': 'Players no longer see a scene',
} as const satisfies Record<string, Message>;
