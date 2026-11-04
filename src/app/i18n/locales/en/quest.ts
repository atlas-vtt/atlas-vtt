import type { Message } from '../../types';

export const quest = {
  'quest.quests': 'Quests',
  'quest.new': 'New quest',
  'quest.titleLabel': 'Quest title',
  'quest.kindLabel': 'Kind of quest',
  'quest.kind.main': 'Main',
  'quest.kind.side': 'Side',
  'quest.mainQuests': 'Main quests',
  'quest.sideQuests': 'Side quests',
  'quest.over': 'Done and failed',
  'quest.none': 'No quests yet.',
  'quest.status.open': 'Open',
  'quest.status.active': 'Active',
  'quest.status.done': 'Done',
  'quest.status.failed': 'Failed',
  'quest.statusOf': 'Status of {title}',
  'quest.experience': '{count} XP',
  'quest.createFailed': 'Could not create the quest note.',
  'quest.openFailed': 'Could not open the quest note.',
  'quest.writeFailed': 'Could not change the quest note.',
} as const satisfies Record<string, Message>;
