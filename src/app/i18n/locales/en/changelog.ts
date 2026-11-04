import type { Message } from '../../types';

export const changelog = {
  'changelog.notBundled': 'Release notes are not bundled for this version yet.',
  'changelog.previous': 'Previous releases',
  'changelog.beta': 'Beta',
  'changelog.new': 'New',
  'changelog.community': 'Join the Atlas community on Discord',
  'changelog.formatFailed': 'Formatting could not be loaded. The release notes are shown below.',
} as const satisfies Record<string, Message>;
