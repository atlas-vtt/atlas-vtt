import type { Message } from '../../types';

export const contents = {
  'contents.countOf': '{count} of {total}',
  'contents.includeAll': 'Include all {group}',
  'contents.none': 'None',
  'contents.orphaned': 'Only used by content you left out',
} as const satisfies Record<string, Message>;
