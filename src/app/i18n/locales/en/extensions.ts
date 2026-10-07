import type { Message } from '../../types';

/** Atlas's own texts around what other plugins add; the extensions' labels and titles are theirs and never translated. */
export const extensions = {
  /** What a screen reader hears of a toolbar button's count: the extension's label and its badge. */
  'extensions.badge': '{label}: {badge}',
  'extensions.closePanel': 'Close {name}',
} as const satisfies Record<string, Message>;
