import type { Message } from '../../types';

export const mapPreview = {
  'mapPreview.open': 'Open map',
  'mapPreview.openFailed': 'Could not open the map',
  'mapPreview.title': 'Atlas VTT Map',
} as const satisfies Record<string, Message>;
