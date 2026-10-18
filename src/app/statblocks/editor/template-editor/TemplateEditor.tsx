import React, { useEffect, useRef, useState } from 'react';
import type { App } from 'obsidian';
import { useTemplateLibrary } from '../../library/useTemplateLibrary';
import { deleteTemplate } from '../../library/templateActions';
import { templateUsage, type TemplateUsage } from '../../library/templateUsage';
import type { FieldRecord } from '../../values/fieldValues';
import { TemplateDragAndDrop } from '../dnd/DndProvider';
import { selectableBlocks } from '../../model/templateGrid';
import { toggleHeaderPartHidden } from './blockActions';
import { HiddenValueChips } from './shell/HiddenValueChips';
import { BlankCard } from './BlankCard';
import { Canvas } from './Canvas';
import { DeleteTemplateDialog } from './DeleteTemplateDialog';
import { TemplateDiceDialog } from './dice/TemplateDiceDialog';
import { setTemplateDiceSet } from './dice/templateDiceEdit';
import { EditorDock } from './dock/EditorDock';
import { TemplateEditorContext, type TableTypingRequest, type TemplateEditorContextValue } from './editorContext';
import { tableParts } from '../../model/tableColumns';
import type { LabelPart } from './labelTargets';
import { EditorOverlays } from './EditorOverlays';
import { insertItems } from './insertItems';
import { optionsKindOf } from './options/optionsKind';
import { usePlayersRow } from './options/usePlayersRow';
import { TemplateJsonEditor } from './json/TemplateJsonEditor';
import { nameTakenIn, type SaveRequest } from './save/saveChoice';
import { SaveTemplateDialog } from './save/SaveTemplateDialog';
import type { BlockSelection } from './selection';
import type { EditorSession } from './sessionTypes';
import { handleShellKey } from './shell/shellKeys';
import { TemplateFooterLine } from './shell/TemplateFooterLine';
import { TemplateCapsule, canSave } from './shell/TemplateCapsule';
import { TemplateNoteRow } from './shell/TemplateNoteRow';
import { chooseNoteToStartFrom } from './shell/startFromNote';
import { TemplateStateBars } from './shell/TemplateStateBars';
import { usePanelRoom } from './shell/usePanelRoom';
import { useCollectionFieldKeys } from './useCollectionFieldKeys';
import { useEditorCollection } from './useEditorCollection';
import { useSessionSnapshot } from './useEditorSession';
import { useEditorState } from './useEditorState';
import { removePart } from './tileParts';
import { useTemplateKeyboard, type KeyboardTarget, type KeyHandler } from './useTemplateKeyboard';
import './template-editor.scss';

/** What the editor asks of the view that hosts it. */
export interface TemplateEditorHost {
  /** Saves as the save dialog asked; resolves with why it could not, or null once saved. */
  save: (request: SaveRequest) => Promise<string | null>;
  /** The template was deleted from here. */
  close: () => void;
}

export interface TemplateEditorProps {
  app?: App | undefined;
  session: EditorSession;
  host: TemplateEditorHost;
  /** The collection the editor was opened for; the default collection where it names none. */
  collectionId: string | null;
  initialSelection?: BlockSelection | undefined;
  /** The view's key scope asks this handler first (§7.7). */
  registerKeys?: ((handler: KeyHandler | null) => void) | undefined;
}

/** Shares copied blocks where no app does (a test without Obsidian). */
const LOCAL_CLIPS = {};
/** The card holds no values: every block shows the prompt a new statblock shows. */
const EMPTY_RECORD: FieldRecord = {};

/**
 * The template editor (§2): the note view with its statblock, the template's
 * note (the text new statblocks start with, in Obsidian's own editor) on the
 * left and the card on the right at the width the user's notes give it, with
 * the dock of the six kinds over the note column. The card is the grid
 * (`templateGrid`), drawn empty and unfolded: its tiles are selected, renamed
 * in place, configured through the toolbar under them and dragged by their
 * handle. Every change edits the session's draft, one undo step per action;
 * nothing of the card is written until Save. The note saves as it is typed.
 */
export function TemplateEditor(props: TemplateEditorProps): React.JSX.Element {
  const { app, session, host, registerKeys } = props;
  const snapshot = useSessionSnapshot(session);
  const rootRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState<TemplateUsage | null>(null);
  const [saving, setSaving] = useState(false);
  const [diceRolls, setDiceRolls] = useState(false);
  const [json, setJson] = useState(false);
  // The selected tile's Options popover, and the input it opens on.
  const [options, setOptions] = useState<{ focusKey?: string | undefined } | null>(null);
  const collectionId = useEditorCollection(app, props.collectionId);
  const collectionKeys = useCollectionFieldKeys(app, collectionId);
  const playersRow = usePlayersRow(app);
  const library = useTemplateLibrary(app ?? null);
  const room = usePanelRoom(app, rowRef, previewRef);
  // A template just made, with no tile to select, opens with the cursor in its text.
  const [focusText] = useState(() => snapshot.unsaved && !props.initialSelection?.length);
  const state = useEditorState({ session, snapshot, collectionKeys, stageRef, layer, initialSelection: props.initialSelection });
  const openSave = (): void => {
    // A component exists only with a name: one still waiting for it goes before the template is saved.
    state.naming?.onCancel(false);
    if (canSave(session.getSnapshot())) setSaving(true);
  };

  // A Table has no label of its own: Enter (or Rename) types its first cell instead.
  const [tableTyping, setTableTyping] = useState<TableTypingRequest | null>(null);
  const editLabel = (id: string, part?: LabelPart): void => {
    if (tableParts(session.getSnapshot().template, id)) setTableTyping((now) => ({ blockId: id, count: (now?.count ?? 0) + 1 }));
    else state.editLabel(id, part);
  };

  const target: KeyboardTarget = {
    rootRef, session, selection: state.selection, drawn: state.drawn, select: state.select, settle: state.settle,
    editLabel, openInsert: () => state.openInsert(), openMenu: () => setMenuOpen(true), openSave, clipOwner: app ?? LOCAL_CLIPS,
  };
  const onKey = useTemplateKeyboard(target);
  useEffect(() => {
    registerKeys?.(onKey);
    return () => registerKeys?.(null);
  }, [registerKeys, onKey]);

  // A tile placed asks for its name alone: Options open for another tile close.
  const naming = state.naming?.blockId ?? null;
  useEffect(() => {
    if (naming !== null) setOptions(null);
  }, [naming]);

  // Only a tile that has Options opens them: a part of the header has none.
  const openOptions = (focusKey?: string): void => {
    const [only] = state.selection;
    if (state.selection.length === 1 && only && optionsKindOf(session.getSnapshot().template, only)) setOptions({ focusKey });
  };
  const context: TemplateEditorContextValue = {
    app, session, snapshot, selection: state.selection, select: state.select,
    insert: (item) => state.insert(item),
    editLabel, announce: state.announce, collectionId, collectionKeys, openOptions, playersRow, tableTyping,
  };
  // Focus goes back to the card: the selected tile, else the first thing on it.
  const closeJson = (): void => {
    setJson(false);
    state.select(state.selection.length > 0 ? state.selection : selectableBlocks(snapshot.template).slice(0, 1));
  };

  return (
    <TemplateEditorContext.Provider value={context}>
      <div
        ref={rootRef}
        className="atlas-te"
        data-width={room.editorWidth}
        style={{ '--atlas-te-panel-width': `${room.width}px` } as React.CSSProperties}
        onKeyDown={(event) => {
          if (!handleShellKey(event.nativeEvent, () => openOptions()) && !onKey(event.nativeEvent)) return;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <TemplateDragAndDrop
          rootRef={rootRef}
          stageRef={stageRef}
          session={session}
          readOnly={snapshot.readOnly}
          record={EMPTY_RECORD}
          app={app}
          sourcePath={undefined}
          settle={state.settle}
          select={state.select}
          announce={state.announce}
        >
          <TemplateNoteRow
            ref={rowRef}
            app={app}
            room={room}
            previewRef={previewRef}
            capsule={(
              <TemplateCapsule
                snapshot={snapshot}
                onSave={openSave}
                menu={{
                  startFromNote: app && !snapshot.readOnly ? () => chooseNoteToStartFrom(app, session) : undefined,
                  diceRolls: () => setDiceRolls(true),
                  json: { open: json, toggle: () => (json ? closeJson() : setJson(true)) },
                  deleteTemplate: app && snapshot.path !== null && !snapshot.readOnly ? () => setDeleting(templateUsage(app, snapshot.id)) : undefined,
                  add: room.editorWidth === 'stacked' && !snapshot.readOnly
                    ? insertItems().map((item) => ({ label: `Add ${item.label.toLowerCase()}`, icon: 'plus', onClick: () => context.insert(item) }))
                    : undefined,
                }}
              />
            )}
            noteCover={json ? <TemplateJsonEditor onDone={closeJson} /> : undefined}
            focusText={focusText}
            stateBars={<TemplateStateBars session={session} snapshot={snapshot} />}
            card={(
              <Canvas
                stageRef={stageRef}
                app={app}
                template={snapshot.template}
                templateName={snapshot.name}
                record={EMPTY_RECORD}
                selection={state.selection}
                editable={!snapshot.readOnly}
                label={state.editing}
                washId={state.washId}
                onWashed={state.clearWash}
                onSelect={(selection) => state.select(selection, false)}
                onEditLabel={editLabel}
                onInsertAt={state.openInsertAtGap}
                onRemovePart={(id, index) => state.settle(removePart(session, id, index), true)}
                focusRequest={state.focusRequest}
                empty={(
                  <BlankCard onInsert={snapshot.readOnly ? undefined : (item) => context.insert(item)} />
                )}
              />
            )}
            footer={(
              <>
                <HiddenValueChips template={snapshot.template} editable={!snapshot.readOnly} onShow={(id) => state.settle(toggleHeaderPartHidden(session, id), true)} />
                <TemplateFooterLine snapshot={snapshot} />
              </>
            )}
          />
          {room.editorWidth !== 'stacked' && (
            <EditorDock
              onAdd={snapshot.readOnly ? undefined : context.insert}
              canUndo={snapshot.canUndo || state.naming !== null}
              canRedo={snapshot.canRedo}
              onUndo={() => (state.naming ? state.naming.onCancel(true) : session.undo())}
              onRedo={() => session.redo()}
            />
          )}
          <div ref={setLayer} className="atlas-te-layer" />
          <EditorOverlays
            app={app}
            layer={layer}
            stage={stageRef.current}
            snapshot={snapshot}
            state={state}
            target={target}
            menuOpen={menuOpen}
            onMenuOpenChange={setMenuOpen}
            options={options}
            onOptions={openOptions}
            onOptionsClose={() => setOptions(null)}
          />
        </TemplateDragAndDrop>
        {saving && rootRef.current && (
          <SaveTemplateDialog
            anchor={rootRef.current}
            subject={snapshot}
            taken={nameTakenIn(library?.templates ?? [], snapshot.id, app)}
            onSave={host.save}
            onClose={() => setSaving(false)}
          />
        )}
        {diceRolls && rootRef.current && (
          <TemplateDiceDialog
            app={app}
            anchor={rootRef.current}
            diceSetId={snapshot.template.diceSetId ?? null}
            collectionId={collectionId}
            readOnly={snapshot.readOnly}
            onPick={(id) => { setTemplateDiceSet(session, id); }}
            onClose={() => setDiceRolls(false)}
          />
        )}
        {deleting && rootRef.current && app && (
          <DeleteTemplateDialog
            anchor={rootRef.current}
            name={snapshot.name}
            templateId={snapshot.id}
            usage={deleting}
            templates={library?.templates ?? []}
            onDelete={async (replacement) => {
              await deleteTemplate(app, snapshot.id, replacement);
              setDeleting(null);
              host.close();
            }}
            onClose={() => setDeleting(null)}
          />
        )}
      </div>
    </TemplateEditorContext.Provider>
  );
}
