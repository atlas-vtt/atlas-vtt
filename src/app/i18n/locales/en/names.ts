import type { Message } from '../../types';

export const names = {
  'names.invalidScene': 'Scene names cannot contain \\ / : * ? " < > | # ^ [ or ]',
  'names.invalidCollection': 'Collection names cannot contain \\ / : * ? " < > | # ^ [ or ]',
  'names.collectionDot': 'Collection names cannot start with a dot',
  'names.enter': 'Enter a name',
  'names.presetTaken': 'A preset with this name already exists',
} as const satisfies Record<string, Message>;
