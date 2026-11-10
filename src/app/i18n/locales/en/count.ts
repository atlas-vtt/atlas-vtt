import type { Message } from '../../types';

export const count = {
  'count.assets': { one: '{count} asset', other: '{count} assets' },
  'count.encounters': { one: '{count} encounter', other: '{count} encounters' },
  'count.files': { one: '{count} file', other: '{count} files' },
  'count.items': { one: '{count} item', other: '{count} items' },
  'count.maps': { one: '{count} map', other: '{count} maps' },
  'count.scenes': { one: '{count} scene', other: '{count} scenes' },
  'count.tokens': { one: '{count} token', other: '{count} tokens' },
} as const satisfies Record<string, Message>;
