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
  'image.unsupported': 'This image is {width} × {height} px, more than Obsidian opens at once, and Atlas can read an image this large only as a plain JPEG or a PNG without interlacing. {advice}',
  'image.unsupported.progressive': 'Save it as a plain JPEG, not progressive, and import it again.',
  'image.unsupported.interlaced': 'Save the PNG without interlacing and import it again.',
  'image.unsupported.orientation': 'Export it upright, without the turn in its camera data, and import it again.',
  'image.unsupported.scans': 'Save it as a plain JPEG and import it again.',
  'image.unsupported.coding': 'Save it as a plain 8-bit JPEG and import it again.',
  'image.unsupported.components': 'Save it as an RGB JPEG and import it again.',
  'image.unsupported.corrupt': 'The file could not be read; export it again.',
  'image.unreadable': 'This image is {width} × {height} px, more than Obsidian opens at once, and its file could not be read. Export it again and import it again.',
} as const satisfies Record<string, Message>;
