import type { Message } from '../../types';

export const image = {
  'image.copy': 'Copy image',
  'image.openDefault': 'Open in default app',
  'image.openDefaultMenu': 'Open in Default App',
  'image.display': 'Display on player view',
  'image.copied': 'Image copied to clipboard',
  'image.copyFailed': 'Failed to copy image',
  'image.windowClosed': 'Player window is not open. Please open it first.',
  'image.windowUnavailable': 'Player window is not available',
  'image.displayFailed': 'Failed to display image on player view',
  'image.closed': 'Image display closed',
  'image.tooLarge': 'This image is {width} × {height} px, larger than Obsidian can open: at most {megapixels} megapixels and {side} px a side. Export it smaller and import it again.',
} as const satisfies Record<string, Message>;
