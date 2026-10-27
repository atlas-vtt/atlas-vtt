import type { Message } from '../../types';

export const map = {
  'map.loading': 'Loading map...',
  'map.readFailed': 'Atlas VTT could not read {file} ({reason}). A copy was kept at {backup}.',
  'map.untitled': 'Untitled Map',
  'map.loadingShort': 'Loading map...',
  'map.clearing': 'Clearing previous data...',
  'map.loadingImage': 'Loading map image...',
  'map.restoring': 'Restoring map data...',
  'map.loadingTokens': 'Loading tokens and pins...',
  'map.alignGrid': 'Align the grid',
  'map.detectingGrid': 'Detecting grid...',
  'map.loadingNTokens': { one: 'Loading {count} token...', other: 'Loading {count} tokens...' },
  'map.finalizing': 'Finalizing...',
  'map.noGridFound': 'No grid was found on this map, so none is shown.',
  'map.openFailed': 'Atlas VTT could not open the scene {name} ({reason}).',
  'map.imageUnshown': 'Atlas VTT could not show the map image {file}. {reason}',
  'map.videoTooLarge': 'The animated map {file} is {width} × {height} px, larger than this device can play ({side} px a side). It shows its first frame.',
  'map.videoUnplayable': 'The animated map {file} cannot play here, so it shows its first frame. {reason}',
} as const satisfies Record<string, Message>;
