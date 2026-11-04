import type { Message } from '../../types';

export const notice = {
  'notice.dashboardOpenFailed': 'Error opening the dashboard',
  'notice.openImageFirst': 'Please open an image file first',
} as const satisfies Record<string, Message>;
