import type { Message } from '../../types';

/** The Atlas theme's looks: the command palette's Appearance page and the welcome wizard. */
export const appearance = {
  'appearance.title': 'Appearance',
  'appearance.commandHint': 'The Atlas theme’s look',
  'appearance.look': 'Look',
  'appearance.lookHint': 'How the Atlas theme draws your notes, menus and Atlas’ panels.',
  'appearance.own': 'Your theme',
  'appearance.mediaeval': 'Mediaeval',
  'appearance.scifi': 'Sci-fi',
} as const satisfies Record<string, Message>;
