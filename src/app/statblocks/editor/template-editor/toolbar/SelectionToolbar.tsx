import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BetweenVerticalEnd, Ellipsis, EyeOff, Pencil, Plus, Settings2, Trash2, type LucideIcon } from 'lucide-react';
import { ToolButton } from '../../../../packages/components/primitives/ToolButton';
import { useKeepInView } from '../../../../packages/components/primitives/useKeepInView';
import { observeResize } from '../../../../utils/observeResize';
import { cn } from '../../../../../utils/cn';
import type { FieldType, TemplateBlock } from '../../../model/templateTypes';
import { CHROME_ATTRIBUTE } from '../../interaction/chrome';
import { PANEL_SCROLL_SELECTOR } from '../../panel-frame/panelSelectors';
import { blockFrame } from '../editorChrome';
import { blockGlyph, fieldTypeGlyph } from '../editorGlyphs';
import type { ChromeStyle } from '../LabelEditor';
import { shortcutText } from '../shortcutText';
import { HIDDEN_TOOLBAR, placeBelow, type ToolbarPlacement } from './toolbarBelow';
import { t } from '../../../../i18n';
import './selection-toolbar.scss';

export interface SelectionToolbarProps {
  /** The layer the toolbar is drawn in, over the whole editor. */
  layer: HTMLElement;
  /** The canvas stage holding the card. */
  stage: HTMLElement;
  block: TemplateBlock;
  /** How many blocks are selected: the toolbar then says "3 blocks". */
  count: number;
  editable: boolean;
  /** Whatever changes the block's place: re-measured when it changes. */
  revision: unknown;
  /** What the chip calls the tile: its kind ("Value", "Abilities"), or a part of the header by its name ("Challenge"). */
  chipLabel: string;
  /** A part of the header: it is only renamed and, where `hideable`, hidden; it never moves or goes. */
  headerPart?: { hideable: boolean; onRename: () => void } | undefined;
  /** Set on a Value tile: the kind it holds, and the menu that changes it. */
  valueKind?: { label: string; type: FieldType; onOpen: (button: HTMLElement) => void } | undefined;
  /** Set on a Metric or Table tile: adds a number or a column at its end (`label`), while it takes one (else `full` says why not). */
  addPart?: { label: string; canAdd: boolean; full: string; onAdd: () => void } | undefined;
  /** Set where the tile has Options. */
  onOptions?: ((button: HTMLElement) => void) | undefined;
  onAddBelow: () => void;
  onDelete: () => void;
  /** Hides a part of the header; the chips under the card show it again. */
  onToggleHidden: () => void;
  onMore: (button: HTMLElement) => void;
  /** The block's menu is open: the toolbar keeps out of its way until it closes. */
  menuOpen: boolean;
  /** A right-click on the toolbar: the toolbar has no menu, so it opens the menu of the block under it. */
  onMenuBelow: (point: { x: number; y: number }) => void;
}

/** The tile's box, with the room a Table keeps around it for its handles and add buttons, which the toolbar must not cover. */
function tileBox(frame: HTMLElement): { left: number; top: number; right: number; bottom: number } {
  const { left, top, right, bottom } = frame.getBoundingClientRect();
  const room = frame.querySelector('.atlas-sb-sheet-table__room')?.getBoundingClientRect();
  return room ? { left, right, top: Math.min(top, room.top), bottom: Math.max(bottom, room.bottom) } : { left, top, right, bottom };
}

function measure(stage: HTMLElement, layer: HTMLElement, blockId: string, toolbar: HTMLElement | null): ToolbarPlacement {
  const frame = blockFrame(stage, blockId);
  const view = stage.closest(PANEL_SCROLL_SELECTOR) ?? stage;
  if (!frame || !toolbar) return HIDDEN_TOOLBAR;
  return placeBelow(tileBox(frame), view.getBoundingClientRect(), layer.getBoundingClientRect(), {
    width: toolbar.offsetWidth,
    height: toolbar.offsetHeight,
  });
}

/** A toolbar button that hands its own element to `onPress`, so what it opens hangs from it. */
function AnchoredButton({ icon, label, shortcut, onPress, attribute }: {
  icon: LucideIcon; label: string; shortcut?: string | undefined; onPress: (button: HTMLElement) => void; attribute: string;
}): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);
  return (
    <span ref={ref} {...{ [attribute]: '' }}>
      <ToolButton icon={icon} label={label} {...(shortcut !== undefined && { shortcut })} isActive={false} onClick={() => { if (ref.current) onPress(ref.current); }} />
    </span>
  );
}

/**
 * The selected tile's toolbar (spec §4.2): below the tile (above it only
 * without room), in a layer over the editor, kept in view. The chip names the
 * tile's kind; then Kind of value on a Value, Options where the tile has any,
 * Add number on a Metric, Add column on a Table, Add below, Delete and More,
 * which opens the tile's menu; a part of the header has Rename, Hide from card
 * where it may hide, and More. It stays shown and takes the pointer over its
 * whole capsule for as long as its tile is selected, since the way to it
 * leads over the tile below; it hands a right-click to the tile under it,
 * hides while the tile's menu is open, and never takes focus from the tile,
 * so the tile's keys keep working.
 */
export function SelectionToolbar(props: SelectionToolbarProps): React.JSX.Element {
  const { layer, stage, block, revision, editable } = props;
  const ref = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLSpanElement>(null);
  const [placement, setPlacement] = useState<ToolbarPlacement>(HIDDEN_TOOLBAR);
  const keepInView = useKeepInView(ref, !placement.hidden, placement.above ? 'top' : 'bottom', `${placement.left},${placement.top}`);

  useLayoutEffect(() => {
    const update = (): void => setPlacement(measure(stage, layer, block.id, ref.current));
    update();
    const scroller = stage.closest(PANEL_SCROLL_SELECTOR);
    scroller?.addEventListener('scroll', update, { passive: true });
    // The panel's body too: a bar opening above the card (a conflict) moves the block without resizing the stage, the layer or the scroller.
    const body = stage.closest<HTMLElement>('.atlas-sb-pane-body');
    const stop = observeResize([stage, layer, ...(scroller ? [scroller] : []), ...(body ? [body] : [])], update);
    return () => {
      scroller?.removeEventListener('scroll', update);
      stop();
    };
  }, [stage, layer, block.id, revision]);

  const style: React.CSSProperties & ChromeStyle = {
    ...keepInView.style,
    '--atlas-te-toolbar-x': `${placement.left}px`,
    '--atlas-te-toolbar-y': `${placement.top}px`,
  };
  const Glyph = blockGlyph(block.type);
  const chipLabel = props.count > 1 ? `${props.count} blocks` : props.chipLabel;
  const single = props.count === 1;

  return createPortal(
    <div
      ref={ref}
      className={cn('atlas-te-toolbar', keepInView.capped && 'atlas-keep-in-view--capped')}
      role="toolbar"
      aria-label={`${chipLabel} toolbar`}
      style={style}
      {...{ [CHROME_ATTRIBUTE]: '' }}
      data-hidden={placement.hidden || props.menuOpen || undefined}
      data-above={placement.above || undefined}
      // Focus stays on the tile: its keys (Delete, arrows, Shift+F10) go on working after a click here.
      onMouseDown={(event) => event.preventDefault()}
      onContextMenu={(event) => {
        event.preventDefault();
        props.onMenuBelow({ x: event.clientX, y: event.clientY });
      }}
    >
      <span className="atlas-te-toolbar__type" aria-hidden="true">
        <Glyph />
        <span className="atlas-te-toolbar__type-name">{chipLabel}</span>
      </span>
      {single && props.valueKind && (
        <AnchoredButton icon={fieldTypeGlyph(props.valueKind.type)} label={t('templateEditor.valueKind', { kind: props.valueKind.label })} attribute="data-value-kind"
          onPress={props.valueKind.onOpen} />
      )}
      {single && props.onOptions && (
        <AnchoredButton icon={Settings2} label={t('templateEditor.options')} shortcut={shortcutText(['Shift'], '⏎')} attribute="data-options" onPress={props.onOptions} />
      )}
      {single && props.addPart && (
        <ToolButton icon={BetweenVerticalEnd} label={props.addPart.label} isActive={false} disabled={!editable || !props.addPart.canAdd}
          {...(!props.addPart.canAdd && { subtitle: props.addPart.full })}
          onClick={props.addPart.onAdd} />
      )}
      {props.headerPart ? (
        <>
          <ToolButton icon={Pencil} label={t('templateEditor.rename')} shortcut="⏎" isActive={false} disabled={!editable} onClick={props.headerPart.onRename} />
          {props.headerPart.hideable && <ToolButton icon={EyeOff} label={t('templateEditor.hideFromCard')} isActive={false} disabled={!editable} onClick={props.onToggleHidden} />}
        </>
      ) : (
        <>
          <ToolButton icon={Plus} label={t('templateEditor.addBelow')} shortcut="/" isActive={false} disabled={!editable} onClick={props.onAddBelow} />
          <ToolButton icon={Trash2} label={t('templateEditor.delete')} shortcut="Del" isActive={false} disabled={!editable} onClick={props.onDelete} />
        </>
      )}
      <span ref={more} className="atlas-te-toolbar__more">
        <ToolButton icon={Ellipsis} label={t('templateEditor.more')} shortcut={shortcutText(['Shift'], 'F10')} isActive={false} onClick={() => { if (more.current) props.onMore(more.current); }} />
      </span>
    </div>,
    layer,
  );
}
