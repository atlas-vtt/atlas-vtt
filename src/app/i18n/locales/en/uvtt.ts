import type { Message } from '../../types';

export const uvtt = {
  'uvtt.importing': 'Importing {file}…',
  'uvtt.couldNot': 'Could not import {file}. {problem}',
} as const satisfies Record<string, Message>;
