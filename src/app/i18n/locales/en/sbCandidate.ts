import type { Message } from '../../types';

export const sbCandidate = {
  'sbCandidate.imported': 'An Atlas token already links to this note.',
  'sbCandidate.unresolved': 'The statblock could not be resolved. Check its name or note reference.',
  'sbCandidate.noImage': 'Add an image to this statblock to create a token.',
  'sbCandidate.remote': 'Save the image in your vault and link it from the statblock.',
  'sbCandidate.missingImage': 'The linked image is missing or its format is unsupported.',
  'sbCandidate.ready': 'Ready to create a linked token.',
} as const satisfies Record<string, Message>;
