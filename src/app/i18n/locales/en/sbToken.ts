import type { Message } from '../../types';

export const sbToken = {
  'sbToken.readFailed': 'Could not read this statblock. Try scanning again.',
  'sbToken.noteGone': 'The statblock note no longer exists.',
  'sbToken.unrecognized': 'No recognized statblock in this note.',
  'sbToken.imageGone': 'The source image no longer exists.',
  'sbToken.created': 'Token created.',
  'sbToken.failed': 'Could not create this token.',
} as const satisfies Record<string, Message>;
