import type { Message } from '../../types';

/** Single Atlas files (statblock templates, game systems, dice sets) packed on their own. */
export const itemBundle = {
  'itemBundle.notItem': 'This file is not an Atlas export.',
  'itemBundle.tooNew': 'This file was exported by a newer version of Atlas. Update Atlas to import it.',
  'itemBundle.damaged': 'This file is damaged.',
  'itemBundle.unsafe': 'This file contains a file Atlas will not write: {path}',
  'itemBundle.builtIn': 'What is built into Atlas is in every vault already, so it is not shared.',
  'itemBundle.missing': 'This is no longer in your vault.',
  'itemBundle.unreadable': 'This template could not be read.',
  'itemBundle.exported': 'Saved {name} as {file}.',
  'itemBundle.exportFailed': 'Exporting failed: {reason}',
} as const satisfies Record<string, Message>;
