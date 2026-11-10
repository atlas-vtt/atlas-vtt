import React, { useId, useState } from 'react';
import { QUEST_KINDS, type QuestKind } from '../../../../campaigns/quests/questTypes';
import { SegmentedControl, type SegmentedOption } from '../../../../packages/components/primitives/SegmentedControl';
import { t } from '../../../../i18n';

const KIND_OPTIONS: SegmentedOption<QuestKind>[] = QUEST_KINDS.map((kind) => ({ value: kind, label: t(`quest.kind.${kind}`) }));

interface NewQuestFieldProps {
  onCreate: (title: string, kind: QuestKind) => void;
  onCancel: () => void;
}

/** Names a new quest in place and says whether it is a main or a side quest: Enter creates it, Escape cancels. */
export function NewQuestField({ onCreate, onCancel }: NewQuestFieldProps): React.JSX.Element {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<QuestKind>('main');
  const labelId = useId();

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (title.trim() !== '') onCreate(title.trim(), kind);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };

  // Leaving the field and its kind with nothing typed cancels.
  const onBlur = (event: React.FocusEvent<HTMLDivElement>): void => {
    if (title.trim() === '' && !event.currentTarget.contains(event.relatedTarget)) onCancel();
  };

  return (
    <div className="campaign-quest-new" onBlur={onBlur}>
      <span id={labelId} hidden>{t('quest.titleLabel')}</span>
      <input
        className="campaign-quest-new__input"
        type="text"
        value={title}
        placeholder={t('quest.titleLabel')}
        aria-labelledby={labelId}
        autoFocus
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <SegmentedControl className="campaign-quest-new__kind" value={kind} options={KIND_OPTIONS} onChange={setKind} ariaLabel={t('quest.kindLabel')} />
    </div>
  );
}
