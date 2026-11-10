import type { Message } from '../../types';

export const transfer = {
  'transfer.andScenes': { one: '{what} and {count} linked scene', other: '{what} and {count} linked scenes' },
  'transfer.copied': 'Copied {what} to {target}',
  'transfer.copy.withScenes': { one: 'Copy with {count} linked scene', other: 'Copy with {count} linked scenes' },
  'transfer.copy.withoutLinks': 'Copy without links',
  'transfer.copyFailed': 'Could not copy {what}: {error}',
  'transfer.linked.copy': { one: '{subject} links to another scene of this collection: {names}.', other: '{subject} links to {count} other scenes of this collection: {names}.' },
  'transfer.linked.move': { one: '{subject} is linked with another scene of this collection: {names}.', other: '{subject} is linked with {count} other scenes of this collection: {names}.' },
  'transfer.linked.rule': 'Scenes only link to scenes of their own collection. Take the linked scenes to {target} to keep the links, or remove the links.',
  'transfer.linked.title': 'Linked scenes',
  'transfer.move.withScenes': { one: 'Move with {count} linked scene', other: 'Move with {count} linked scenes' },
  'transfer.move.withoutLinks': 'Move without links',
  'transfer.moveFailed': 'Could not move {what}: {error}',
  'transfer.moved': 'Moved {what} to {target}',
  'transfer.selection': 'The selection',
} as const satisfies Record<string, Message>;
