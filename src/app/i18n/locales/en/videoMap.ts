import type { Message } from '../../types';

export const videoMap = {
  'videoMap.collectionGone': 'The collection no longer exists. Choose another collection and try again.',
  'videoMap.failed': 'Could not import {file}. {problem}',
  'videoMap.imported': 'Added the animated map "{name}".',
  'videoMap.importing': 'Importing {file}…',
  'videoMap.notVideo': 'Only WebM and MP4 videos can be animated maps.',
  'videoMap.saveFailed': 'The map could not be saved: {reason}',
  'videoMap.tooLarge': 'The video is larger than {size}, the most an animated map may take.',
  'videoMap.unplayable': 'The video cannot be played here. Animated maps need WebM (VP8 or VP9) or MP4 (H.264).',
} as const satisfies Record<string, Message>;
