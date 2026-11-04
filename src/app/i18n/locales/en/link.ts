import type { Message } from '../../types';

export const link = {
  'link.notFound': 'Statblock not found: {path}',
  'link.linked': 'Token linked to statblock',
  'link.moved': '{token} now links this statblock instead of {previous}',
  'link.unlinked': 'Token unlinked from statblock',
  'link.created': 'Created token from {name}',
  'link.noneCreated': 'No token created.',
  'link.importFailed': 'Could not import this statblock.',
  'link.unknown': 'Unknown',
} as const satisfies Record<string, Message>;
