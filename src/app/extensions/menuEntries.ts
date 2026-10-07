import type { ContextMenuEntry } from '../react/root/ContextMenuContext';
import type { MenuItem, SceneTabMenuContext, SceneTabMenuSection, TokenMenuContext, ViewContext } from '../../api/types/ui';
import type { TokenEntity } from '../types';
import { safely, type SlotEntry, type SlotRegistry } from './SlotRegistry';
import { sceneTabMenuSlot, tokenMenuSlot } from './slots';

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function';
}

/** The longest label a menu row shows; a longer one is cut with an ellipsis. */
export const MENU_LABEL_MAX = 64;

/** An extension's menu item as Atlas keeps it: each field read once, inside a guard. */
interface ReadItem {
  label: string;
  icon: string | null;
  submenu: readonly unknown[] | null;
  checked: boolean | undefined;
  disabled: boolean | undefined;
  keepOpen: boolean;
  onClick: (() => unknown) | null;
  source: unknown;
}

/** Characters, not UTF-16 units, so a cut never splits an emoji. */
function capped(text: string): string {
  const characters = [...text];
  return characters.length > MENU_LABEL_MAX ? `${characters.slice(0, MENU_LABEL_MAX - 1).join('').trimEnd()}…` : text;
}

/** One item read once into a plain object; null for what is no item (no label), or whose reads throw (logged). */
function readItem(owner: string, raw: unknown): ReadItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  return safely(owner, 'menu item', () => {
    const { label, icon, submenu, checked, disabled, keepOpen, onClick } = raw as Record<keyof MenuItem, unknown>;
    if (typeof label !== 'string' || label === '') return null;
    return {
      label: capped(label),
      icon: typeof icon === 'string' && icon !== '' ? icon : null,
      submenu: submenu === undefined ? null : Array.isArray(submenu) ? [...submenu as unknown[]] : [],
      checked: checked === undefined ? undefined : checked === true,
      disabled: disabled === undefined ? undefined : disabled === true,
      keepOpen: keepOpen === true,
      onClick: typeof onClick === 'function' ? onClick as () => unknown : null,
      source: raw,
    };
  }, null);
}

/** Runs an extension's click; a throw or a rejected promise is logged, never raised into the menu. */
function clickOf(owner: string, item: ReadItem): () => unknown {
  const slot = `menu item "${item.label}"`;
  return () => {
    try {
      const result: unknown = item.onClick?.call(item.source);
      if (isThenable(result)) {
        return Promise.resolve(result).then(() => undefined, (error: unknown) => { console.error(`[Atlas API] ${owner}: ${slot} failed:`, error); });
      }
    } catch (error) {
      console.error(`[Atlas API] ${owner}: ${slot} failed:`, error);
    }
    return undefined;
  };
}

/** How an open submenu reads its items again: `read` runs the provider anew, `subscribe` says when to. */
export interface LiveMenu {
  read: () => readonly MenuItem[];
  subscribe: (onChange: () => void) => () => void;
}

// An extension may hand over anything: read it as a list of maybe-items.
function itemsOf(items: unknown): ReadonlyArray<MenuItem | null | undefined> {
  return Array.isArray(items) ? (items as ReadonlyArray<MenuItem | null | undefined>) : [];
}

/** The items of the first submenu labelled `label` among `items`; none when the provider no longer gives it. */
function submenuOf(owner: string, items: readonly MenuItem[], label: string): readonly MenuItem[] {
  for (const raw of itemsOf(items)) {
    const item = readItem(owner, raw);
    if (item?.label === label && item.submenu !== null) return item.submenu as readonly MenuItem[];
  }
  return [];
}

/**
 * Atlas's menu entries for an extension's items: an item with `submenu` becomes a submenu (recursively; `checked`,
 * `disabled` and `keepOpen` apply to plain items only), and an item without a label, or a submenu with nothing in it,
 * is left out. Clicks run guarded, so a menu never breaks on an extension. With `live`, an open submenu reads its
 * items again whenever `live.subscribe` reports a change, finding itself by its labels (the first of a label).
 */
export function menuEntriesOf(owner: string, items: readonly MenuItem[], live?: LiveMenu): ContextMenuEntry[] {
  const entries: ContextMenuEntry[] = [];
  for (const raw of itemsOf(items)) {
    const item = readItem(owner, raw);
    if (!item) continue;
    const icon = item.icon !== null ? { icon: item.icon } : {};
    if (item.submenu !== null) {
      const label = item.label;
      const sub: LiveMenu | undefined = live && { read: () => submenuOf(owner, live.read(), label), subscribe: live.subscribe };
      const children = menuEntriesOf(owner, item.submenu as readonly MenuItem[], sub);
      if (children.length === 0) continue;
      entries.push(sub
        ? { type: 'submenu', label, children: () => menuEntriesOf(owner, sub.read(), sub), subscribe: sub.subscribe, ...icon }
        : { type: 'submenu', label, children, ...icon });
      continue;
    }
    entries.push({
      type: 'item',
      label: item.label,
      onClick: clickOf(owner, item),
      ...icon,
      ...(item.checked !== undefined ? { checked: item.checked } : {}),
      ...(item.disabled !== undefined ? { disabled: item.disabled } : {}),
      ...(item.keepOpen ? { keepOpen: true } : {}),
    });
  }
  return entries;
}

/**
 * The entries every provider registered in `slot` gives for `ctx`, in the order they were added; a provider that throws
 * gives none. An open submenu runs its provider again on every change of `slot` (`ui.invalidate()` among them), and
 * shows nothing once the provider is removed.
 */
export function providedMenuEntries<C>(slot: SlotRegistry<(ctx: C) => MenuItem[]>, slotName: string, ctx: C): ContextMenuEntry[] {
  const subscribe = (onChange: () => void): (() => void) => slot.subscribe(onChange);
  return slot.list().flatMap((entry) => {
    const read = (): readonly MenuItem[] => (slot.list().includes(entry)
      ? safely(entry.owner, slotName, () => [...entry.item(ctx)], [])
      : []);
    return menuEntriesOf(entry.owner, read(), { read, subscribe });
  });
}

/** What extensions add to a token's context menu, for a GM view; a player view is never asked. */
export function tokenMenuEntries(ctx: ViewContext, token: Pick<TokenEntity, 'id' | 'kind'>): ContextMenuEntry[] {
  if (ctx.isPlayerView) return [];
  const tokenCtx: TokenMenuContext = Object.freeze({ ...ctx, tokenId: token.id, tokenKind: token.kind });
  return providedMenuEntries(tokenMenuSlot, 'token menu items', tokenCtx);
}

/** Sections whose `items` threw already: the failure is logged once, not on every read of an open menu. */
const failedSections = new WeakSet<SceneTabMenuSection>();

/** A section's items for `ctx`; none once the section is removed, and none (logged once) when `items` throws. */
function sectionItems({ owner, item: section }: SlotEntry<SceneTabMenuSection>, ctx: SceneTabMenuContext): readonly MenuItem[] {
  if (!sceneTabMenuSlot.list().some((entry) => entry.item === section)) return [];
  try {
    return [...itemsOf(section.items(ctx))].filter((item): item is MenuItem => item != null);
  } catch (error) {
    if (!failedSections.has(section)) {
      failedSections.add(section);
      console.error(`[Atlas API] ui.addSceneTabMenuSection: ${owner}'s section "${section.heading}" failed:`, error);
    }
    return [];
  }
}

/**
 * What extensions add to a scene tab's eye menu for `ctx`, in the order they were added: for each section with items,
 * a separator, its heading as a label row, then its items. Read anew on every call; an open submenu in a section
 * follows `ui.invalidate()` as in the other menus.
 */
export function sceneTabMenuEntries(ctx: SceneTabMenuContext): ContextMenuEntry[] {
  const subscribe = (onChange: () => void): (() => void) => sceneTabMenuSlot.subscribe(onChange);
  return sceneTabMenuSlot.list().flatMap((entry) => {
    const read = (): readonly MenuItem[] => sectionItems(entry, ctx);
    const items = menuEntriesOf(entry.owner, read(), { read, subscribe });
    return items.length === 0 ? [] : [{ type: 'separator' } as const, { type: 'label', text: entry.item.heading } as const, ...items];
  });
}
