import type { Message } from '../../types';

export const cleanup = {
  'cleanup.backgrounds': { one: '{count} map background', other: '{count} map backgrounds' },
  'cleanup.roofs': { one: '{count} roof', other: '{count} roofs' },
  'cleanup.confirm': 'Remove these references from the map?',
  'cleanup.done': { one: 'Cleaned up {count} missing asset reference', other: 'Cleaned up {count} missing asset references' },
  'cleanup.found': 'Found {found} pointing at images that no longer exist.',
  'cleanup.noMapData': 'Unable to access map data',
  'cleanup.nothingMissing': 'No missing assets found',
  'cleanup.title': 'Clean up missing assets',
  'cleanup.tokens': { one: '{count} token', other: '{count} tokens' },
} as const satisfies Record<string, Message>;
