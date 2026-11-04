/**
 * The places a drag starts (spec §7.1): a block's gutter handle (the only
 * pointer source on the card: pressing a block's body selects it, edits its
 * label or selects text, never drags), a focused block picked up with Space,
 * and a kind of the dock. Each is a dnd-kit draggable; outside
 * `TemplateDragAndDrop` they do nothing, so the parts still render in a test
 * without it.
 */

import { useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useDraggable, type DraggableSyntheticListeners } from '@dnd-kit/core';
import { isHeaderBlockId } from '../../model/templateHeader';
import { blockFrame, frameAt } from '../template-editor/editorChrome';
import { itemKey, type InsertItem } from '../template-editor/insertItems';
import type { DragData } from './dragSources';

type Handler<E> = (event: E) => void;

const SHEET = '.atlas-statblock';

function listener<E>(listeners: DraggableSyntheticListeners, name: 'onPointerDown' | 'onKeyDown'): Handler<E> | undefined {
  const found = listeners?.[name];
  return typeof found === 'function' ? (found as Handler<E>) : undefined;
}

/**
 * Space on a focused block of the canvas picks it up for the arrow keys (spec
 * §7.4): one draggable that takes the focused block when the key comes, so
 * 150 blocks need no 150 registrations and the card's renderer stays free of
 * dnd-kit. The pointer never drags from here.
 */
export function useCanvasKeyDrag(stageRef: { readonly current: HTMLElement | null }, enabled: boolean): { onKeyDown: Handler<KeyboardEvent> } {
  const [data] = useState<DragData>(() => ({ source: null }));
  const { listeners, setNodeRef, setActivatorNodeRef } = useDraggable({ id: 'atlas-te-canvas-block', data, disabled: !enabled });
  return {
    onKeyDown: (event) => {
      const target = event.target as Element;
      const sheet = stageRef.current?.querySelector<HTMLElement>(SHEET);
      if (!sheet || typeof target.hasAttribute !== 'function' || !target.hasAttribute('data-block-id')) return;
      const frame = frameAt(target, sheet);
      const id = frame?.getAttribute('data-block-id');
      // The header's parts never move (`templateHeader`).
      if (!frame || !id || isHeaderBlockId(id)) return;
      data.source = { kind: 'block', id };
      setNodeRef(frame);
      setActivatorNodeRef(frame);
      listener<KeyboardEvent>(listeners, 'onKeyDown')?.(event);
    },
  };
}

/**
 * A block's gutter handle (spec §3, §7.3): a press that moves past the
 * threshold drags the block it stands beside; a press that does not is a
 * click, which opens the block's menu.
 */
export function useBlockHandleDrag(stage: HTMLElement | null, enabled: boolean): (blockId: string, event: PointerEvent) => void {
  const [data] = useState<DragData>(() => ({ source: null }));
  const { listeners, setNodeRef, setActivatorNodeRef } = useDraggable({ id: 'atlas-te-block-handle', data, disabled: !enabled });
  return (blockId, event) => {
    const frame = stage ? blockFrame(stage, blockId) : null;
    const button = event.currentTarget as HTMLElement | null;
    if (!frame || !button) return;
    data.source = { kind: 'block', id: blockId };
    setNodeRef(frame);
    setActivatorNodeRef(button);
    listener<PointerEvent>(listeners, 'onPointerDown')?.(event);
  };
}

export interface PointerDragProps {
  ref: (element: HTMLElement | null) => void;
  onPointerDown?: Handler<PointerEvent> | undefined;
}

/** A kind of the dock dragged onto the canvas inserts its block there; a click inserts it after the selection. */
export function useKindDrag(item: InsertItem, disabled: boolean): PointerDragProps {
  const data = useMemo<DragData>(() => ({ source: { kind: 'item', item } }), [item]);
  const { listeners, setNodeRef } = useDraggable({ id: `atlas-te-item:${itemKey(item)}`, data, disabled });
  return { ref: setNodeRef, onPointerDown: listener(listeners, 'onPointerDown') };
}
