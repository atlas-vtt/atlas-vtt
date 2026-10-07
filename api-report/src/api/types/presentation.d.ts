import type { Disposer, ViewId } from './common';
export interface PresentedSceneInfo {
    /**
     * Names one presentation: the same while it is held and resumed, new for every `present` (and every
     * presentation the GM starts), even of the same tab, and never repeated after Atlas reloads. Compare it to tell a new presentation from the one you know.
     */
    presentationId: string;
    viewId: ViewId;
    tabId: string;
    mapPath: string;
    held: boolean;
}
export interface PresentationListener {
    /** `resumed`: a held scene is shown again after its tab came back and loaded. */
    presented?(scene: PresentedSceneInfo, resumed: boolean): void;
    /** The GM switched the presented view to another tab; players keep the last scene they saw. */
    held?(scene: PresentedSceneInfo): void;
    /** Nothing is presented: stopped, the view closed, or its tab was closed. `previous.held` is true when the scene was held as it was cleared. */
    cleared?(previous: PresentedSceneInfo): void;
}
/** An audience besides the player window, such as a second screen an extension drives. */
export interface PresentationTarget {
    /** Non-empty; unique among this extension's targets. */
    id: string;
    /** Names the audience in the eye's tooltip, e.g. "the second screen". */
    label: string;
    /** While any target is active, the scene tab's eye presents without opening the player window, its tooltip names the target, a presented scene's eye stops presenting, and right-click offers "Open player window". */
    isActive(): boolean;
    /**
     * Capability `scene-tabs`: a short mark after a tab's eye ("2 players"), or null for none. At most 24 characters,
     * plain text (trimmed; longer is cut with "…"). A tab with a mark draws its eye as shown, and the mark joins the eye's
     * accessible name; what clicking the eye does is unchanged. Asked only while the target is active (the first active
     * target's non-null mark wins), on render and after `ui.invalidate()`. A throw or a value that is not a string or null
     * shows no mark and is logged once.
     */
    tabBadge?(tab: {
        viewId: ViewId;
        tabId: string;
    }): string | null;
}
export interface PresentationApi {
    /** The presented scene, also while it is held; null when nothing is presented. A frozen copy. */
    current(): PresentedSceneInfo | null;
    /**
     * Switches `viewId` to `tabId` (default: its active tab), waits for the load, presents. Never throws.
     * False for a closed view, or when nothing new is on screen. After a failed load the scene stays registered
     * as presented but held (`current().held === true`), and `presented(scene, true)` follows if its map later loads.
     */
    present(viewId: ViewId, tabId?: string): Promise<boolean>;
    /** Stops presenting, as the GM's Stop presenting does; nothing happens when nothing is presented. */
    stop(): void;
    /** Hears every change of the presented scene; each callback runs guarded, and the listener is dropped when this extension unloads. */
    subscribe(listener: PresentationListener): Disposer;
    /**
     * Adds an audience besides the player window. Its `id`, `label`, `isActive` and `tabBadge` are read once; `isActive`
     * and `tabBadge` are then called on `target` itself, guarded. Adding the same object again changes nothing; another target with an `id`
     * this extension already added, or a malformed one, throws. Removed by the returned disposer or when this extension unloads.
     */
    addTarget(target: PresentationTarget): Disposer;
}
