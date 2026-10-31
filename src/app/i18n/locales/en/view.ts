import type { Message } from '../../types';

export const view = {
  'view.copyFailed': 'Could not copy the file path',
  'view.copyPath': 'Copy file path',
  'view.more': 'More options',
  'view.pathCopied': 'File path copied to clipboard',
  'view.rename': 'Rename...',
  'view.reveal': 'Reveal in file explorer',
  'view.splitDown': 'Split down',
  'view.splitRight': 'Split right',
  'view.mainWindowOnly': 'Atlas runs in your main Obsidian window. To use two screens, move your notes into a new window instead.',
  'view.initializing': 'Initializing...',
  'view.sceneNotFound': 'Scene file not found: {path}',
  'view.preparing': 'Preparing...',
  'view.canvas': 'Atlas Canvas',
  'view.player': 'Player view',
  'view.playerRestoreFailed': 'Unable to restore player view. Send a scene to this window again.',
  'view.connecting': 'Connecting to game session…',
  'view.playerTitle': 'Player View: {name}',
  'view.playerDefault': 'Player View',
  'view.noGraphics': 'Atlas needs graphics acceleration to draw maps. Turn on hardware acceleration in Obsidian\'s general settings, or check your graphics drivers.',
} as const satisfies Record<string, Message>;
