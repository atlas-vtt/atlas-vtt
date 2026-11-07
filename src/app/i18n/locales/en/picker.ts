import type { Message } from '../../types';

export const picker = {
  'picker.none.bases': 'No bases match “{query}”',
  'picker.none.notes': 'No notes match “{query}”',
  'picker.recent': 'Recently modified',
  'picker.results': 'Results',
  'picker.search.bases': 'Search bases',
  'picker.search.notes': 'Search notes',
  'picker.searchPlaceholder.bases': 'Search bases...',
  'picker.searchPlaceholder.notes': 'Search notes...',
} as const satisfies Record<string, Message>;
