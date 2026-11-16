import { t } from '../../i18n';
/** Online play's commands. Each is offered only while online play is switched on and has something to do. */
export const ONLINE_COMMANDS = [
  { id: 'start-online-table', name: t('online.command.startTable') },
  { id: 'toggle-online-panel', name: t('online.command.togglePanel') },
  { id: 'copy-online-table-link', name: t('online.command.copyLink') },
  { id: 'make-selected-player-tokens', name: t('online.command.makePlayer') },
  { id: 'make-selected-gm-tokens', name: t('online.command.makeGm') },
  { id: 'stop-online-table', name: t('online.command.stopTable') },
] as const;

export type OnlineCommandId = (typeof ONLINE_COMMANDS)[number]['id'];
