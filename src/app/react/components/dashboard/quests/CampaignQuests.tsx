import React, { useId, useState } from 'react';
import type { App } from 'obsidian';
import { ChevronRight } from 'lucide-react';
import type { Campaign } from '../../../../campaigns/campaignTypes';
import type { CampaignService } from '../../../../campaigns/CampaignService';
import { createQuestNote, setQuestStatus } from '../../../../campaigns/quests/questNotes';
import { questKind } from '../../../../campaigns/quests/questProperties';
import { isQuestOver, type Quest, type QuestKind } from '../../../../campaigns/quests/questTypes';
import { useQuests } from '../../../../campaigns/quests/useQuests';
import { Button } from '../../../../packages/components/primitives/button';
import { runInBackground } from '../../../../utils/backgroundTask';
import { t } from '../../../../i18n';
import { NewQuestField } from './NewQuestField';
import { QuestRow } from './QuestRow';
import { GameIcon } from '../../GameIcon';
import { WIDGET_ICON_PATHS } from '../../../../types/widgetIcons';

interface CampaignQuestsProps {
  app: App;
  campaign: Campaign;
  campaigns: readonly Campaign[];
  service: CampaignService;
  disabled: boolean;
}

/** Opens a note in a new tab beside the dashboard. */
function openNote(app: App, path: string): void {
  const file = app.vault.getFileByPath(path);
  if (file !== null) runInBackground(app.workspace.getLeaf('tab').openFile(file), `Opening ${path}`, t('quest.openFailed'));
}

/**
 * The campaign's quests, which are notes of the vault naming it: main quests, then side quests,
 * then those done or failed, folded away. Each row sets its status; its name opens its note. A new quest is a note in the campaign's folder, opened at once.
 */
export function CampaignQuests({ app, campaign, campaigns, service, disabled }: CampaignQuestsProps): React.JSX.Element {
  const quests = useQuests(app, campaign, campaigns);
  const [isCreating, setIsCreating] = useState(false);
  const [showOver, setShowOver] = useState(false);
  const headingId = useId();
  const overId = useId();
  const folder = service.folderOf(campaign.id);
  const over = quests.filter(isQuestOver);
  const groups: [string, Quest[]][] = [
    [t('quest.mainQuests'), quests.filter((quest) => !isQuestOver(quest) && questKind(quest) === 'main')],
    [t('quest.sideQuests'), quests.filter((quest) => !isQuestOver(quest) && questKind(quest) === 'side')],
  ];

  const create = (title: string, kind: QuestKind): void => {
    setIsCreating(false);
    if (folder === null) return;
    runInBackground(
      createQuestNote(app, folder, campaign.id, title, kind).then((file) => app.workspace.getLeaf('tab').openFile(file)),
      `Creating the quest ${title}`,
      t('quest.createFailed'),
    );
  };

  const row = (quest: Quest): React.JSX.Element => (
    <QuestRow
      key={quest.path}
      quest={quest}
      disabled={disabled}
      onOpen={() => openNote(app, quest.path)}
      onStatus={(status) => runInBackground(setQuestStatus(app, quest.path, status), `Setting the status of ${quest.path}`, t('quest.writeFailed'))}
    />
  );

  return (
    <section className="campaign-quests" aria-labelledby={headingId}>
      <div className="campaign-quests__heading">
        <h2 id={headingId} className="panel-heading">{t('quest.quests')}</h2>
        {!isCreating && (
          <Button variant="ghost" className="campaign-quests__new" disabled={disabled || folder === null} onClick={() => setIsCreating(true)}>
            <GameIcon path={WIDGET_ICON_PATHS.scroll} size={16} />
            <span>{t('quest.new')}</span>
          </Button>
        )}
      </div>
      <div className="dashboard-panel campaign-quests__panel">
        {isCreating && <NewQuestField onCreate={create} onCancel={() => setIsCreating(false)} />}
        {quests.length === 0 && !isCreating && <div className="campaigns-empty">{t('quest.none')}</div>}
        {groups.map(([label, shown]) => shown.length > 0 && (
          <div key={label} className="campaign-quests__group">
            <h3 className="campaign-quests__label">{label}</h3>
            <ul className="campaign-quests__list">{shown.map(row)}</ul>
          </div>
        ))}
        {over.length > 0 && (
          <div className="campaign-quests__group">
            <button type="button" className="campaign-quests__fold" aria-expanded={showOver} aria-controls={overId} onClick={() => setShowOver((shown) => !shown)}>
              <ChevronRight aria-hidden="true" className="campaign-quests__chevron" />
              <span>{t('quest.over')}</span>
              <span className="campaign-quests__count">{over.length}</span>
            </button>
            {showOver && <ul id={overId} className="campaign-quests__list">{over.map(row)}</ul>}
          </div>
        )}
      </div>
    </section>
  );
}
