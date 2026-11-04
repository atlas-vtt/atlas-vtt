import type { Message } from '../../types';

export const sort = {
  'sort.current': 'Sort by {field} (click to change)',
  'sort.ascending': 'Sort by {field}, ascending',
  'sort.descending': 'Sort by {field}, descending',
  'sort.name': 'Name',
  'sort.date': 'Date modified',
  'sort.type': 'Type',
  'sort.rating': 'Rating',
} as const satisfies Record<string, Message>;
