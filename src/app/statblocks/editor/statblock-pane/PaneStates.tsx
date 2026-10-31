import React from 'react';
import { Button } from '../../../packages/components/primitives/button';
import { t } from '../../../i18n';

/** A line about the statblock, with at most one action (a button, or a `control` such as a menu): one step down the radius scale inside the pane. */
export function PaneBar({ text, action, onAction, control }: {
  text: React.ReactNode;
  action?: string | undefined;
  onAction?: (() => void) | undefined;
  control?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="atlas-sb-pane-bar" role="status">
      <span className="atlas-sb-pane-bar__text">{text}</span>
      {action && onAction && <Button type="button" variant="ghost" size="sm" onClick={onAction}>{action}</Button>}
      {control}
    </div>
  );
}

/** The note names a template the library does not hold: the card shows with the auto template. */
export function TemplateMissingBar({ templateId, onChoose }: { templateId: string; onChoose?: (() => void) | undefined }): React.JSX.Element {
  const [before, after] = t('statblockEditor.templateNotFound', { id: '\u0000' }).split('\u0000');
  return <PaneBar text={<>{before}<code>{templateId}</code>{after}</>} action={t('statblockEditor.chooseTemplate')} onAction={onChoose} />;
}

export function NewerTemplateBar(): React.JSX.Element {
  return <PaneBar text={t('statblockEditor.updateToEdit')} />;
}

export function NoteDeletedBar(): React.JSX.Element {
  return <PaneBar text={t('statblockEditor.noteDeleted')} />;
}

export function WriteProblemBar({ problem }: { problem: string }): React.JSX.Element {
  return <PaneBar text={t('statblockEditor.saveFailedWhy', { problem })} />;
}

/** YAML Obsidian rejects: Atlas never writes into it (§7.2). The note beside shows where. */
export function UnreadableState({ line }: { line: number | null }): React.JSX.Element {
  const text = line === null ? t('statblockEditor.propertiesUnreadable') : t('statblockEditor.propertiesUnreadableLine', { line });
  return (
    <div className="atlas-sb-pane-state">
      <PaneBar text={text} />
    </div>
  );
}

/** The note's properties no longer name an Atlas template; the panel goes once Obsidian has read them. */
export function NotNativeState(): React.JSX.Element {
  return (
    <div className="atlas-sb-pane-state">
      <PaneBar text={t('statblockEditor.noAtlasStatblock')} />
    </div>
  );
}
