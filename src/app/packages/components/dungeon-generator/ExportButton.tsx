import React, { useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '../primitives/button';
import { LabelTooltip } from '../primitives/tooltip';
import { useOptionalContextMenu, type ContextMenuEntry } from '../../../react/root/ContextMenuContext';
import { t } from '../../../i18n';
import { CellSizeDialog } from './CellSizeDialog';
import type { DungeonExportKind } from './dungeonExports';
import type { GeneratorActions } from './useGeneratorActions';

interface ExportButtonProps {
  actions: GeneratorActions;
  /** Whether a dungeon is there to export. */
  ready: boolean;
  className?: string;
}

/** Saves the floor shown as a map PNG or SVG, or the whole dungeon as JSON, from a menu. */
export function ExportButton({ actions, ready, className }: ExportButtonProps): React.JSX.Element {
  const menu = useOptionalContextMenu();
  const button = useRef<HTMLButtonElement>(null);
  // The map PNG's cell size is being asked.
  const [askingCell, setAskingCell] = useState(false);
  const save = (kind: DungeonExportKind): void => { void actions.exportAs(kind); };

  const open = (): void => {
    const target = button.current;
    if (!menu || !target) return;
    const rect = target.getBoundingClientRect();
    const entries: ContextMenuEntry[] = [
      { type: 'item', label: t('dungeon.export.map'), icon: 'map', onClick: () => setAskingCell(true) },
      { type: 'item', label: t('dungeon.export.svg'), icon: 'file-code', onClick: () => save('svg') },
      { type: 'item', label: t('dungeon.export.json'), icon: 'braces', onClick: () => save('json') },
    ];
    menu.open(entries, { x: rect.left, y: rect.bottom + 4 }, { returnFocus: target });
  };

  return (
    <>
      <LabelTooltip label={t('dungeon.export')}>
        <Button ref={button} variant="ghost" size="icon" className={className} disabled={!ready || actions.creating} onClick={open} aria-haspopup="menu">
          <Download />
        </Button>
      </LabelTooltip>
      {askingCell && actions.maxCell !== null && (
        <CellSizeDialog
          max={actions.maxCell}
          onCancel={() => setAskingCell(false)}
          onSave={(options) => { setAskingCell(false); void actions.exportAs('map', options); }}
        />
      )}
    </>
  );
}
