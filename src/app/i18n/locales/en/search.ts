import type { Message } from '../../types';

export const search = {
  'search.label': 'Search',
  'search.current': 'Search: {query}',
  'search.assets': 'Search assets',
  'search.placeholderFilters': 'Search… try cr:1-3 or type:beast',
  'search.placeholder': 'Search…',
} as const satisfies Record<string, Message>;
