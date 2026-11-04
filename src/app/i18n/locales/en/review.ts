import type { Message } from '../../types';

export const review = {
  'review.kind.token': 'Token',
  'review.kind.map': 'Map',
  'review.kind.note': 'Note',
  'review.kind.statblock': 'Statblock',
  'review.kind.character': 'Character',
  'review.kind.scene': 'Scene',
  'review.kind.encounter': 'Encounter',
  'review.kind.player': 'Player',
  'review.kind.asset': 'Asset',
  'review.kind.collection': 'Collection',
  'review.kind.file': 'File',
  'review.field.name': 'Collection name',
  'review.field.description': 'Description',
  'review.field.tags': 'Tags',
  'review.field.settings': 'Collection settings',
} as const satisfies Record<string, Message>;
