import type { Message } from '../../types';

export const command = {
  'command.cleanUpMissingAssets': 'Clean up missing assets in current map',
  'command.createTokenFromStatblock': 'Create token from statblock image',
  'command.dismissImageFromPlayerView': 'Dismiss image from player view',
  'command.displayImageOnPlayerView': 'Display image on player view',
  'command.importStatblockTokens': 'Import tokens from Fantasy Statblocks',
  'command.openDashboard': 'Open dashboard',
  'command.openPlayerWindow': 'Open player window',
  'command.openSceneBrowser': 'Open scene browser',
  'command.reportIssue': 'Report an issue…',
  'command.sendMapToPlayerView': 'Send current map to player view',
  'command.toggleDiceLog': 'Toggle dice log',
  'command.toggleInitiativeTracker': 'Toggle initiative tracker',
  'command.toggleLootRoller': 'Toggle loot roller',
  'command.viewChangelog': 'View changelog',
} as const satisfies Record<string, Message>;
