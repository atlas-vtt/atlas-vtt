import React from 'react';
import { Redo2, Undo2 } from 'lucide-react';
import { ToolButton } from '../../../../packages/components/primitives/ToolButton';
import { useKindDrag } from '../../dnd/useDragSources';
import { blockGlyph } from '../editorGlyphs';
import { insertItems, itemKey, type InsertItem } from '../insertItems';
import { UNDOES_PLACEMENT } from '../naming/NamePopover';
import { shortcutText } from '../shortcutText';
import './dock.scss';

export interface EditorDockProps {
  /** Unset while the template takes no edits. */
  onAdd?: ((item: InsertItem) => void) | undefined;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

/** One kind: a click adds it after the selected row, a drag puts it where the line shows. */
function AddButton({ item, onAdd }: { item: InsertItem; onAdd: EditorDockProps['onAdd'] }): React.JSX.Element {
  const drag = useKindDrag(item, !onAdd);
  return (
    <span ref={drag.ref} className="atlas-te-dock__add" data-item={itemKey(item)} onPointerDown={drag.onPointerDown}>
      <ToolButton icon={blockGlyph(item.type)} label={`Add ${item.label.toLowerCase()}`} subtitle={item.example} isActive={false} disabled={!onAdd} tooltipSide="left"
        onClick={() => onAdd?.(item)} />
    </span>
  );
}

/**
 * The template editor's dock: a vertical capsule in the note column, beside the
 * line between the note and the card and halfway down it,
 * edge with the seven kinds a statblock is built from, each added by a click
 * or dragged onto the card, and the session's undo and redo. While a tile
 * just placed asks for its name, Undo takes that tile away.
 */
export function EditorDock({ onAdd, canUndo, canRedo, onUndo, onRedo }: EditorDockProps): React.JSX.Element {
  return (
    <div className="atlas-te-dock" role="toolbar" aria-orientation="vertical" aria-label="Add to the template" data-te-region="dock">
      {insertItems().map((item) => <AddButton key={itemKey(item)} item={item} onAdd={onAdd} />)}
      <span className="atlas-te-dock__divider" aria-hidden="true" />
      <span className="atlas-te-dock__history" {...{ [UNDOES_PLACEMENT]: '' }}>
        <ToolButton icon={Undo2} label="Undo" shortcut={shortcutText(['Mod'], 'Z')} isActive={false} disabled={!canUndo} onClick={onUndo} tooltipSide="left" />
      </span>
      <ToolButton icon={Redo2} label="Redo" shortcut={shortcutText(['Mod', 'Shift'], 'Z')} isActive={false} disabled={!canRedo} onClick={onRedo} tooltipSide="left" />
    </div>
  );
}
