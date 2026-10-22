import React, { useId } from 'react';
import type { App } from 'obsidian';
import { t } from '../../../i18n';
import { Button } from '../../../packages/components/primitives/button';
import type { RecoveryButton } from '../../../recovery/recoveryTypes';
import type { StatblockTemplate } from '../../model/templateTypes';
import type { EditorSession, SessionSnapshot } from '../template-editor/sessionTypes';
import { RecoveryEditor } from './RecoveryEditor';
import { useCollectionRestRules } from './useCollectionRestRules';

const NO_BUTTONS: readonly RecoveryButton[] = [];

/** The template with `buttons` as its recovery buttons; none leaves the key out. */
export function withRecovery(template: StatblockTemplate, buttons: readonly RecoveryButton[]): StatblockTemplate {
  const { recovery: _recovery, ...rest } = template;
  return buttons.length > 0 ? { ...rest, recovery: [...buttons] } : rest;
}

interface TemplateRestsProps {
  app: App | undefined;
  session: EditorSession;
  snapshot: SessionSnapshot;
  /** The collection the editor works for, whose resources and conditions the card offers. */
  collectionId: string | null;
  onDone: () => void;
}

/**
 * The template's recovery buttons in the template editor, where its card stands: the rail of
 * buttons, what the selected one does, and the card whose values its rules restore. Every change is
 * one step of the template's history, saved with the template.
 */
export function TemplateRests({ app, session, snapshot, collectionId, onDone }: TemplateRestsProps): React.JSX.Element {
  const headingId = useId();
  const { resources, conditions } = useCollectionRestRules(app, collectionId);
  return (
    <section className="atlas-rc-pane atlas-te-rests" aria-labelledby={headingId} data-te-region="rests">
      <header className="atlas-rc-pane__head">
        <div className="atlas-te-rests__title-row">
          <h4 id={headingId} className="atlas-rc-pane__title">{t('recoveryEditor.title')}</h4>
          <Button type="button" variant="default" size="sm" onClick={onDone}>{t('recoveryEditor.done')}</Button>
        </div>
        <p className="atlas-csm-hint">{t('recoveryEditor.hint')}</p>
      </header>
      <RecoveryEditor
        template={snapshot.template}
        name={snapshot.name}
        buttons={snapshot.template.recovery ?? NO_BUTTONS}
        onButtonsChange={(buttons) => session.apply((template) => withRecovery(template, buttons))}
        resources={resources}
        conditions={conditions}
      />
    </section>
  );
}
