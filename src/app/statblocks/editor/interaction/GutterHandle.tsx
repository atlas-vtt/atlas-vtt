import React, { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Ellipsis, GripHorizontal, GripVertical, Lock } from 'lucide-react';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { observeResize } from '../../../utils/observeResize';
import { chromeButtonProps } from './chrome';
import type { HandlePlacement } from './handleGeometry';
import type { HoverStore, HoverTarget } from './hoverStore';
import { measureHandle } from './measureHandle';

/** ⋮⋮ drags and opens the menu; ⋯ only opens it; the lock says the template is from a newer Atlas (§3.2). */
export type HandleGlyph = 'grip' | 'menu' | 'lock';

export interface GutterHandleProps {
  store: HoverStore;
  /** The positioned layer the handle is drawn in, outside the card's scroller. */
  layer: HTMLElement;
  /** The glyph a target's handle shows; null for a target without one. */
  glyphOf: (target: HoverTarget) => HandleGlyph | null;
  /** Its accessible name and tooltip: "Drag to move · Click for options", "Options for Spells". */
  labelOf: (target: HoverTarget) => string;
  /** A click: the target's menu, hanging from the handle; unset where targets have no menu (a statblock's abilities, only dragged). */
  onMenu?: ((target: HoverTarget, handle: HTMLElement) => void) | undefined;
  /** A press on a ⋮⋮ handle, which may become a drag; the handle stays as it is until the press ends. */
  onPress?: ((target: HoverTarget, event: React.PointerEvent<HTMLButtonElement>) => void) | undefined;
}

type Placed = HandlePlacement & { left: number; top: number };

function placeIn(layer: HTMLElement, target: HoverTarget): Placed | null {
  const placement = measureHandle(target.element);
  if (!placement) return null;
  const origin = layer.getBoundingClientRect();
  return { ...placement, left: placement.x - origin.left, top: placement.y - origin.top };
}

/**
 * The handle in the gutter of the hovered target (spec §3): a real button
 * that never takes focus, drawn in a layer outside the scroller and placed
 * from the target's measured box, again on every scroll and resize. Only the
 * innermost target has one. From a press until the drag ends or the menu
 * opens, nothing re-targets or unmounts it (the frozen-handle rule, §3.4).
 */
export function GutterHandle({ store, layer, glyphOf, labelOf, onMenu, onPress }: GutterHandleProps): React.JSX.Element | null {
  const { target } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [placed, setPlaced] = useState<Placed | null>(null);
  // From a press to its release the tooltip stays shut: a drag holds the pointer on the handle.
  const [pressed, setPressed] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!target) {
      setPlaced(null);
      return undefined;
    }
    const update = (): void => setPlaced(placeIn(layer, target));
    update();
    const doc = layer.doc;
    // Any scroller between the card and the layer moves the target: listened to in the capture phase, on the layer's own document.
    doc.addEventListener('scroll', update, { capture: true, passive: true });
    const stop = observeResize([target.element, layer], update);
    return () => {
      doc.removeEventListener('scroll', update, { capture: true });
      stop();
    };
  }, [layer, target]);

  const glyph = target ? glyphOf(target) : null;
  if (!target || !placed || !glyph) return null;
  const label = labelOf(target);
  const Icon = glyph === 'menu' ? Ellipsis : glyph === 'lock' ? Lock : placed.orientation === 'horizontal' ? GripHorizontal : GripVertical;
  const style = { '--atlas-sb-handle-x': `${placed.left}px`, '--atlas-sb-handle-y': `${placed.top}px` } as React.CSSProperties;

  const press = (event: React.PointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return;
    store.freeze();
    setPressed(true);
    store.markMenuTarget(target.element);
    const doc = event.currentTarget.doc;
    const release = (): void => {
      doc.removeEventListener('pointerup', release, true);
      doc.removeEventListener('pointercancel', release, true);
      store.thaw();
      setPressed(false);
      // A drag ended away from the handle: nothing is pointed at any more. A click keeps the mark for its menu.
      if (!store.handleHovered && !store.markHeld) store.markMenuTarget(null);
    };
    doc.addEventListener('pointerup', release, true);
    doc.addEventListener('pointercancel', release, true);
    if (glyph === 'grip') onPress?.(target, event);
  };

  return (
    <LabelTooltip label={label} side="left" suppressed={pressed}>
      <button
        ref={button}
        {...chromeButtonProps()}
        className="atlas-sb-handle"
        data-glyph={glyph}
        data-orientation={placed.orientation}
        aria-label={label}
        style={style}
        onPointerEnter={() => {
          store.handleHovered = true;
          store.cancelClear();
          store.markMenuTarget(target.element);
        }}
        onPointerLeave={() => {
          store.handleHovered = false;
          if (!store.markHeld) store.markMenuTarget(null);
          store.scheduleClear(layer.win);
        }}
        onPointerDown={press}
        onClick={(event) => onMenu?.(target, event.currentTarget)}
        onContextMenu={(event) => {
          event.preventDefault();
          onMenu?.(target, event.currentTarget);
        }}
      >
        <Icon aria-hidden="true" />
      </button>
    </LabelTooltip>
  );
}
