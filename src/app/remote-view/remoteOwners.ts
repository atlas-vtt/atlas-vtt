import type { WorkspaceLeaf } from 'obsidian';

/** What a remote map view asks of the handle that owns it. */
export interface RemoteViewOwner {
  readonly title: string;
  readonly icon: string;
  /** The view opened and its renderer is ready. */
  opened(view: unknown): void;
  /** The view closes, whoever closed it. */
  closed(): void;
  /** The view's container changed size. */
  resized(): void;
}

/** Owners bound to a leaf before the leaf makes its remote view; kept apart from the view so the API loads no view code. */
const pendingOwners = new WeakMap<WorkspaceLeaf, RemoteViewOwner>();

/** `owner` takes the remote view `leaf` makes next. */
export function bindRemoteOwner(leaf: WorkspaceLeaf, owner: RemoteViewOwner): void {
  pendingOwners.set(leaf, owner);
}

/** The owner bound to `leaf`, once: the view that takes it. */
export function takeRemoteOwner(leaf: WorkspaceLeaf): RemoteViewOwner | null {
  const owner = pendingOwners.get(leaf) ?? null;
  pendingOwners.delete(leaf);
  return owner;
}
