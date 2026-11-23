import type { Message } from '../../types';

/** The looks Atlas offers, the GM's own theme among them: the command palette's Appearance page and the welcome wizard. */
export const appearance = {
  'appearance.title': 'Appearance',
  'appearance.commandHint': 'Your theme, Mediaeval or Sci-fi',
  'appearance.look': 'Look',
  'appearance.lookHint': 'Keep your Obsidian theme, or dress notes, menus and panels in one of Atlas’ looks.',
  'appearance.own': 'Your theme',
  'appearance.ownDefault': 'Obsidian’s default',
  'appearance.mediaeval': 'Mediaeval',
  'appearance.mediaevalNote': 'Ink and ivy',
  'appearance.scifi': 'Sci-fi',
  'appearance.scifiNote': 'Chalk and contours',
} as const satisfies Record<string, Message>;
