import React from 'react';
import { ExternalLink, FileText, Replace } from 'lucide-react';
import type { App } from 'obsidian';
import { t } from '../../../i18n';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { runInBackground } from '../../../utils/backgroundTask';
import { useAtlasStore } from '../../ViewStoreContext';
import LinkedNotePicker from '../LinkedNotePicker';
import { NoteContent } from './NoteContent';

interface DMNotePaneProps {
  app: App;
  /** Its page has been shown: until then neither the note nor the picker is mounted. */
  shown: boolean;
  onNoteFocus: () => void;
}

/** Right side of the DM screen's first page: the note linked to this map. */
export function DMNotePane({ app, shown, onNoteFocus }: DMNotePaneProps): React.JSX.Element {
  const linkedNotePath = useAtlasStore((state) => state.dmNotePath);
  const setLinkedNotePath = useAtlasStore((state) => state.setDMNotePath);
  const linkedNoteName = linkedNotePath?.split('/').pop()?.replace(/\.md$/, '');
  return (
    <div className="atlas-dm-notes-section">
      <div className="atlas-linked-note-header">
        <FileText className="atlas-linked-note-header-icon" />
        <div className="atlas-linked-note-header-text">
          <h3>{linkedNoteName ?? t('dashboard.linkNote')}</h3>
          <p>{linkedNotePath ?? t('dashboard.pickNote')}</p>
        </div>
        {linkedNotePath && (
          <div className="atlas-linked-note-actions">
            <LabelTooltip label={t('dashboard.openNote')}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="atlas-linked-note-action"
                onClick={() => runInBackground(app.workspace.openLinkText('', linkedNotePath, true), `Opening ${linkedNotePath}`, t('loot.openFailed'))}
              >
                <ExternalLink />
              </Button>
            </LabelTooltip>
            <LabelTooltip label={t('dashboard.linkOther')}>
              <Button type="button" variant="ghost" size="icon" className="atlas-linked-note-action" onClick={() => setLinkedNotePath(null)}>
                <Replace />
              </Button>
            </LabelTooltip>
          </div>
        )}
      </div>
      <div className="atlas-dm-notes-content">
        {shown && (linkedNotePath ? <NoteContent notePath={linkedNotePath} app={app} onFocus={onNoteFocus} /> : <LinkedNotePicker app={app} onSelect={setLinkedNotePath} />)}
      </div>
    </div>
  );
}
