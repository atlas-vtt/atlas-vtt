import type { Message } from '../../types';

export const notice = {
  'notice.dashboardOpenFailed': 'Error opening the dashboard',
  'notice.openImageFirst': 'Please open an image file first',
  'notice.measuresFull': 'A map can keep {count} measurements. Delete one to keep another.',
  'notice.drawingsFull': 'A map can hold {count} drawings. Erase some to draw more.',
  'notice.textsFull': 'A map can hold {count} texts. Delete one to add another.',
  'notice.drawingCutFull': 'This drawing cannot be cut any further. Erase it whole instead.',
  'notice.drawingsLeftOut': 'This map has more than {count} drawings. Only the first {count} are shown.',
  'notice.textsLeftOut': 'This map has more than {count} texts. Only the first {count} are shown.',
} as const satisfies Record<string, Message>;
