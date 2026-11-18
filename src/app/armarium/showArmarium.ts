import type { App } from 'obsidian';

export const ARMARIUM_VIEW_TYPE = 'atlas-armarium';

/** Shows the Armarium in its tab: the one already open, else a new one. There is never a second. */
export async function showArmarium(app: App): Promise<void> {
  const existing = app.workspace.getLeavesOfType(ARMARIUM_VIEW_TYPE)[0];
  if (existing) {
    await app.workspace.revealLeaf(existing);
    app.workspace.setActiveLeaf(existing, { focus: true });
    return;
  }
  const leaf = app.workspace.getLeaf('tab');
  await leaf.setViewState({ type: ARMARIUM_VIEW_TYPE, active: true });
  await app.workspace.revealLeaf(leaf);
}
