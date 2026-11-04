import type { Message } from '../../types';

export const count = {
  'count.assets': { one: '{count} asset', other: '{count} assets' },
  'count.files': { one: '{count} file', other: '{count} files' },
  'count.items': { one: '{count} item', other: '{count} items' },
} as const satisfies Record<string, Message>;
