import type { Message } from '../../types';

/** The documentation panel of the map view: the live docs of atlas-vtt.dev in a frame. */
export const docs = {
  'docs.title': 'Documentation',
  'docs.panel': 'Atlas documentation',
  'docs.openInBrowser': 'Open in browser',
  'docs.close': 'Close documentation',
  'docs.loading': 'Loading the documentation',
  'docs.offlineBody': 'The documentation is on atlas-vtt.dev and needs an internet connection.',
  'docs.command': 'Open documentation',
} as const satisfies Record<string, Message>;
