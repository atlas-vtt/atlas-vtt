import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { isGridTile, kindName, selectableFor } from '../../model/templateGrid';
import { headerPartOf, templateBlock } from '../../model/templateHeader';
import type { TemplateBlock } from '../../model/templateTypes';
import { useBlockHandleDrag } from '../dnd/useDragSources';
import { LIVE_TABLE_ATTRIBUTE } from '../table/EditableTable';
import { focusToReturn } from '../interaction/chrome';
import { GutterHandle } from '../interaction/GutterHandle';
import { hoverStoreOf, type HoverTarget } from '../interaction/hoverStore';
import type { SurfaceAction } from '../interaction/surfaceActions';
import { useSurfaceMenu } from '../interaction/SurfaceMenuProvider';
import { targetAt, useSurfaceHover } from '../interaction/useSurfaceHover';
import { clipOf } from './blockClipboard';
import { blockFrame } from './editorChrome';
import { boundFieldOf } from './inspector/blockEdits';
import { blockMenu } from './menus/blockMenu';
import { emptyCardMenu, newerTemplateMenu } from './menus/otherMenus';
import { valueKindMenu } from './menus/valueKindMenu';
import { optionsKindOf } from './options/optionsKind';
import { TileOptions } from './options/TileOptions';
import { valueKindLabel, valueKindOf } from './options/valueKinds';
import { primaryOf, type BlockSelection } from './selection';
import type { SessionSnapshot } from './sessionTypes';
import { addPart, removePart, tilePartsOf } from './tileParts';
import { SelectionToolbar } from './toolbar/SelectionToolbar';
import type { EditorState } from './useEditorState';
import { runBlockCommand, type KeyboardTarget } from './useTemplateKeyboard';
import { t } from '../../../i18n';
import '../interaction/interaction.scss';

export interface TeSurfaceChromeProps {
  layer: HTMLElement;
  stage: HTMLElement;
  snapshot: SessionSnapshot;
  state: EditorState;
  target: KeyboardTarget;
  /** Shift+F10 or the Menu key asked for the selection's menu. */
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  /** The selected tile's Options while they are open, with the input they open on. */
  options: { focusKey?: string | undefined } | null;
  onOptions: (focusKey?: string) => void;
  onOptionsClose: () => void;
}

/** Where a menu opens: at a right-click's point, or hanging from an element. */
type Place = { at: { x: number; y: number } } | { from: Element };

/** Text being typed keeps the browser's own menu; a Table opens its own (`EditableTable`). */
const NATIVE_MENU = `input, textarea, [contenteditable="true"], [${LIVE_TABLE_ATTRIBUTE}]`;

/** What the toolbar's chip calls a block: a part of the header by its name ("Challenge", "Token art"), else its kind. */
function chipLabelOf(snapshot: SessionSnapshot, block: TemplateBlock): string {
  return headerPartOf(snapshot.template, block.id)?.label ?? kindName(block);
}

/**
 * The template editor's chrome over the card (spec §3–§5): the gutter handle
 * of the pointed-at tile (drag it by the handle only; click for its menu),
 * the toolbar below the selected tile with its Options, and one menu per tile
 * by the handle, a right-click (which selects first), the toolbar's More and
 * Shift+F10. The header's parts take a menu, never a drag.
 */
export function TeSurfaceChrome(props: TeSurfaceChromeProps): React.JSX.Element {
  const { layer, stage, snapshot, state, target, menuOpen, onMenuOpenChange, options, onOptions, onOptionsClose } = props;
  const store = useMemo(() => hoverStoreOf(stage), [stage]);
  const stageRef = useMemo(() => ({ current: stage }), [stage]);
  const editable = !snapshot.readOnly;
  const menu = useSurfaceMenu();
  const drag = useBlockHandleDrag(stage, editable);
  const latest = useRef({ snapshot, state, target, onOptions });
  latest.current = { snapshot, state, target, onOptions };
  useSurfaceHover(stageRef, store, { items: false, enabled: true, ignore: '.atlas-te-chrome' });

  const copy = useCallback((text: string): void => { void stage.win.navigator.clipboard?.writeText(text); }, [stage]);

  /** The tile's menu acting on the selection that holds it, else on the tile alone, which it selects first (§4.1). */
  const menuOf = useCallback((blockId: string): SurfaceAction[] => {
    const { snapshot: now, state: editor, target: keys } = latest.current;
    if (now.readOnlyReason === 'newer') return newerTemplateMenu();
    const selection: BlockSelection = editor.selection.includes(blockId) ? editor.selection : [blockId];
    if (selection !== editor.selection) editor.select(selection, false);
    const acting: KeyboardTarget = { ...keys, selection };
    return blockMenu({
      template: now.template, selection, blockId, editable: !now.readOnly, canPaste: clipOf(keys.clipOwner) !== null,
      run: (command) => runBlockCommand(acting, command),
      openInsert: (place) => editor.openInsert(place),
      openOptions: optionsKindOf(now.template, blockId) ? () => latest.current.onOptions() : undefined,
      parts: {
        add: () => editor.settle(addPart(keys.session, blockId), true),
        rename: (index) => editor.editLabel(blockId, index),
        remove: (index) => editor.settle(removePart(keys.session, blockId, index), true),
      },
      copyText: copy,
    });
  }, [copy]);

  const [menuShown, setMenuShown] = useState(false);
  const open = useCallback((rows: SurfaceAction[], place: Place, mark: HTMLElement | null, returnFocus: HTMLElement | null): void => {
    if (!menu || rows.length === 0) return;
    store.menuOpenedOn(mark);
    setMenuShown(true);
    const settings = { returnFocus, onClose: () => { store.menuClosed(); setMenuShown(false); } };
    if ('at' in place) menu.openAt(rows, place.at, settings);
    else menu.openFrom(rows, place.from, settings);
  }, [menu, store]);

  const emptyMenu = useCallback((): SurfaceAction[] => {
    const { state: editor, target: keys, snapshot: now } = latest.current;
    return emptyCardMenu({
      editable: !now.readOnly,
      canPaste: clipOf(keys.clipOwner) !== null,
      addAtEnd: () => editor.openInsert({ after: null }),
      pasteAtEnd: () => runBlockCommand({ ...keys, selection: [] }, 'paste'),
    });
  }, []);

  // A right-click on the card: its tile's menu (selected first), or the card's own on empty space.
  useEffect(() => {
    const onContextMenu = (event: MouseEvent): void => {
      const node = event.target as Partial<Element> | null;
      if (typeof node?.closest === 'function' && node.closest(NATIVE_MENU)) return;
      event.preventDefault();
      const found = targetAt(stage, event.target, false);
      const at = { x: event.clientX, y: event.clientY };
      const id = found ? selectableFor(latest.current.snapshot.template, found.blockId) : null;
      if (found && id) open(menuOf(id), { at }, found.element, null);
      else open(emptyMenu(), { at }, null, null);
    };
    stage.addEventListener('contextmenu', onContextMenu);
    return () => stage.removeEventListener('contextmenu', onContextMenu);
  }, [stage, open, menuOf, emptyMenu]);

  // Shift+F10 and the Menu key: the primary tile's menu, hanging from it, focus back to it after.
  useEffect(() => {
    if (!menuOpen) return;
    onMenuOpenChange(false);
    const primary = primaryOf(latest.current.state.selection);
    const frame = primary ? blockFrame(stage, primary) : null;
    if (primary && frame) open(menuOf(primary), { from: frame }, frame, frame);
  }, [menuOpen, onMenuOpenChange, open, menuOf, stage]);

  // The toolbar covers the line below its tile; a right-click on it is meant for that line.
  const menuBelow = (point: { x: number; y: number }): void => {
    const under = stage.ownerDocument.elementsFromPoint(point.x, point.y).find((element) => stage.contains(element));
    const found = under ? targetAt(stage, under, false) : null;
    if (found) open(menuOf(found.blockId), { at: point }, found.element, null);
    else open(emptyMenu(), { at: point }, null, null);
  };

  const primary = primaryOf(state.selection);
  const block = primary ? templateBlock(snapshot.template, primary) ?? undefined : undefined;
  const part = primary ? headerPartOf(snapshot.template, primary) : null;
  const frameOf = (id: string): HTMLElement | null => blockFrame(stage, id);
  const single = block && !part && state.selection.length === 1 ? block : undefined;
  const field = single ? boundFieldOf(snapshot.template, single) : undefined;
  const kind = single ? valueKindOf(single, field) : null;
  const hasOptions = single ? optionsKindOf(snapshot.template, single.id) !== null : false;
  const parts = single ? tilePartsOf(snapshot.template, single.id) : null;
  // Closing by a key or the toolbar gives focus back to the tile; a press elsewhere takes it where it lands.
  const closeOptions = (returnFocus: boolean): void => {
    onOptionsClose();
    if (returnFocus) state.select(state.selection);
  };
  const tileAt = (hovered: HoverTarget): boolean => isGridTile(snapshot.template.layout, hovered.blockId);
  // The handle of a block inside a compound tile or the header's groups acts on what the grid selects there.
  const actsOn = (hovered: HoverTarget): string => selectableFor(snapshot.template, hovered.blockId) ?? hovered.blockId;

  return (
    <>
      <GutterHandle
        store={store}
        layer={layer}
        glyphOf={(hovered) => (snapshot.readOnlyReason === 'newer' || !tileAt(hovered) ? 'lock' : 'grip')}
        labelOf={(hovered) => {
          if (snapshot.readOnlyReason === 'newer') return t('templateEditor.newerAtlas');
          return tileAt(hovered) ? t('templateEditor.hint.dragOrClick') : t('templateEditor.hint.click');
        }}
        onMenu={(hovered: HoverTarget, handle) => open(menuOf(actsOn(hovered)), { from: handle }, hovered.element, focusToReturn(handle))}
        onPress={(hovered, event) => { if (editable && tileAt(hovered)) drag(hovered.blockId, event); }}
      />
      {primary && block && state.editing === null && state.naming === null && (
        <SelectionToolbar
          layer={layer}
          stage={stage}
          block={block}
          count={state.selection.length}
          editable={editable}
          revision={snapshot.template}
          chipLabel={chipLabelOf(snapshot, block)}
          headerPart={part ? { hideable: part.hideable, onRename: () => runBlockCommand(target, 'edit-label') } : undefined}
          onToggleHidden={() => runBlockCommand(target, 'toggle-hidden')}
          valueKind={single && field && kind ? {
            label: valueKindLabel(kind),
            type: field.type,
            onOpen: (button) => open(valueKindMenu({ session: target.session, block: single, field, editable, openOptions: onOptions }),
              { from: button }, frameOf(single.id), frameOf(single.id)),
          } : undefined}
          onOptions={hasOptions ? () => {
            if (options) closeOptions(true);
            else onOptions();
          } : undefined}
          addPart={single && parts ? {
            label: t('templateEditor.addNumber'),
            canAdd: parts.canAdd,
            full: parts.full,
            onAdd: () => state.settle(addPart(target.session, single.id), true),
          } : undefined}
          onAddBelow={() => state.openInsert({ after: primary })}
          onDelete={() => runBlockCommand(target, 'delete')}
          onMore={(button) => open(menuOf(primary), { from: button }, frameOf(primary), frameOf(primary))}
          menuOpen={menuShown}
          onMenuBelow={menuBelow}
        />
      )}
      <AnimatePresence>
        {single && options && (
          <TileOptions
            key={single.id}
            layer={layer}
            stage={stage}
            blockId={single.id}
            revision={snapshot.template}
            focusKey={options?.focusKey}
            onClose={closeOptions}
          />
        )}
      </AnimatePresence>
    </>
  );
}
