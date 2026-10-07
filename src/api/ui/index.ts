import { closePanel, closePanelEverywhere, isPanelOpen, openPanel } from '../../app/extensions/panelState';
import type { SlotRegistry } from '../../app/extensions/SlotRegistry';
import {
  assetTabSlot, dashboardSlot, invalidateSlots, paletteSlot, panelSlot, sceneTabMenuSlot, tokenMenuSlot, toolbarSlot, viewMenuSlot,
} from '../../app/extensions/slots';
import type { ExtensionScope } from '../extension';
import type { ViewTracker } from '../viewTracker';
import type { Disposer, ViewId } from '../types/common';
import type {
  AssetTabSpec, DashboardTile, MenuItem, PaletteSection, PanelHandle, PanelSpec, SceneTabMenuSection, TokenMenuContext, ToolbarItem, UiApi, ViewContext,
} from '../types/ui';

/** The longest heading a scene tab menu section shows; a longer one is cut. */
const SCENE_TAB_MENU_HEADING_MAX = 40;

function isText(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

type Kinds<K extends string> = Record<string, K>;

/**
 * The fields of `spec` that `fields` and `optional` name, each read once (through its prototype too, so a class
 * instance works), checked: throws, naming the call and the field, unless every one has its kind. A programmer error,
 * like `lasers.show`'s. Atlas keeps what this returns, never `spec`, so a getter cannot change a field after the check.
 */
function checked(call: string, spec: unknown, fields: Kinds<'text' | 'string' | 'function'>, optional: Kinds<'text' | 'function' | 'number' | 'list'> = {}): Record<string, unknown> {
  if (typeof spec !== 'object' || spec === null) throw new Error(`[Atlas API] ${call} needs an object.`);
  const record: Record<string, unknown> = {};
  for (const field of [...Object.keys(fields), ...Object.keys(optional)]) record[field] = (spec as Record<string, unknown>)[field];
  for (const [field, kind] of Object.entries(fields)) {
    const value = record[field];
    const ok = kind === 'function' ? typeof value === 'function' : kind === 'string' ? typeof value === 'string' : isText(value);
    if (!ok) throw new Error(`[Atlas API] ${call}: "${field}" must be ${kind === 'function' ? 'a function' : kind === 'string' ? 'a string' : 'a non-empty string'}.`);
  }
  for (const [field, kind] of Object.entries(optional)) {
    const value = record[field];
    if (value === undefined) continue;
    if (kind === 'list') continue;
    const ok = kind === 'function' ? typeof value === 'function' : kind === 'number' ? typeof value === 'number' && Number.isFinite(value) : isText(value);
    if (!ok) throw new Error(`[Atlas API] ${call}: "${field}" must be ${kind === 'function' ? 'a function' : kind === 'number' ? 'a number' : 'a non-empty string'} when given.`);
  }
  return record;
}

/**
 * The data fields of a checked spec, and each method as a function that calls it on the extension's own object, so a
 * class instance keeps its prototype methods and a method keeps its `this`. A method left out stays out.
 */
function kept<T>(original: unknown, record: Record<string, unknown>): T {
  const item: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(record)) {
    if (value === undefined) continue;
    item[field] = typeof value === 'function' ? (...args: unknown[]): unknown => (value as (...given: unknown[]) => unknown).apply(original, args) : value;
  }
  return Object.freeze(item) as T;
}

/** One id per extension and slot: ids become React keys and the toolbar's fit keys. */
function assertNew<T extends { id: string }>(call: string, slot: SlotRegistry<T>, owner: string, id: string): void {
  if (slot.list().some((entry) => entry.owner === owner && entry.item.id === id)) {
    throw new Error(`[Atlas API] ${call}: "${id}" is already registered by this extension.`);
  }
}

/** The extension's registrations: every `add*` registers in the slot and hands its removal to the scope's disposers. */
export function uiApi(scope: ExtensionScope, views: ViewTracker): UiApi {
  const register = <T>(slot: SlotRegistry<T>, item: T): Disposer => scope.disposers.add(slot.add(scope.id, item));

  function addPanel(spec: PanelSpec): PanelHandle {
    const panel = kept<PanelSpec>(spec, checked('ui.addPanel', spec, { id: 'text', title: 'text', mount: 'function' }));
    assertNew('ui.addPanel', panelSlot, scope.id, panel.id);
    let alive = true;
    const remove = panelSlot.add(scope.id, panel);
    // Disposing closes the panel in every view, then removes it; unloading the extension does the same.
    const dispose = scope.disposers.add(() => {
      alive = false;
      closePanelEverywhere(panel);
      remove();
    });
    /** The view a call acts on: the one named, or the active map view; null for one that is not open. */
    const target = (viewId?: ViewId): ViewId | null => {
      if (!alive) return null;
      return (viewId === undefined ? views.activeView() : views.view(viewId))?.viewId ?? null;
    };
    return Object.freeze({
      open: (viewId?: ViewId): void => { const id = target(viewId); if (id) openPanel(panel, id); },
      close: (viewId?: ViewId): void => {
        if (!alive) return;
        if (viewId === undefined) { closePanelEverywhere(panel); return; }
        const id = target(viewId);
        if (id) closePanel(panel, id);
      },
      toggle: (viewId?: ViewId): void => {
        const id = target(viewId);
        if (!id) return;
        if (isPanelOpen(panel, id)) closePanel(panel, id);
        else openPanel(panel, id);
      },
      isOpen: (viewId?: ViewId): boolean => { const id = target(viewId); return id !== null && isPanelOpen(panel, id); },
      dispose,
    });
  }

  return Object.freeze({
    addToolbarItem: (given: ToolbarItem): Disposer => {
      const record = checked('ui.addToolbarItem', given, { id: 'text', icon: 'text', label: 'text', onClick: 'function' },
        { shortcut: 'text', priority: 'number', isVisible: 'function', isActive: 'function', badge: 'function' });
      const item = kept<ToolbarItem>(given, record);
      assertNew('ui.addToolbarItem', toolbarSlot, scope.id, item.id);
      return register(toolbarSlot, item);
    },
    addPaletteSection: (given: PaletteSection): Disposer => {
      const section = kept<PaletteSection>(given, checked('ui.addPaletteSection', given, { id: 'text', title: 'text', commands: 'function' }));
      assertNew('ui.addPaletteSection', paletteSlot, scope.id, section.id);
      return register(paletteSlot, section);
    },
    addDashboardTile: (given: DashboardTile): Disposer => {
      const tile = kept<DashboardTile>(given, checked('ui.addDashboardTile', given, { id: 'text', icon: 'text', title: 'text', description: 'string', onClick: 'function' }));
      assertNew('ui.addDashboardTile', dashboardSlot, scope.id, tile.id);
      return register(dashboardSlot, tile);
    },
    addViewMenuItems: (provider: (ctx: ViewContext) => MenuItem[]): Disposer => {
      if (typeof provider !== 'function') throw new Error('[Atlas API] ui.addViewMenuItems needs a function.');
      return register(viewMenuSlot, provider);
    },
    addTokenMenuItems: (provider: (ctx: TokenMenuContext) => MenuItem[]): Disposer => {
      if (typeof provider !== 'function') throw new Error('[Atlas API] ui.addTokenMenuItems needs a function.');
      return register(tokenMenuSlot, provider);
    },
    addPanel,
    ...(scope.capabilities.has('scene-tabs') ? {
      addSceneTabMenuSection: (given: SceneTabMenuSection): Disposer => {
        const record = checked('ui.addSceneTabMenuSection', given, { heading: 'string', items: 'function' });
        const heading = (record.heading as string).trim().slice(0, SCENE_TAB_MENU_HEADING_MAX).trim();
        if (heading === '') throw new Error('[Atlas API] ui.addSceneTabMenuSection: "heading" must be a non-empty string.');
        return register(sceneTabMenuSlot, kept<SceneTabMenuSection>(given, { ...record, heading }));
      },
    } : {}),
    ...(scope.capabilities.has('asset-tabs') ? {
      addAssetTab: (given: AssetTabSpec): Disposer => {
        const tab = kept<AssetTabSpec>(given, checked('ui.addAssetTab', given, { id: 'text', title: 'text', icon: 'text', mount: 'function' }));
        assertNew('ui.addAssetTab', assetTabSlot, scope.id, tab.id);
        return register(assetTabSlot, tab);
      },
    } : {}),
    invalidate: (): void => invalidateSlots(),
  });
}
