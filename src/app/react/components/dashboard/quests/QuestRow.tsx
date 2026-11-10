import React, { useId } from 'react';
import { QUEST_STATUSES, type Quest, type QuestStatus } from '../../../../campaigns/quests/questTypes';
import { Select, type SelectOption } from '../../../../packages/components/primitives/Select';
import { t } from '../../../../i18n';

const STATUS_OPTIONS: SelectOption<QuestStatus>[] = QUEST_STATUSES.map((status) => ({ value: status, label: t(`quest.status.${status}`) }));

interface QuestRowProps {
  quest: Quest;
  disabled: boolean;
  onOpen: () => void;
  onStatus: (status: QuestStatus) => void;
}

/** What a quest brings, as the row's second line: its experience and rewards. */
function questGains(quest: Quest): string {
  const experience = quest.experience ? [t('quest.experience', { count: quest.experience })] : [];
  return [...experience, ...quest.rewards].join(' · ');
}

/** A quest on its campaign's page: its status, its name (which opens its note) with what it brings. Where it lies is a pin on the world map scene that links its note. */
export function QuestRow({ quest, disabled, onOpen, onStatus }: QuestRowProps): React.JSX.Element {
  const statusLabelId = useId();
  const gains = questGains(quest);

  return (
    <li className={`campaign-quest campaign-quest--${quest.status}`}>
      <span id={statusLabelId} hidden>{t('quest.statusOf', { title: quest.title })}</span>
      <div className="campaign-quest__status">
        <Select value={quest.status} options={STATUS_OPTIONS} onChange={onStatus} labelledBy={statusLabelId} disabled={disabled} />
      </div>
      <button type="button" className="campaign-quest__open" onClick={onOpen}>
        <span className="campaign-quest__title">{quest.title}</span>
        {gains !== '' && <span className="campaign-quest__gains">{gains}</span>}
      </button>
    </li>
  );
}
