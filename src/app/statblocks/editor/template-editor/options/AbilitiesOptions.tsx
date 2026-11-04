import React from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '../../../../packages/components/primitives/button';
import { ToolButton } from '../../../../packages/components/primitives/ToolButton';
import { abilityFieldKeys } from '../../../model/abilityParts';
import { addAbilityTab, removeAbilityTab, renameAbilityTab, splitAbilities, type TemplateEdit } from '../../../model/abilityTabs';
import { fieldByKey } from '../../../model/fieldKeys';
import { canContain } from '../../../model/blockCatalogue';
import { parentTypeOf } from '../../../model/treeEdit';
import { selectableFor } from '../../../model/templateGrid';
import { findBlock } from '../../../model/treeQueries';
import type { SectionBlock, StatblockTemplate, TemplateBlock, TemplateField } from '../../../model/templateTypes';
import { useTemplateEditor } from '../editorContext';
import { EntryParts } from '../inspector/EntryParts';
import { Setting, SettingNote } from '../inspector/InspectorControls';
import { useGestureText } from '../inspector/useGestureText';
import { applyEdit } from '../sessionEdit';
import type { EditorSession } from '../sessionTypes';
import { t } from '../../../../i18n';

interface AbilitiesOptionsProps {
  block: TemplateBlock;
  session: EditorSession;
  readOnly: boolean;
}

/** Runs an ability-tabs edit as one step; returns what it left to look at (the Tabs block, a new tab, the list left behind). */
function applyTabs(session: EditorSession, edit: (template: StatblockTemplate) => TemplateEdit): string | null {
  return applyEdit(session, (template) => {
    const done = edit(template);
    return { template: done.template, result: done.ok ? done.focus : null };
  });
}

/** A tab's name, typed in place; typing it is one undo step. */
function TabName({ tab, session, readOnly, onRemove }: { tab: SectionBlock; session: EditorSession; readOnly: boolean; onRemove: () => void }): React.JSX.Element {
  const text = useGestureText({
    value: tab.heading ?? '',
    session,
    onText: (heading) => { applyTabs(session, (template) => renameAbilityTab(template, tab.id, heading)); },
  });
  return (
    <div className="atlas-te-setting__inline">
      <input {...text} type="text" className="atlas-te-input" aria-label={t('templateEditor.tabName')} disabled={readOnly} spellCheck={false} />
      <ToolButton icon={X} label={tab.heading?.trim() ? t('templateEditor.removeNamed', { name: tab.heading.trim() }) : t('templateEditor.removeTab')} isActive={false} disabled={readOnly} onClick={onRemove} />
    </div>
  );
}

/**
 * An Abilities tile's Options: the parts every ability has besides its name
 * and text, and its tabs. A list splits into tabs (spell levels, kinds of
 * ability), each tab with a list of its own; the last tab but one going
 * leaves a plain list. Every tab's list has the same parts: they are shown
 * as the first tab's list has them, and an edit of them is made to all.
 */
export function AbilitiesOptions({ block, session, readOnly }: AbilitiesOptionsProps): React.JSX.Element | null {
  const { snapshot, select } = useTemplateEditor();
  const { template } = snapshot;
  // A list split into tabs is another tile, and so is the list the last tab leaves: the selection follows, and these Options with it.
  const editTabs = (edit: (template: StatblockTemplate) => TemplateEdit): void => {
    const focus = applyTabs(session, edit);
    const tile = focus ? selectableFor(session.getSnapshot().template, focus) : null;
    if (tile && tile !== block.id) select([tile], false);
  };
  const tabs = block.type === 'tabs' ? block.blocks.filter((tab): tab is SectionBlock => tab.type === 'section') : [];
  // The first list's property must be there: the parts shown are its own.
  const keys = abilityFieldKeys(block);
  const field = keys[0] === undefined ? undefined : fieldByKey(template.fields, keys[0]);
  const fields = keys.map((key) => fieldByKey(template.fields, key)).filter((each): each is TemplateField => each !== undefined);
  const found = findBlock(template.layout.blocks, block.id);
  const parentType = found ? parentTypeOf(template.layout, found.parentId) : null;
  const mayTab = parentType !== null && canContain(parentType, 'tabs');
  return (
    <>
      {field
        ? <EntryParts fields={fields} session={session} readOnly={readOnly} />
        : <SettingNote>{t('templateEditor.nameListFirst')}</SettingNote>}
      {block.type === 'entries' && (
        <Setting label={t('templateEditor.primitive.tabs')} wide>
          {() => (
            <div className="atlas-te-setting__list">
              <Button type="button" variant="outline" size="sm" disabled={readOnly || !mayTab || !field}
                onClick={() => editTabs((current) => splitAbilities(current, block.id))}>
                {t('templateEditor.splitTabs')}
              </Button>
              {!mayTab && <span className="atlas-te-setting__hint">{t('templateEditor.noTabsSideBySide')}</span>}
            </div>
          )}
        </Setting>
      )}
      {block.type === 'tabs' && (
        <Setting label={t('templateEditor.primitive.tabs')} wide>
          {() => (
            <div className="atlas-te-setting__list">
              {tabs.map((tab) => (
                <TabName key={tab.id} tab={tab} session={session} readOnly={readOnly}
                  onRemove={() => editTabs((current) => removeAbilityTab(current, block.id, tab.id))} />
              ))}
              <Button type="button" variant="ghost" size="sm" disabled={readOnly}
                onClick={() => editTabs((current) => addAbilityTab(current, block.id))}>
                <Plus aria-hidden="true" />
                {t('templateEditor.addTab')}
              </Button>
            </div>
          )}
        </Setting>
      )}
    </>
  );
}
