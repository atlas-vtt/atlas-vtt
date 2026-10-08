import type { App } from 'obsidian';
import { bindRemoteOwner } from './remoteOwners';
import { RemoteViewHandle } from './RemoteViewHandle';
import { REMOTE_MAX_DICE } from './RemoteViewDice';
import { REMOTE_VIEW_TYPE } from './remoteViewType';

export interface RemoteViewOptions {
  title: string;
  icon?: string;
  /** Reveal this owner's remote view that is already open, rather than open another. */
  reuse?: boolean;
  /** The most dice the view's tray offers for one roll: a whole number from 1 to 100, default 100. */
  maxDice?: number;
}

/** The remote views open in each app, so `reuse` finds an owner's own. */
const openHandles = new WeakMap<App, Set<RemoteViewHandle>>();

/** The handles of `app` whose views are still open; closed ones are let go here. */
function handlesOf(app: App): Set<RemoteViewHandle> {
  let handles = openHandles.get(app);
  if (!handles) {
    handles = new Set();
    openHandles.set(app, handles);
  }
  for (const handle of handles) if (handle.isClosed) handles.delete(handle);
  return handles;
}

function checkedOptions(options: unknown): Required<RemoteViewOptions> {
  const given = (typeof options === 'object' && options !== null ? options : {}) as Partial<Record<keyof RemoteViewOptions, unknown>>;
  if (typeof given.title !== 'string' || given.title.trim() === '') throw new Error('[Atlas API] remoteViews.open: "title" must be a non-empty string.');
  if (given.icon !== undefined && typeof given.icon !== 'string') throw new Error('[Atlas API] remoteViews.open: "icon" must be a Lucide icon name.');
  if (given.reuse !== undefined && typeof given.reuse !== 'boolean') throw new Error('[Atlas API] remoteViews.open: "reuse" must be true or false.');
  const maxDice = given.maxDice ?? REMOTE_MAX_DICE;
  if (typeof maxDice !== 'number' || !Number.isInteger(maxDice) || maxDice < 1 || maxDice > REMOTE_MAX_DICE) {
    throw new Error(`[Atlas API] remoteViews.open: "maxDice" must be a whole number from 1 to ${REMOTE_MAX_DICE}.`);
  }
  return { title: given.title, icon: given.icon ?? 'map', reuse: given.reuse === true, maxDice };
}

/** Opens a remote map view owned by `owner` in a new tab, or, with `reuse`, reveals the one `owner` has open. */
export async function openRemoteView(app: App, owner: string, options: RemoteViewOptions): Promise<RemoteViewHandle> {
  const { title, icon, reuse, maxDice } = checkedOptions(options);
  const handles = handlesOf(app);
  const shown = reuse ? [...handles].find((handle) => handle.owner === owner) : undefined;
  // One still opening is waited for; one that failed to open is closed and does not count.
  if (shown && (await shown.ready) && !shown.isClosed) {
    await app.workspace.revealLeaf(shown.leaf);
    return shown;
  }
  const leaf = app.workspace.getLeaf('tab');
  const handle = new RemoteViewHandle(owner, title, icon, leaf, maxDice);
  handles.add(handle);
  bindRemoteOwner(leaf, handle);
  let made = false;
  try {
    await leaf.setViewState({ type: REMOTE_VIEW_TYPE, active: true });
    made = (leaf.view as { owner?: unknown } | null)?.owner === handle && (await handle.ready);
  } finally {
    // A view that did not open, or a workspace that refused it, leaves nothing listed or bound.
    if (!made) {
      handles.delete(handle);
      handle.close();
    }
  }
  if (!made) throw new Error('[Atlas API] remoteViews.open: the remote view could not open.');
  await app.workspace.revealLeaf(leaf);
  return handle;
}
