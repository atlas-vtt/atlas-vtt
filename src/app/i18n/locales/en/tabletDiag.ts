import type { Message } from '../../types';

export const tabletDiag = {
  'tabletDiag.command': 'Tablet diagnostics',
  'tabletDiag.title': 'Tablet diagnostics',
  'tabletDiag.intro': 'What this device tells Atlas about itself. Copy it into an issue or a message to the developers. It names no file, folder or note of your vault.',
  'tabletDiag.collecting': 'Asking the device…',
  'tabletDiag.keyboardField': 'Tap here to test the keyboard',
  'tabletDiag.testSound': 'Test sound',
  'tabletDiag.runMemoryTest': 'Run memory test',
  'tabletDiag.memoryWarning': 'The memory test takes up to 1.5 GB, a step at a time. Obsidian may reload while it runs: open this dialog again to read how far it got.',
  'tabletDiag.copied': 'Report copied.',
  'tabletDiag.copyFailed': 'The report could not be copied. Select the text and copy it by hand.',
} as const satisfies Record<string, Message>;
