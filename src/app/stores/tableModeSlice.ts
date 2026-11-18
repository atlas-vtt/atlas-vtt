/**
 * Table mode: the map view as the players' picture, for a tablet laid on the table. The view shows
 * what session view shows (`isGMView` off), with the move tool and nothing selected, and the GM's
 * chrome is hidden (`tableMode/TableMode.ts`). Never saved, and no undo step.
 */

import type { ViewState } from '../types/viewState';

/** What the GM comes back to when Table mode ends. */
export interface TableModeReturn {
  activeTool: ViewState['activeTool'];
  isGMView: boolean;
}

export interface TableModeSlice {
  /** Set while the view is in Table mode: what the GM's view was before. */
  tableMode: TableModeReturn | null;
  /** Shows the players' picture; nothing while the asset manager covers the map. */
  enterTableMode: () => void;
  /** Back to the GM's view as it was: its tool and its GM or session view. */
  leaveTableMode: () => void;
}

type TableDraft = Pick<TableModeSlice, 'tableMode'> & Pick<
  ViewState,
  | 'activeTool'
  | 'isGMView'
  | 'selectedIds'
  | 'selectMore'
  | 'heldTokens'
  | 'isAssetManagerOpen'
  | 'isCommandPaletteOpen'
  | 'commandPalettePage'
  | 'isDiceTrayOpen'
  | 'isToolbarEditing'
  | 'isHotkeyHelpOpen'
  | 'isGridSettingsOpen'
  | 'isGridAlignmentOpen'
>;

type ImmerSet = (fn: (draft: TableDraft) => void) => void;

export function createTableModeActions(set: ImmerSet): Omit<TableModeSlice, 'tableMode'> {
  return {
    enterTableMode: () => set((draft) => {
      if (draft.tableMode || draft.isAssetManagerOpen) return;
      draft.tableMode = { activeTool: draft.activeTool, isGMView: draft.isGMView };
      // Session view is the players' picture; a tool, a selection or an open editor would draw the GM's marks into it
      draft.isGMView = false;
      draft.activeTool = 'move';
      draft.selectedIds = [];
      draft.selectMore = false;
      draft.heldTokens = {};
      draft.isCommandPaletteOpen = false;
      draft.commandPalettePage = null;
      draft.isDiceTrayOpen = false;
      draft.isToolbarEditing = false;
      draft.isHotkeyHelpOpen = false;
      draft.isGridSettingsOpen = false;
      draft.isGridAlignmentOpen = false;
    }),
    leaveTableMode: () => set((draft) => {
      const back = draft.tableMode;
      if (!back) return;
      draft.tableMode = null;
      draft.activeTool = back.activeTool;
      draft.isGMView = back.isGMView;
    }),
  };
}
