import type { Message } from '../../types';

export const videoMap = {
  'videoMap.tooLarge': 'The video is larger than {size}, the most an animated map may take.',
  'videoMap.unplayable': 'The video cannot be played here. Animated maps need WebM (VP8 or VP9) or MP4 (H.264).',
} as const satisfies Record<string, Message>;
