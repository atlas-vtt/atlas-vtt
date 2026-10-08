import { View, type Workspace, type WorkspaceLeaf } from 'obsidian';

type SetActiveLeaf = (leaf: WorkspaceLeaf, options?: { focus?: boolean }) => void;

type WorkspaceWithSetActiveLeaf = {
  setActiveLeaf?: SetActiveLeaf | undefined;
};

/** The leaf that currently owns workspace focus, whatever its view type. */
export function getActiveWorkspaceLeaf(workspace: Pick<Workspace, 'getActiveViewOfType'>): WorkspaceLeaf | null {
  return workspace.getActiveViewOfType(View)?.leaf ?? null;
}

function getWorkspaceLeafElement(leaf: WorkspaceLeaf | null | undefined): HTMLElement | null {
  const candidate = (
    (leaf as (WorkspaceLeaf & { view?: { containerEl?: HTMLElement | null } }) | null | undefined)?.view?.containerEl
    ?? (leaf as (WorkspaceLeaf & { containerEl?: HTMLElement | null }) | null | undefined)?.containerEl
    ?? null
  );

  if (!(candidate instanceof HTMLElement)) {
    return null;
  }

  return candidate.closest('.workspace-leaf');
}

export function isWorkspaceLeafSelected(leaf: WorkspaceLeaf | null | undefined): boolean {
  return getWorkspaceLeafElement(leaf)?.classList.contains('mod-active') ?? false;
}

/**
 * Marks the stand-in on a workspace and holds its suppression. A registered symbol, so a second
 * copy of the plugin (an update or a reload while a note loads) finds the first one's stand-in
 * and never takes it for Obsidian's method.
 */
const SUPPRESSION: unique symbol = Symbol.for('atlas-vtt.activeLeafSuppression');

interface ActiveLeafSuppression {
  /** How many callers still need `setActiveLeaf` switched off. */
  holders: number;
  /** The method the workspace had of its own; null when it inherited it, as Obsidian's does. */
  replaced: SetActiveLeaf | null;
}

type StandIn = SetActiveLeaf & { [SUPPRESSION]?: ActiveLeafSuppression };

function suppressionOf(method: SetActiveLeaf | undefined): ActiveLeafSuppression | undefined {
  return (method as StandIn | undefined)?.[SUPPRESSION];
}

function inheritedSetActiveLeaf(workspace: WorkspaceWithSetActiveLeaf): SetActiveLeaf | undefined {
  return (Object.getPrototypeOf(workspace) as WorkspaceWithSetActiveLeaf | null)?.setActiveLeaf;
}

/**
 * Puts a stand-in on the workspace that ignores activations while it has holders and passes
 * them on once it has none, so it is never a dead end where something else keeps calling it
 * (another plugin's patch made during the suppression).
 */
function beginSuppression(workspace: WorkspaceWithSetActiveLeaf, current: SetActiveLeaf): ActiveLeafSuppression {
  const suppression: ActiveLeafSuppression = {
    holders: 0,
    replaced: Object.hasOwn(workspace, 'setActiveLeaf') ? current : null,
  };
  const standIn: StandIn = (...args) => {
    if (suppression.holders > 0) {
      return;
    }

    (suppression.replaced ?? inheritedSetActiveLeaf(workspace))?.apply(workspace, args);
  };
  standIn[SUPPRESSION] = suppression;
  workspace.setActiveLeaf = standIn;
  return suppression;
}

/**
 * Makes `workspace.setActiveLeaf` do nothing until the returned function is called.
 *
 * Suppressions overlap (two note previews loading at once) and end in any order, so they share
 * one stand-in, which goes with the last of them. A suppression that kept what it found would
 * keep an earlier one's stand-in and put that back for good: Obsidian then never activates a
 * tab again, and no map is ever in the active tab.
 *
 * The workspace is left as it was found: an inherited method is inherited again, so a later
 * patch of the prototype still takes effect. What something else put on the workspace during
 * the suppression stays.
 */
export function suppressActiveLeaf(workspace: WorkspaceWithSetActiveLeaf): () => void {
  const current = workspace.setActiveLeaf;
  if (!current) {
    return () => {};
  }

  const suppression = suppressionOf(current) ?? beginSuppression(workspace, current);
  suppression.holders += 1;
  let released = false;
  return () => {
    if (released) {
      return;
    }

    released = true;
    suppression.holders -= 1;
    if (suppression.holders > 0 || suppressionOf(workspace.setActiveLeaf) !== suppression) {
      return;
    }

    if (suppression.replaced) {
      workspace.setActiveLeaf = suppression.replaced;
    } else {
      delete workspace.setActiveLeaf;
    }
  };
}

export function restorePreservedLeaf(
  workspace: WorkspaceWithSetActiveLeaf,
  leafToPreserve: WorkspaceLeaf | null | undefined,
): void {
  if (!leafToPreserve || typeof workspace.setActiveLeaf !== 'function') {
    return;
  }

  if (!isWorkspaceLeafSelected(leafToPreserve)) {
    return;
  }

  workspace.setActiveLeaf(leafToPreserve, { focus: false });
}
