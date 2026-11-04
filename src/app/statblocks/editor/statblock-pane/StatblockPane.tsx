import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StatblockSkeleton } from '../../../react/components/statblock/StatblockSkeleton';
import { useTemplateLibrary } from '../../library/useTemplateLibrary';
import type { TemplateId } from '../../model/templateTypes';
import { duplicateTemplate } from './duplicateTemplate';
import { templateKeyPatch } from './templateKeyPatch';
import { ChangeTemplateDialog } from './ChangeTemplateDialog';
import { PanelFrame } from '../panel-frame/PanelFrame';
import { MorePropertiesTray } from './MorePropertiesTray';
import { PaneCanvas } from './PaneCanvas';
import { PaneDiceRolls } from './PaneDiceRolls';
import { PaneHandles } from './PaneHandles';
import { NewerTemplateBar, NoteDeletedBar, NotNativeState, TemplateMissingBar, UnreadableState, WriteProblemBar } from './PaneStates';
import type { StatblockPaneProps } from './paneTypes';
import { StatblockCardMenu } from './StatblockCardMenu';
import { statblockMenuEntries } from './statblockMenu';
import { usePaneCollection } from './usePaneCollection';
import { usePaneNote } from './usePaneNote';
import { usePaneTemplate } from './usePaneTemplate';
import { useReferenceSuggest } from './useReferenceSuggest';
import './statblock-pane.scss';

/**
 * The statblock pane (§7.2), drawn beside its note in the same view: the
 * note's statblock as the runtime card with its values editable in place and
 * its ⋯ menu in the card's corner and the tray of the
 * note's tags, aliases and hidden values; or the state the plan's edge-state
 * table names.
 */
export function StatblockPane(props: StatblockPaneProps): React.JSX.Element {
  const { app, services, notePath, actions } = props;
  const note = usePaneNote(app, services, notePath);
  const collection = usePaneCollection(app, notePath, props.collectionId, actions.changeCollection);
  const paneTemplate = usePaneTemplate(app, note.templateId, note.record);
  const library = useTemplateLibrary(app);
  const [choosing, setChoosing] = useState(false);
  const [writeProblem, setWriteProblem] = useState<string | null>(null);
  // The view's announcements (undo, redo) and the pane's own (a deleted entry), the latest one said.
  const [said, setSaid] = useState(props.announcement);
  useEffect(() => setSaid(props.announcement), [props.announcement]);
  const rootRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLButtonElement>(null);
  const handledFocusRequest = useRef(0);
  const collectionId = collection.context?.collectionId ?? props.collectionId;

  useEffect(() => setWriteProblem(null), [notePath]);

  // "Duplicate template" (§5.5): the one explicit way to a copy for one statblock; it opens in the template editor.
  const { editTemplate } = actions;
  const duplicate = useCallback((): void => {
    const templateId = note.templateId;
    if (!templateId) return;
    void duplicateTemplate(app, services.writer, notePath, note.record, templateId).then((copy) => {
      if (copy) editTemplate?.(copy.id, collectionId, notePath, { path: copy.path });
    });
  }, [app, services.writer, notePath, note.record, note.templateId, editTemplate, collectionId]);

  const applyTemplate = useCallback((templateId: TemplateId): void => {
    setChoosing(false);
    void services.writer.write(notePath, [templateKeyPatch(note.record, templateId)]).then((outcome) => {
      setWriteProblem(outcome.conflicts.length ? 'the note\'s template changed meanwhile.' : outcome.problem);
    });
  }, [services, notePath, note.record]);

  const onExit = useCallback((step: 1 | -1): void => {
    (step === 1 ? trayRef.current : rootRef.current?.querySelector<HTMLElement>('.atlas-sb-card-menu__button'))?.focus();
  }, []);

  const writable = note.kind === 'atlas' && paneTemplate.status !== 'loading';
  useReferenceSuggest(app, rootRef, note.kind === 'atlas' && paneTemplate.status !== 'loading' ? paneTemplate.template : null, note.record);
  const entry = writable && paneTemplate.status === 'ok' ? paneTemplate.entry : null;
  const templateId = note.templateId;
  const menu = statblockMenuEntries({
    note,
    paneTemplate,
    // A built-in opens too: the editor saves its changes as a new template, which this note then uses.
    editTemplate: editTemplate && templateId && paneTemplate.status !== 'newer' ? () => editTemplate(templateId, collectionId, notePath) : undefined,
    changeTemplate: () => setChoosing(true),
    duplicateTemplate: entry && editTemplate ? duplicate : undefined,
    showProperties: !props.propertiesShown ? actions.showProperties : undefined,
  });

  const body = ((): React.ReactNode => {
    switch (note.kind) {
      case 'loading': return <StatblockSkeleton className="atlas-sb-pane-card" />;
      case 'unreadable': return <UnreadableState line={note.snapshot.problem?.line ?? null} />;
      case 'fantasy': case 'none': return <NotNativeState />;
      case 'atlas': case 'deleted': break;
    }
    if (paneTemplate.status === 'loading') return <StatblockSkeleton className="atlas-sb-pane-card" />;
    const bars = (
      <>
        {note.kind === 'deleted' && <NoteDeletedBar />}
        {paneTemplate.status === 'missing' && note.templateId && <TemplateMissingBar templateId={note.templateId} onChoose={() => setChoosing(true)} />}
        {paneTemplate.status === 'newer' && <NewerTemplateBar />}
        {writeProblem && <WriteProblemBar problem={writeProblem} />}
      </>
    );
    return (
      <>
        {bars}
        <PaneCanvas
          // One editing session per note: what was typed for a note is written to that note, never the next one.
          key={notePath}
          app={app}
          services={services}
          notePath={notePath}
          collectionId={collectionId}
          template={paneTemplate.template}
          templateName={paneTemplate.name}
          record={note.record}
          writable={writable}
          pendingCommit={props.pendingCommit}
          focusRequest={props.focusRequest}
          handledFocusRequest={handledFocusRequest}
          onExit={onExit}
          onWriteProblem={setWriteProblem}
          announce={setSaid}
          cardMenu={<StatblockCardMenu entries={menu} />}
        >
          {writable && (
            <MorePropertiesTray
              ref={trayRef}
              record={note.record}
              template={paneTemplate.template}
            />
          )}
          <PaneHandles paneRef={rootRef} template={paneTemplate.template} />
        </PaneCanvas>
      </>
    );
  })();

  return (
    <PanelFrame
      ref={rootRef}
      wrap={(content) => <PaneDiceRolls app={app} collectionId={collectionId}>{content}</PaneDiceRolls>}
      header={null}
      after={(
        <>
          <div className="atlas-sb-pane-live" role="status" aria-live="polite">{said}</div>
          {choosing && note.kind === 'atlas' && rootRef.current && library && (
            <ChangeTemplateDialog
              app={app}
              anchor={rootRef.current}
              notePath={notePath}
              record={note.record}
              currentId={note.templateId}
              templates={library.templates}
              roles={collection.roles}
              onApply={applyTemplate}
              onClose={() => setChoosing(false)}
            />
          )}
        </>
      )}
    >
      {body}
    </PanelFrame>
  );
}
