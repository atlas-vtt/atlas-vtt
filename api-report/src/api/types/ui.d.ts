import type { Disposer, ViewId } from './common';
import type { TokenEntity } from './records';
/** What a slot callback is told about the view it is drawn or run in. */
export interface ViewContext {
    viewId: ViewId;
    /** The kind of view: an Atlas map view. */
    kind: 'map';
    /** True in a view players look at (the player window); false in the GM's own map views. */
    isPlayerView: boolean;
}
export interface MenuItem {
    label: string;
    /** Lucide name */
    icon?: string;
    onClick?(): void;
    /** A submenu finds itself again by its label when it is read anew: give the submenus among one menu's items distinct labels. */
    submenu?: MenuItem[];
    checked?: boolean;
    disabled?: boolean;
    /**
     * A plain item that leaves its menu open when chosen, for toggles picked several in a row. An open submenu reads its
     * provider again after `ui.invalidate()`, so its checkmarks follow. An item in the menu itself also leaves it open, but
     * its checkmark stays as it was when the menu opened; put toggles picked several in a row in a submenu. The
     * scene tab menu's own items (`addSceneTabMenuSection`) follow `ui.invalidate()` too.
     */
    keepOpen?: boolean;
}
export interface ToolbarItem {
    /** Unique among this extension's toolbar items. */
    id: string;
    /** Lucide name */
    icon: string;
    label: string;
    /** Shown beside the label in "More tools" only; Atlas binds no hotkey for it. */
    shortcut?: string;
    /**
     * Its place among extensions' items, which sit together after Atlas's dice button: a higher priority sits further
     * left. The bar moves items into "More tools" from its right end, so lower priorities move there first. Default 50.
     */
    priority?: number;
    /**
     * Whether the item shows in this view; left out, it always shows. Only `true` shows it: a hidden
     * item takes no room in the bar and is not in "More tools". Read again after `ui.invalidate()`. A predicate that throws
     * hides the item, and the failure is logged once.
     */
    isVisible?(ctx: ViewContext): boolean;
    /** Draws the button as the one in use, and keeps it in the bar rather than in "More tools". */
    isActive?(ctx: ViewContext): boolean;
    /** A dot (`true`) or a count on the button; `null` shows nothing. */
    badge?(ctx: ViewContext): string | number | true | null;
    onClick(ctx: ViewContext): void;
}
export interface PaletteCommand {
    /** Unique within its section. */
    id: string;
    /** Lucide name */
    icon: string;
    label: string;
    keywords?: string[];
    run(): void;
}
export interface PaletteSection {
    /** Unique among this extension's sections. */
    id: string;
    title: string;
    /** Read again each time the palette draws and after `invalidate()`. */
    commands(ctx: ViewContext): PaletteCommand[];
}
export interface DashboardTile {
    /** Unique among this extension's tiles. */
    id: string;
    /** Lucide name */
    icon: string;
    title: string;
    description: string;
    onClick(): void;
}
/** What a token menu provider is told: the view, the token, and its kind (`tokenKind`, since `kind` is the view's). */
export type TokenMenuContext = ViewContext & {
    tokenId: string;
    tokenKind: TokenEntity['kind'];
};
/** Capability `scene-tabs`: the scene tab whose eye was right-clicked, read anew each time the menu reads its sections. */
export interface SceneTabMenuContext {
    viewId: ViewId;
    tabId: string;
    mapPath: string;
    /** The tab's name, as its tab shows it. */
    name: string;
    /** The view's active tab. */
    active: boolean;
    /** Atlas's presented tab, held or not. */
    presented: boolean;
}
/** Capability `scene-tabs`: an extension's part of the menu that right-clicking a scene tab's eye opens. */
export interface SceneTabMenuSection {
    /** Shown as a label row at the section's top; plain text, trimmed, at most 40 characters (longer is cut). */
    heading: string;
    /**
     * Read when the menu opens and again after `ui.invalidate()` (and when the view's tabs change) while it is open, so
     * the checkmarks of top-level items follow. Return [] to leave the section out. A throw leaves it out and is logged once.
     */
    items(context: SceneTabMenuContext): MenuItem[];
}
export interface PanelSpec {
    /** Unique among this extension's panels. */
    id: string;
    title: string;
    /** Runs when the panel opens in a view; the returned disposer runs when it closes, its view closes, or the panel is disposed. */
    mount(container: HTMLElement, ctx: ViewContext): Disposer;
}
export interface PanelHandle {
    /** Opens the panel in `viewId`, default the active map view; does nothing when there is none. */
    open(viewId?: ViewId): void;
    /** Closes the panel in `viewId`, or in every view when none is given. */
    close(viewId?: ViewId): void;
    /** Opens the panel in `viewId` (default the active map view) when it is closed there, else closes it; does nothing for no view. */
    toggle(viewId?: ViewId): void;
    /** Whether the panel is open in `viewId` (default the active map view); false for no view or once disposed. */
    isOpen(viewId?: ViewId): boolean;
    /** Closes the panel in every view and removes it; calling it again does nothing. */
    dispose(): void;
}
/** Capability `asset-tabs`: what an asset manager tab is told: the collection the asset manager shows. */
export interface AssetTabContext {
    collectionId: string;
}
/** Capability `asset-tabs`: a tab of an extension's own beside the asset manager's Scenes, Maps, Encounters and Tokens. */
export interface AssetTabSpec {
    /** Unique among this extension's asset tabs. */
    id: string;
    /** The tab's name, as given. */
    title: string;
    /** Lucide name, shown before the title. */
    icon: string;
    /**
     * Runs when the tab is shown, with the collection the asset manager shows; the returned disposer runs when the tab is
     * left, the asset manager closes, the tab is removed, or the GM picks another collection, which mounts it again with
     * that collection. Render inside `container`: keys pressed there (all but Escape) stay with it, and a press outside
     * the asset manager closes it. A mount or disposer that throws is logged.
     */
    mount(container: HTMLElement, ctx: AssetTabContext): Disposer;
}
/**
 * Every `add*` reads the fields it needs once and keeps its own frozen copy; methods are called on the object given, so
 * a class instance works. It throws, naming the call and the field, for a malformed item or an id this extension already
 * registered in that slot. What it adds is removed by the returned disposer or when this extension unloads.
 */
export interface UiApi {
    /** A button in the map's toolbar, after Atlas's dice; `id`, `icon` and `label` must be non-empty and `onClick` a function. */
    addToolbarItem(item: ToolbarItem): Disposer;
    /** A section of the command palette, after Atlas's own; `id` and `title` must be non-empty and `commands` a function. */
    addPaletteSection(section: PaletteSection): Disposer;
    /** A tile on the dashboard; `id`, `icon` and `title` must be non-empty, `description` a string and `onClick` a function. */
    addDashboardTile(tile: DashboardTile): Disposer;
    /** The map's "More options" menu. */
    addViewMenuItems(provider: (ctx: ViewContext) => MenuItem[]): Disposer;
    /** A token's context menu (GM views only); `tokenKind` lets a provider act on characters only. */
    addTokenMenuItems(provider: (ctx: TokenMenuContext) => MenuItem[]): Disposer;
    /** A floating panel in Atlas's panel style; the extension renders into `container` with its own React. */
    addPanel(panel: PanelSpec): PanelHandle;
    /**
     * Capability `scene-tabs`: a section in the menu that right-clicking a scene tab's eye opens (or the context-menu key or
     * Shift+F10 on the eye), after Atlas's own "Open player window": a separator, the `heading` as a label row, then the
     * items. The menu opens whenever it has something to show. `heading` must be non-empty once trimmed and `items` a function.
     */
    addSceneTabMenuSection?(section: SceneTabMenuSection): Disposer;
    /**
     * Capability `asset-tabs`: a tab in the asset manager after Atlas's own, which shows what `mount` renders in place of
     * the asset grid. `id`, `title` and `icon` must be non-empty and `mount` a function.
     */
    addAssetTab?(tab: AssetTabSpec): Disposer;
    /** Re-reads `isVisible`, `isActive`, `badge`, palette commands, menu providers and scene tab menu sections now. */
    invalidate(): void;
}
