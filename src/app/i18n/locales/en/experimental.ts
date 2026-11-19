import type { Message } from '../../types';

export const experimental = {
  'experimental.statblockEditor': 'Statblock editor',
  'experimental.statblockEditorHint': 'Statblock roles and templates: a collection\'s Statblocks settings, and editing statblocks in Atlas. While off, statblocks show as before.',
  'experimental.onlinePlay': 'Online play',
  'experimental.onlinePlayHint': 'Host a table that players join from their browsers: the online control at the bottom left of a map, and the account settings. While off, Atlas connects to nothing.',
} satisfies Record<string, Message>;
