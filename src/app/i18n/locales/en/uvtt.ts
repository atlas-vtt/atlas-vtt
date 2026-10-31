import type { Message } from '../../types';

export const uvtt = {
  'uvtt.importing': 'Importing {file}…',
  'uvtt.couldNot': 'Could not import {file}. {problem}',
  'uvtt.notMaps': {
    one: '{files} is not a map Atlas can import. Drop a .dd2vtt, .uvtt or .df2vtt file, or a WebM or MP4 video.',
    other: '{files} are not maps Atlas can import. Drop a .dd2vtt, .uvtt or .df2vtt file, or a WebM or MP4 video.',
  },
  'uvtt.openFailed': '"{name}" could not be opened. It is in the Scenes tab.',
  'uvtt.collectionGone': 'The collection no longer exists. Choose another collection and try again.',
} as const satisfies Record<string, Message>;
