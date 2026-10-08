import React from 'react';
import { ToolButton } from '../packages/components/primitives/ToolButton';
import type { ResponsiveToolbarItem } from '../packages/components/toolbar/toolbarTypes';
import type { ToolbarItem, ToolbarItemContext, ViewContext } from '../../api/types/ui';
import { obsidianIconComponent } from '../react/components/ObsidianIcon';
import { safely, type SlotEntry } from './SlotRegistry';
import { toolbarSlot } from './slots';
import { useSlot } from './useSlot';
import { t } from '../i18n';
import { viewContextOf, type ViewContextState } from './viewContext';
import { remoteOwnerOf } from '../remote-view/remoteControls';

/** An item's place among other extensions' items when it names none: higher sits further left. */
export const DEFAULT_EXTENSION_PRIORITY = 50;

function ToolBadge({ badge, label }: { badge: string | number | true; label: string }): React.ReactElement {
  if (badge === true) return <span className="atlas-ext-tool__dot" aria-hidden="true" />;
  return (
    <span className="atlas-ext-tool__badge">
      <span aria-hidden="true">{badge}</span>
      <span className="atlas-ext-tool__hidden-text">{t('extensions.badge', { label, badge })}</span>
    </span>
  );
}

/** The longest text badge a toolbar button shows; a longer one is cut with an ellipsis. */
export const TOOLBAR_BADGE_MAX = 8;

/** A badge worth drawing: `null`, an empty string and anything else an extension returns by mistake draw nothing. */
function drawableBadge(value: unknown): string | number | true | null {
  if (value === true) return true;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || value === '') return null;
  // Characters, not UTF-16 units, so a cut never splits an emoji.
  const characters = [...value];
  return characters.length > TOOLBAR_BADGE_MAX ? `${characters.slice(0, TOOLBAR_BADGE_MAX - 1).join('')}…` : value;
}

/** The callbacks of each item that threw already: each failure is logged once, not on every render. */
const failed = new WeakMap<ToolbarItem, Set<string>>();

/** Runs one of an item's callbacks guarded; a throw answers `fallback` and is logged once per item and callback. */
function guarded<R>(owner: string, item: ToolbarItem, callback: string, read: () => R, fallback: R): R {
  try {
    return read();
  } catch (error) {
    const seen = failed.get(item) ?? new Set<string>();
    failed.set(item, seen);
    if (!seen.has(callback)) {
      seen.add(callback);
      console.error(`[Atlas API] ${owner}: toolbar item "${item.id}" ${callback} failed:`, error);
    }
    return fallback;
  }
}

/**
 * One registered item as a toolbar control: a `ToolButton` with a dot or count on it, a "More tools" entry, and a pin while it
 * is active (a control whose panel hangs from it stays in the bar). Every callback of the extension runs guarded.
 */
export function extensionToolbarItem({ owner, item }: SlotEntry<ToolbarItem>, ctx: ViewContext): ResponsiveToolbarItem {
  const slot = `toolbar item "${item.id}"`;
  const active = guarded(owner, item, 'isActive', () => item.isActive?.(ctx) === true, false);
  const badge = guarded(owner, item, 'badge', () => drawableBadge(item.badge?.(ctx)), null);
  const select = (): void => safely(owner, `${slot} onClick`, () => { item.onClick(ctx); }, undefined);
  const Icon = obsidianIconComponent(item.icon);
  return {
    // Namespaced: ids are React keys and the toolbar's fit keys, and must not meet Atlas's own ('move', 'dice', ...).
    id: `ext:${owner}:${item.id}`,
    kind: 'button',
    pinned: active,
    active,
    element: (
      <div className="atlas-ext-tool">
        <ToolButton icon={Icon} label={item.label} isActive={active} onClick={select} {...(item.shortcut ? { shortcut: item.shortcut } : {})} />
        {badge !== null && <ToolBadge badge={badge} label={item.label} />}
      </div>
    ),
    menuEntry: { icon: Icon, label: item.label, isActive: active, onSelect: select, ...(item.shortcut ? { shortcut: item.shortcut } : {}) },
  };
}

/** Whether `entry` shows in the view of `ctx`: only `isVisible` answering true hides nothing; a throw hides it. */
function isVisibleIn({ owner, item }: SlotEntry<ToolbarItem>, ctx: ViewContext): boolean {
  if (!item.isVisible) return true;
  const visibility: ToolbarItemContext = Object.freeze({ ...ctx, ownRemote: ctx.kind === 'remote' && remoteOwnerOf(ctx.viewId) === owner });
  return guarded(owner, item, 'isVisible', () => item.isVisible?.(visibility) === true, false);
}

function priorityOf({ item }: SlotEntry<ToolbarItem>): number {
  return Number.isFinite(item.priority) ? item.priority as number : DEFAULT_EXTENSION_PRIORITY;
}

/**
 * Atlas's controls with the extensions' items placed right after the dice (or before the Command palette, or at the
 * end, when the bar has no dice). The bar sends controls to "More tools" from its right end, so the items that follow
 * the extensions' leave first, and among the extensions' a lower priority sits further right and leaves first.
 */
export function withExtensionToolbarItems(
  atlasItems: readonly ResponsiveToolbarItem[],
  extensionItems: readonly ResponsiveToolbarItem[],
): ResponsiveToolbarItem[] {
  if (extensionItems.length === 0) return [...atlasItems];
  const dice = atlasItems.findIndex((item) => item.id === 'dice');
  const palette = atlasItems.findIndex((item) => item.id === 'palette');
  const at = dice >= 0 ? dice + 1 : palette >= 0 ? palette : atlasItems.length;
  return [...atlasItems.slice(0, at), ...extensionItems, ...atlasItems.slice(at)];
}

/**
 * The registered toolbar items that belong in this view and are visible there, to be placed among Atlas's own. None in a player
 * view, except a remote view's own. A hidden item never reaches the bar, so it takes no room and is not in "More tools".
 */
export function useExtensionToolbarItems(
  viewId: string | undefined,
  store: { getState(): ViewContextState },
  isActualPlayerView: boolean,
): ResponsiveToolbarItem[] {
  const entries = useSlot(toolbarSlot);
  if (!viewId || isActualPlayerView) return [];
  const ctx = viewContextOf({ viewId }, store);
  if (ctx.isPlayerView && ctx.kind !== 'remote') return [];
  return byPriority(entries.filter((entry) => (entry.item.views ?? ['map']).includes(ctx.kind) && isVisibleIn(entry, ctx)))
    .map((entry) => extensionToolbarItem(entry, ctx));
}

/** `entries` with the highest priority first (`DEFAULT_EXTENSION_PRIORITY` when unset); registration order breaks ties. */
export function byPriority(entries: ReadonlyArray<SlotEntry<ToolbarItem>>): Array<SlotEntry<ToolbarItem>> {
  return entries
    .map((entry, index) => ({ entry, index, priority: priorityOf(entry) }))
    .sort((a, b) => b.priority - a.priority || a.index - b.index)
    .map(({ entry }) => entry);
}
