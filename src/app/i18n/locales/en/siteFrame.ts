import type { Message } from '../../types';

/** A page of atlas-vtt.dev in a frame (the documentation window, the Armarium in the asset manager) while it cannot load. */
export const siteFrame = {
  'siteFrame.offline': 'You are offline',
  'siteFrame.retry': 'Try again',
} as const satisfies Record<string, Message>;
