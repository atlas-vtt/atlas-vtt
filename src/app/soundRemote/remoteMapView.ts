import { View, type Workspace } from 'obsidian';
import type { AtlasView } from '../atlas-view';
import { ATLAS_VIEW_TYPE, isAtlasView } from '../atlasViewType';

/**
 * The map a remote acts on: the Atlas view the GM has in front (the active leaf), else the most
 * recently active one, else none. Only Atlas' own map views count, never the player window's.
 */
export function remoteMapView(workspace: Pick<Workspace, 'getActiveViewOfType' | 'getLeavesOfType'>): AtlasView | null {
  const active = workspace.getActiveViewOfType(View);
  if (isAtlasView(active)) return active;
  // ponytail: Atlas keeps one map leaf (`registerAtlasLeafSync`), so the open one is the most recently active; pick by activity if that changes
  return workspace.getLeavesOfType(ATLAS_VIEW_TYPE).map((leaf) => leaf.view).find(isAtlasView) ?? null;
}
