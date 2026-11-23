import type { Message } from '../../types';

export const downloads = {
  'downloads.title': 'Downloads',
  'downloads.buttonActive': 'Downloads, {percent}%',
  'downloads.queued': 'Queued',
  'downloads.percent': '{percent}%',
  'downloads.cancelled': 'Cancelled',
  'downloads.failed': 'Download failed',
  'downloads.done': 'Done · {size}',
  'downloads.amount': '{done} of {total}',
  'downloads.left': '{time} left',
  'downloads.cancel': 'Cancel',
  'downloads.retry': 'Try again',
  'downloads.show': 'Show',
  'downloads.clear': 'Clear finished',
  'downloads.reason.unavailable': 'Server unavailable',
  'downloads.reason.damaged': 'Download damaged',
  'downloads.reason.folder': 'Folder unavailable',
  'downloads.reason.disk': 'Could not save',
  'downloads.reason.connection': 'No connection',
  'downloads.finishedOne': '{title} downloaded',
  'downloads.finishedMany': { one: '{count} download finished', other: '{count} downloads finished' },
} as const satisfies Record<string, Message>;
