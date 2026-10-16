import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useIsPresent } from 'framer-motion';
import { handledByAnotherControl } from '../../../../keyboard/tooltipEscape';
import { useAnchoredPopoverVariants } from '../../../../packages/components/primitives/dialogMotion';
import { observeResize } from '../../../../utils/observeResize';
import { findBlock } from '../../../model/treeQueries';
import { PANEL_SCROLL_SELECTOR } from '../../panel-frame/panelSelectors';
import { blockName } from '../blockNames';
import { blockFrame } from '../editorChrome';
import { useTemplateEditor } from '../editorContext';
import type { Box } from '../gapGeometry';
import { LineFields } from '../inspector/LineFields';
import type { ChromeStyle } from '../LabelEditor';
import { readOnlyMessage } from '../sessionEdit';
import { AbilitiesOptions } from './AbilitiesOptions';
import { optionsKindOf } from './optionsKind';
import { PlayersSetting } from './PlayersSetting';
import { RollSetting } from './RollSetting';
import { placeOptions, type OptionsPlacement, type OptionsRoom } from './optionsPlacement';
import { TableOptions } from './TableOptions';
import { ValueOptions } from './ValueOptions';
import '../inspector/inspector.scss';
import './options.scss';

export interface TileOptionsProps {
  /** The layer the popover is drawn in, over the whole editor. */
  layer: HTMLElement;
  /** The canvas stage holding the card. */
  stage: HTMLElement;
  blockId: string;
  /** Whatever moves the tile: placed again when it changes. */
  revision: unknown;
  /** The input to focus (`data-focus-key`); the first control otherwise. */
  focusKey?: string | undefined;
  /** `returnFocus`: a key closed it, so focus goes back to the tile; a press elsewhere takes focus where it lands. */
  onClose: (returnFocus: boolean) => void;
}

/** The toolbar's Options button, which opens and closes the popover itself. */
export const OPTIONS_BUTTON = '[data-options]';

const boxOf = (element: Element): Box => {
  const { left, top, right, bottom } = element.getBoundingClientRect();
  return { left, top, right, bottom };
};

/** What the Options are placed by, measured in the window (`optionsPlacement`); null while the tile is not drawn. */
function measureRoom(layer: HTMLElement, stage: HTMLElement, blockId: string): OptionsRoom | null {
  const tile = blockFrame(stage, blockId);
  if (!tile) return null;
  const toolbar = layer.querySelector('.atlas-te-toolbar:not([data-hidden])');
  const dock = layer.closest('.atlas-te')?.querySelector('.atlas-te-dock');
  return {
    tile: boxOf(tile),
    toolbar: toolbar ? boxOf(toolbar) : null,
    card: boxOf(stage.closest('.atlas-sb-note-panel') ?? stage),
    dock: dock ? boxOf(dock) : null,
    view: boxOf(layer),
  };
}

/** The first control in the popover, or the one `focusKey` names. */
function focusTarget(root: HTMLElement, focusKey: string | undefined): HTMLElement | null {
  const named = focusKey ? root.querySelector<HTMLElement>(`[data-focus-key="${focusKey}"]`) : null;
  return named ?? root.querySelector<HTMLElement>('input:not([disabled]), button:not([disabled]), [tabindex="0"]');
}

/**
 * A tile's Options: beside the card at the tile's height, where they show
 * whole (`optionsPlacement`), holding only what the tile's kind has: the kind
 * of value and choices of a Value, the parts and tabs of an Abilities list,
 * the columns of a Table, the values of the line under the name, whether a
 * Metric's numbers roll as a bonus, and, where
 * switched on, what players may do with the tile. Their width
 * is fixed; they scroll only where they are taller than the editor. Escape or
 * a press outside closes them; every change is one undo step as it is made.
 */
export function TileOptions({ layer, stage, blockId, revision, focusKey, onClose }: TileOptionsProps): React.JSX.Element | null {
  const { session, snapshot, playersRow = false } = useTemplateEditor();
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const [placement, setPlacement] = useState<OptionsPlacement | null>(null);
  // Fading out (another tile's Options took its place): it takes no press and no keys.
  const present = useIsPresent();
  const variants = useAnchoredPopoverVariants();
  const { template, readOnly } = snapshot;
  const block = findBlock(template.layout.blocks, blockId)?.block;
  const kind = optionsKindOf(template, blockId);

  // Placed before paint, and again when its content, the editor or the card's scroll changes.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const content = contentRef.current;
    if (!panel || !content) return undefined;
    const update = (): void => {
      const room = measureRoom(layer, stage, blockId);
      if (!room) return;
      // The whole content, also while the panel is capped and scrolls: its parts and its border. Not its
      // scroll height, which a select's open list, hanging out of the panel, would add to.
      const parts = [...panel.children].reduce((sum, child) => sum + (child.instanceOf(HTMLElement) ? child.offsetHeight : 0), 0);
      const height = parts + panel.offsetHeight - panel.clientHeight;
      const next = placeOptions(room, { width: panel.offsetWidth, height });
      const origin = boxOf(layer);
      const placed = { ...next, left: next.left - origin.left, top: next.top - origin.top };
      setPlacement((was) => (was && was.left === placed.left && was.top === placed.top && was.maxHeight === placed.maxHeight && was.side === placed.side ? was : placed));
    };
    update();
    const scroller = stage.closest(PANEL_SCROLL_SELECTOR);
    scroller?.addEventListener('scroll', update, { passive: true });
    const stop = observeResize([content, layer, stage], update);
    return () => {
      scroller?.removeEventListener('scroll', update);
      stop();
    };
  }, [layer, stage, blockId, revision]);

  // Once it has its place: what is not shown yet takes no focus.
  const placed = placement !== null;
  useEffect(() => {
    const root = ref.current;
    if (root && placed) focusTarget(root, focusKey)?.focus({ preventScroll: true });
  }, [focusKey, placed]);

  // Captured on the layer's own document, so the editor's Escape (which clears the selection) waits for the popover.
  useEffect(() => {
    if (!present) return undefined;
    const doc = layer.doc;
    const onPointerDown = (event: PointerEvent): void => {
      const pressed = event.target as Partial<Element> | null;
      // The Options button closes it on its click; closing here too would have that click open it again.
      if (typeof pressed?.closest === 'function' && pressed.closest(OPTIONS_BUTTON)) return;
      if (ref.current && !event.composedPath().includes(ref.current)) onClose(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || handledByAnotherControl(event)) return;
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
    };
    doc.addEventListener('pointerdown', onPointerDown, true);
    doc.addEventListener('keydown', onKeyDown, true);
    return () => {
      doc.removeEventListener('pointerdown', onPointerDown, true);
      doc.removeEventListener('keydown', onKeyDown, true);
    };
  }, [layer, onClose, present]);

  // The tile went (deleted, undone) or no longer has Options: nothing to show.
  useEffect(() => {
    if (!block || !kind) onClose(false);
  }, [block, kind, onClose]);
  if (!block || !kind) return null;

  const props = { block, session, readOnly };
  const style: React.CSSProperties & ChromeStyle = {
    '--atlas-te-options-x': `${placement?.left ?? 0}px`,
    '--atlas-te-options-y': `${placement?.top ?? 0}px`,
    ...(placement?.maxHeight != null && { '--atlas-te-options-max-height': `${placement.maxHeight}px` }),
  };
  const locked = readOnlyMessage(snapshot);

  return createPortal(
    <div
      ref={ref}
      className="atlas-te-options"
      data-side={placement?.side}
      data-placed={placed ? '' : undefined}
      data-capped={placement?.maxHeight != null ? '' : undefined}
      data-closing={present ? undefined : ''}
      style={style}
      role="dialog"
      aria-label={`${blockName(block, template.fields)} options`}
    >
      <motion.div ref={panelRef} className="atlas-te-options__panel" variants={variants} initial="hidden" animate="visible" exit="exit">
        {locked && <p className="atlas-te-insp__locked">{locked}</p>}
        <section ref={contentRef} className="atlas-te-group">
          {kind === 'value' && <ValueOptions {...props} />}
          {kind === 'abilities' && <AbilitiesOptions {...props} />}
          {kind === 'table' && <TableOptions {...props} />}
          {kind === 'metric' && <RollSetting {...props} />}
          {kind === 'line' && block.type === 'line' && <LineFields {...props} block={block} template={template} parent={null} />}
          {playersRow && kind !== 'line' && <PlayersSetting {...props} />}
        </section>
      </motion.div>
    </div>,
    layer,
  );
}
