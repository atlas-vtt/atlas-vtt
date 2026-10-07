import { createStore } from 'zustand/vanilla';
import type { PanelSpec } from '../../api/types/ui';

/** One panel open in one view. */
export interface OpenPanel { viewId: string; panel: PanelSpec }

interface PanelState { open: ReadonlyArray<OpenPanel> }

/**
 * Which extension panels are open in which view. Not saved and not undo-tracked, like the other panels' open flags;
 * keyed by view and panel (the registered object), never by the panel's bare id, which two extensions may share.
 */
export const panelState = createStore<PanelState>(() => ({ open: [] }));

const same = (entry: OpenPanel, panel: PanelSpec, viewId: string): boolean => entry.panel === panel && entry.viewId === viewId;

export function isPanelOpen(panel: PanelSpec, viewId: string): boolean {
  return panelState.getState().open.some((entry) => same(entry, panel, viewId));
}

export function openPanel(panel: PanelSpec, viewId: string): void {
  if (isPanelOpen(panel, viewId)) return;
  panelState.setState((state) => ({ open: [...state.open, { viewId, panel }] }));
}

export function closePanel(panel: PanelSpec, viewId: string): void {
  if (!isPanelOpen(panel, viewId)) return;
  panelState.setState((state) => ({ open: state.open.filter((entry) => !same(entry, panel, viewId)) }));
}

/** The panel is gone (disposed, or its extension unloaded): it closes in every view. */
export function closePanelEverywhere(panel: PanelSpec): void {
  if (!panelState.getState().open.some((entry) => entry.panel === panel)) return;
  panelState.setState((state) => ({ open: state.open.filter((entry) => entry.panel !== panel) }));
}

/** The view closed: nothing stays open in it. */
export function closeViewPanels(viewId: string): void {
  if (!panelState.getState().open.some((entry) => entry.viewId === viewId)) return;
  panelState.setState((state) => ({ open: state.open.filter((entry) => entry.viewId !== viewId) }));
}
