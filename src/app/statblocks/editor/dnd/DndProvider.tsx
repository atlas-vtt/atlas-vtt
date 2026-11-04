import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent, type DropAnimationFunction, type Modifier,
} from '@dnd-kit/core';
import type { App } from 'obsidian';
import { MOTION_EASE_OUT, prefersReducedMotion } from '../../../utils/motion';
import type { FieldRecord } from '../../values/fieldValues';
import { blockName } from '../template-editor/blockNames';
import { blockFrame } from '../template-editor/editorChrome';
import type { BlockSelection } from '../template-editor/selection';
import type { InsertOutcome } from '../template-editor/blockActions';
import type { EditorSession } from '../template-editor/sessionTypes';
import { cancelledText, DRAG_INSTRUCTIONS, pickedUpText, targetText } from './announcements';
import { CanvasDrag } from './canvasDrag';
import { noCollisions } from './collision';
import { DRAGGING_ATTRIBUTE, POINTER_ACTIVATION, SILENT_ANNOUNCEMENTS } from './dndConfig';
import { sourceName, sourceOf, subjectOf, type DragSource } from './dragSources';
import { applyDrop } from './dropEdits';
import type { DropView } from './dropView';
import { cardTileWidth, DragPreview } from './DragPreview';
import { DropIndicator } from './DropIndicator';
import { ViewKeyboardSensor, type KeyboardStepper, type ViewKeyboardOptions } from './keyboardSensor';
import './dnd.scss';

/** How long the copy under the pointer takes to settle where the block landed (§7.6). */
export const SETTLE_MS = 180;
/** How far below and right of the pointer the copy hangs, so the drop line under the pointer stays in view. */
const HANG = 12;
/** The block the copy settles onto stays hidden until the copy is there. */
const LANDING_ATTRIBUTE = 'data-te-landing';

export interface TemplateDragAndDropProps {
  /** The editor's root, marked while a drag runs (its chrome steps aside). */
  rootRef: { readonly current: HTMLElement | null };
  stageRef: { readonly current: HTMLElement | null };
  session: EditorSession;
  readOnly: boolean;
  /** What the card previews with, for the copy of a block under the pointer. */
  record: FieldRecord;
  app?: App | undefined;
  sourcePath?: string | undefined;
  settle: (outcome: InsertOutcome) => void;
  select: (selection: BlockSelection, focus?: boolean) => void;
  announce: (text: string | undefined) => void;
  children: React.ReactNode;
}

interface Live {
  drag: CanvasDrag;
  source: DragSource;
  keyboard: boolean;
  name: string;
  /** The session the drag holds a gesture of, from pick-up to drop. */
  session: EditorSession;
}

function isKeyboard(event: Event | null): boolean {
  return event !== null && 'key' in event;
}

/** A pointer drag's copy hangs off the pointer by its top-left corner instead of covering the place it would land. */
const hangOffPointer: Modifier = ({ activatorEvent, activeNodeRect, transform }) => {
  if (!activatorEvent || !activeNodeRect || !('clientX' in activatorEvent) || !('clientY' in activatorEvent)) return transform;
  const { clientX, clientY } = activatorEvent as PointerEvent;
  return { ...transform, x: transform.x + clientX - activeNodeRect.left + HANG, y: transform.y + clientY - activeNodeRect.top + HANG };
};
const MODIFIERS = [hangOffPointer];

/**
 * Drag and drop in the template editor (§4.7, §7.6): tiles of the card and
 * kinds from the dock, by pointer or (Space) keyboard. dnd-kit runs the
 * sensors and the copy under the pointer; `CanvasDrag` the targets, lines and
 * slides; a drop is one undo step and focus stays on the block that moved.
 * The copy lives in the view's own document's body, so `contain: strict` on
 * Obsidian's leaves cannot pin it, and a popout gets its own.
 */
export function TemplateDragAndDrop(props: TemplateDragAndDropProps): React.JSX.Element {
  const { rootRef, stageRef } = props;
  const latest = useRef(props);
  latest.current = props;
  const stepper = useRef<KeyboardStepper | null>(null);
  const keyboardOptions = useMemo<ViewKeyboardOptions>(() => ({ stepper }), []);
  const sensors = useSensors(useSensor(PointerSensor, POINTER_ACTIVATION), useSensor(ViewKeyboardSensor, keyboardOptions));
  const live = useRef<Live | null>(null);
  const landing = useRef<{ id: string | null; fade: boolean }>({ id: null, fade: false });
  const [source, setSource] = useState<DragSource | null>(null);
  const [stage, setStage] = useState<HTMLElement | null>(null);
  const [view, setView] = useState<DropView | null>(null);
  const [landed, setLanded] = useState<{ id: string; count: number } | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [tileWidth, setTileWidth] = useState<number | null>(null);

  const onDragStart = useCallback(({ active, activatorEvent }: DragStartEvent): void => {
    const { session, readOnly, announce } = latest.current;
    const stage = stageRef.current;
    const picked = sourceOf(active.data.current);
    const template = session.getSnapshot().template;
    const subject = picked ? subjectOf(template, picked) : null;
    if (!stage || !picked || !subject) return;
    const keyboard = isKeyboard(activatorEvent);
    const name = sourceName(template, picked, (block) => blockName(block, template.fields));
    const drag = new CanvasDrag({
      stage, readOnly, template: () => latest.current.session.getSnapshot().template,
      onTarget: (target, next) => {
        setView(next);
        rootRef.current?.toggleAttribute('data-drop-refused', target?.kind === 'refused');
        if (target) latest.current.announce(targetText(latest.current.session.getSnapshot().template.layout, template.fields, target, subject.movingId));
      },
    }, subject, keyboard);
    // The whole drag is one gesture: nothing is saved while a block is held, and a change written elsewhere meanwhile is a conflict, not a silent reload under the drag.
    session.beginGesture();
    live.current = { drag, source: picked, keyboard, name, session };
    stepper.current = drag;
    landing.current = { id: null, fade: false };
    drag.start();
    rootRef.current?.setAttribute(DRAGGING_ATTRIBUTE, '');
    setStage(stage);
    setHost(stage.doc.body);
    setTileWidth(picked.kind === 'item' ? cardTileWidth(stage) : null);
    setSource(picked);
    announce(pickedUpText(name, keyboard));
  }, [rootRef, stageRef]);

  const end = useCallback((dropped: boolean): void => {
    const current = live.current;
    live.current = null;
    stepper.current = null;
    rootRef.current?.removeAttribute(DRAGGING_ATTRIBUTE);
    rootRef.current?.removeAttribute('data-drop-refused');
    setView(null);
    if (!current) return;
    const { settle, select, announce } = latest.current;
    const { session } = current;
    const target = current.drag.finish();
    if (dropped && target && target.kind !== 'refused') {
      // The drag changed nothing until here: its gesture ends first, so a tile placed to be named holds a gesture of its own.
      session.endGesture();
      const outcome = applyDrop(session, current.source, target);
      settle(outcome);
      // Found when the copy settles: by then the card has drawn the block in its new place.
      landing.current = { id: outcome.landed ?? outcome.inserted ?? null, fade: outcome.inserted !== undefined };
      const { landed: id } = outcome;
      if (id) setLanded((was) => ({ id, count: (was?.count ?? 0) + 1 }));
      return;
    }
    session.abandonGesture();
    announce(cancelledText(current.source.kind === 'block' ? current.name : null));
    if (current.keyboard && current.source.kind === 'block') select([current.source.id], true);
  }, [rootRef]);

  // The copy settles onto the block where it landed (or back where it came from), translated only; where
  // motion is reduced, or a new block plays its own entrance, it fades instead.
  const dropAnimation = useCallback<DropAnimationFunction>(({ active, dragOverlay, transform }) => {
    const overlay = dragOverlay.node;
    const { id, fade } = landing.current;
    const frame = id && stageRef.current ? blockFrame(stageRef.current, id) : null;
    const to = fade ? null : frame ?? (active.node.isConnected ? active.node : null);
    const opacity = Number(overlay.win.getComputedStyle(overlay).opacity) || 1;
    if (!to || prefersReducedMotion(overlay)) {
      return overlay.animate([{ opacity }, { opacity: 0 }], { duration: SETTLE_MS, easing: MOTION_EASE_OUT, fill: 'forwards' }).finished.then(() => undefined);
    }
    const target = to.getBoundingClientRect();
    const x = transform.x + target.left - dragOverlay.rect.left;
    const y = transform.y + target.top - dragOverlay.rect.top;
    to.setAttribute(LANDING_ATTRIBUTE, '');
    const settle = overlay.animate(
      [{ transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }, { transform: `translate3d(${x}px, ${y}px, 0)` }],
      { duration: SETTLE_MS, easing: MOTION_EASE_OUT, fill: 'forwards' },
    );
    const show = (): void => to.removeAttribute(LANDING_ATTRIBUTE);
    return settle.finished.then(show, show);
  }, [stageRef]);

  const preview = useMemo(() => (source ? (
    <DragPreview
      source={source} template={props.session.getSnapshot().template} record={props.record} app={props.app} sourcePath={props.sourcePath} tileWidth={tileWidth}
    />
  ) : null), [source, props.session, props.record, props.app, props.sourcePath, tileWidth]);

  const clearLanded = useCallback(() => setLanded(null), []);

  // A drag cut short by the editor going away gives its gesture back, so the session saves and undoes again.
  useEffect(() => () => {
    const current = live.current;
    live.current = null;
    current?.session.abandonGesture();
  }, []);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={noCollisions}
      autoScroll={false}
      accessibility={{ announcements: SILENT_ANNOUNCEMENTS, screenReaderInstructions: { draggable: DRAG_INSTRUCTIONS }, restoreFocus: false }}
      onDragStart={onDragStart}
      onDragEnd={(_event: DragEndEvent) => end(true)}
      onDragCancel={() => end(false)}
    >
      {props.children}
      <DropIndicator stage={stage} view={view} landed={landed} onLanded={clearLanded} />
      {host && createPortal(
        <div className="atlas-vtt-plugin atlas-te-drag-layer">
          <DragOverlay
            className="atlas-te-drag-overlay"
            modifiers={MODIFIERS}
            dropAnimation={dropAnimation}
            transition={(event) => (isKeyboard(event) && !prefersReducedMotion(host) ? `transform ${SETTLE_MS}ms ${MOTION_EASE_OUT}` : undefined)}
          >
            {preview && <div className="atlas-te-drag-overlay__face">{preview}</div>}
          </DragOverlay>
        </div>,
        host,
      )}
    </DndContext>
  );
}
