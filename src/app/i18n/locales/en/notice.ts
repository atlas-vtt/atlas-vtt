import type { Message } from '../../types';

export const notice = {
  'notice.dashboardOpenFailed': 'Error opening the dashboard',
  'notice.openImageFirst': 'Please open an image file first',
  'notice.measuresFull': 'A map can keep {count} measurements. Delete one to keep another.',
} as const satisfies Record<string, Message>;
