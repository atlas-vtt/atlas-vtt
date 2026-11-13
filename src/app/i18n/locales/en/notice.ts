import type { Message } from '../../types';

export const notice = {
  'notice.dashboardOpenFailed': 'Error opening the dashboard',
  'notice.openImageFirst': 'Please open an image file first',
  'notice.measuresFull': 'A map can keep {count} measurements. Delete one to keep another.',
  'notice.drawingsFull': 'A map can hold {count} drawings. Erase some to draw more.',
  'notice.textsFull': 'A map can hold {count} texts. Delete one to add another.',
} as const satisfies Record<string, Message>;
