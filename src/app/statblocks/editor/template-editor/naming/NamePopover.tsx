import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useIsPresent } from 'framer-motion';
import { useAnchoredPopoverVariants } from '../../../../packages/components/primitives/dialogMotion';
import { observeResize } from '../../../../utils/observeResize';
import { PANEL_SCROLL_SELECTOR } from '../../panel-frame/panelSelectors';
import { blockFrame } from '../editorChrome';
import type { Box } from '../gapGeometry';
import type { ChromeStyle } from '../LabelEditor';
import { placeClearOf, type OptionsPlacement } from '../options/optionsPlacement';
import { OUTLINE_OFFSET, TOOLBAR_GAP } from '../toolbar/toolbarBelow';
import type { NamePrompt } from './useBlockNaming';
import { t } from '../../../../i18n';
import './name-popover.scss';

export interface NamePopoverProps {
  /** The layer the popover is drawn in, over the whole editor. */
  layer: HTMLElement;
  /** The canvas stage holding the card. */
  stage: HTMLElement;
  prompt: NamePrompt;
  /** Whatever moves the tile: placed again when it changes. */
  revision: unknown;
}

/** Marks a control that answers a press while a name is asked for itself: the dock's Undo, which takes the tile away. */
export const UNDOES_PLACEMENT = 'data-te-undoes-placement';

const boxOf = (element: Element): Box => {
  const { left, top, right, bottom } = element.getBoundingClientRect();
  return { left, top, right, bottom };
};

/**
 * The name a tile just placed asks for: a small popover with one input, where
 * its toolbar would stand (below the tile, above it where there is no room,
 * never over it, inside the editor), while the toolbar steps aside. Enter
 * and Tab name the tile as its label's first name does; Escape, Mod+Z before
 * anything is typed, a press elsewhere and an empty name take the tile away
 * again. A press on the tile itself does nothing, so the name keeps its input.
 */
export function NamePopover({ layer, stage, prompt, revision }: NamePopoverProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [placement, setPlacement] = useState<OptionsPlacement | null>(null);
  const [value, setValue] = useState('');
  const done = useRef(false);
  const present = useIsPresent();
  const variants = useAnchoredPopoverVariants();
  const { blockId, onCommit, onCancel } = prompt;

  // The tile comes into view once, then the popover follows it as the card scrolls or changes size.
  useLayoutEffect(() => {
    blockFrame(stage, blockId)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [stage, blockId]);

  useLayoutEffect(() => {
    const popover = ref.current;
    if (!popover) return undefined;
    const update = (): void => {
      const tile = blockFrame(stage, blockId);
      if (!tile) return;
      const view = boxOf(layer);
      const size = { width: popover.offsetWidth, height: popover.offsetHeight };
      const next = placeClearOf(boxOf(tile), view, size, OUTLINE_OFFSET + TOOLBAR_GAP);
      const placed = { ...next, left: next.left - view.left, top: next.top - view.top };
      setPlacement((was) => (was && was.left === placed.left && was.top === placed.top && was.side === placed.side ? was : placed));
    };
    update();
    const scroller = stage.closest(PANEL_SCROLL_SELECTOR);
    scroller?.addEventListener('scroll', update, { passive: true });
    const stop = observeResize([popover, layer, stage], update);
    return () => {
      scroller?.removeEventListener('scroll', update);
      stop();
    };
  }, [layer, stage, blockId, revision]);

  const placed = placement !== null;
  useEffect(() => {
    if (placed) inputRef.current?.focus({ preventScroll: true });
  }, [placed]);

  // It answers once: a key, or the press that took it away.
  const finish = (action: () => void): void => {
    if (done.current) return;
    done.current = true;
    action();
  };

  // A press anywhere else takes the tile away and goes on to do what it does there; one on the tile is swallowed.
  useEffect(() => {
    if (!present) return undefined;
    const doc = layer.doc;
    const onTile = (event: Event): boolean => {
      const tile = blockFrame(stage, blockId);
      return tile !== null && event.composedPath().includes(tile);
    };
    const swallow = (event: Event): void => {
      if (done.current || !onTile(event)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (done.current || !ref.current || event.composedPath().includes(ref.current)) return;
      if (onTile(event)) {
        swallow(event);
        return;
      }
      // The dock's Undo answers with its click: it takes the tile away rather than undo what came before.
      const target = event.target as { closest?: (selector: string) => Element | null } | null;
      if (typeof target?.closest === 'function' && target.closest(`[${UNDOES_PLACEMENT}]`)) return;
      done.current = true;
      onCancel(false);
    };
    doc.addEventListener('pointerdown', onPointerDown, true);
    doc.addEventListener('mousedown', swallow, true);
    doc.addEventListener('click', swallow, true);
    doc.addEventListener('dblclick', swallow, true);
    return () => {
      doc.removeEventListener('pointerdown', onPointerDown, true);
      doc.removeEventListener('mousedown', swallow, true);
      doc.removeEventListener('click', swallow, true);
      doc.removeEventListener('dblclick', swallow, true);
    };
  }, [layer, stage, blockId, onCancel, present]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing) return;
    const undo = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'z';
    if (event.key === 'Enter' || event.key === 'Tab') finish(() => onCommit(value));
    else if (event.key === 'Escape' || (undo && value === '')) finish(() => onCancel(true));
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  const style: React.CSSProperties & ChromeStyle = {
    '--atlas-te-naming-x': `${placement?.left ?? 0}px`,
    '--atlas-te-naming-y': `${placement?.top ?? 0}px`,
  };

  return createPortal(
    <div
      ref={ref}
      className="atlas-te-naming"
      data-side={placement?.side}
      data-placed={placed ? '' : undefined}
      data-closing={present ? undefined : ''}
      style={style}
      role="dialog"
      aria-label={t('templateEditor.name')}
    >
      <motion.div className="atlas-te-naming__panel" variants={variants} initial="hidden" animate="visible" exit="exit">
        <input
          ref={inputRef}
          type="text"
          className="atlas-te-naming__input"
          value={value}
          placeholder={prompt.placeholder}
          spellCheck={false}
          autoComplete="off"
          aria-label={prompt.placeholder}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
        />
      </motion.div>
    </div>,
    layer,
  );
}
