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

/** A workspace whose `setActiveLeaf` is switched off: the method to put back, and how many callers still need it off. */
interface ActiveLeafSuppression {
  original: SetActiveLeaf;
  holders: number;
}

const suppressions = new WeakMap<WorkspaceWithSetActiveLeaf, ActiveLeafSuppression>();

function beginSuppression(workspace: WorkspaceWithSetActiveLeaf): ActiveLeafSuppression | null {
  const original = workspace.setActiveLeaf?.bind(workspace);
  if (!original) {
    return null;
  }

  const suppression: ActiveLeafSuppression = { original, holders: 0 };
  suppressions.set(workspace, suppression);
  workspace.setActiveLeaf = (() => {});
  return suppression;
}

/**
 * Makes `workspace.setActiveLeaf` do nothing until the returned function is called.
 *
 * Suppressions overlap (two note previews loading at once) and end in any order, so they
 * share the one original method, which comes back with the last of them. A suppression that
 * kept what it found would keep an earlier one's no-op and put that back for good: Obsidian
 * then never activates a tab again, and no map is ever in the active tab.
 */
export function suppressActiveLeaf(workspace: WorkspaceWithSetActiveLeaf): () => void {
  const suppression = suppressions.get(workspace) ?? beginSuppression(workspace);
  if (!suppression) {
    return () => {};
  }

  suppression.holders += 1;
  let released = false;
  return () => {
    if (released) {
      return;
    }

    released = true;
    suppression.holders -= 1;
    if (suppression.holders > 0) {
      return;
    }

    suppressions.delete(workspace);
    workspace.setActiveLeaf = suppression.original;
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
