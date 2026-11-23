import type { Message } from '../../types';

/** The looks Atlas offers, the GM's own theme among them: the command palette's Appearance page and the welcome wizard. */
export const appearance = {
  'appearance.title': 'Appearance settings',
  'appearance.commandHint': 'Your theme, Mediaeval or Sci-fi, and the accent colour',
  'appearance.look': 'Look',
  'appearance.lookHint': 'Keep your Obsidian theme, or dress notes, menus and panels in one of Atlas’ looks.',
  'appearance.own': 'Your theme',
  'appearance.ownDefault': 'Obsidian’s default',
  'appearance.mediaeval': 'Mediaeval',
  'appearance.mediaevalNote': 'Ink and ivy',
  'appearance.scifi': 'Sci-fi',
  'appearance.scifiNote': 'Chalk and contours',
  'appearance.accent': 'Accent colour',
  'appearance.accentHint': 'Buttons, checkboxes and highlights. Each look brings its own.',
  'appearance.accentOwn': 'The look’s own',
  'appearance.accentCustom': 'Custom',
  'appearance.accentPresets.crimson': 'Crimson',
  'appearance.accentPresets.ember': 'Ember',
  'appearance.accentPresets.gold': 'Gold',
  'appearance.accentPresets.moss': 'Moss',
  'appearance.accentPresets.teal': 'Teal',
  'appearance.accentPresets.azure': 'Azure',
  'appearance.accentPresets.violet': 'Violet',
  'appearance.accentPresets.rose': 'Rose',
} as const satisfies Record<string, Message>;
