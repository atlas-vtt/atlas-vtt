import React from 'react';
import type { App } from 'obsidian';
import { cn } from '../../../../utils/cn';
import { EditableField } from './EditableField';
import { hitPointsAttribute, namesHitPoints } from './hitPoints';
import { InlineText } from './InlineText';
import { StatblockMarkdown } from './StatblockMarkdown';
import type { StatblockEditPath } from './statblockEditContext';
import { t } from '../../../i18n';

export interface EntryLineProps {
  name: string | undefined;
  text: string;
  app?: App | undefined;
  sourcePath?: string | undefined;
  markdown?: boolean | undefined;
  /**
   * `run-in`: "Claws" in front of the text, as written, as the native card writes entries;
   * `heading`: the name on a line of its own; unset: the name as Fantasy Statblocks writes it.
   */
  nameStyle?: 'run-in' | 'heading' | undefined;
  /** Where the name and the text are written in the note, when they can be edited in place. */
  editPaths?: { name: StatblockEditPath; text: StatblockEditPath } | undefined;
  /** Shown between the name and the text: an entry's labelled extras. */
  children?: React.ReactNode;
  /** The entry's identity in its list (`values/entryKeys.ts`) and its place there: what an editor's handles and drags address. */
  itemKey?: string | undefined;
  itemIndex?: number | undefined;
}

/**
 * One entry of a list of traits or actions: its name, then its text. The
 * classes are the ones dice rolls read their ability name from.
 */
export function EntryLine({
  name,
  text,
  app,
  sourcePath,
  markdown = true,
  nameStyle,
  editPaths,
  children,
  itemKey,
  itemIndex,
}: EntryLineProps): React.JSX.Element | null {
  if (!name && !text) return null;
  const editable = editPaths !== undefined;

  return (
    <div
      className={cn('atlas-sb-trait', nameStyle && `atlas-sb-trait--${nameStyle}`)}
      data-item-key={itemKey}
      data-item-index={itemIndex}
      {...hitPointsAttribute(namesHitPoints(name))}
    >
      {name && (
        <span className="atlas-sb-trait-name">
          <EditableField path={editPaths?.name ?? []} value={name} editable={editable} label={t('statblockEditor.traitName')}>
            <InlineText text={nameStyle === 'run-in' ? name.trim() : name} app={app} sourcePath={sourcePath} markdown={markdown} dice={false} />
          </EditableField>
        </span>
      )}
      {children}
      <EditableField path={editPaths?.text ?? []} value={text} editable={editable} label={t('statblockEditor.traitText')} multiline>
        <StatblockMarkdown text={text} app={app} sourcePath={sourcePath} markdown={markdown} />
      </EditableField>
    </div>
  );
}
