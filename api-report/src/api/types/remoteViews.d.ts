import type { Disposer, ViewId } from './common';
import type { ConditionDefinition, DiceRollResult, GridState, InitiativeRules, InitiativeState, MeasurementSettings, ResourceDefinition } from './records';
import type { TokenMove } from './tokens';
import type { SceneSnapshot, ViewCamera } from './views';
export interface RemoteSceneInput {
    /** Records in Atlas's own types; images by `blob:`, `data:` or `https:` URL, never a path (object URLs are released by the caller after replacing them). */
    background: {
        url: string | null;
        width: number;
        height: number;
    };
    /**
     * Finite numbers, a `size` of at least 4 px and at most 2,000 cells along a side of `background`, offsets within
     * 100,000 px, and a known `type` and `lineType`; anything else throws, so a grid Atlas could never finish drawing is never shown.
     */
    grid: GridState | null;
    objects: SceneSnapshot['objects'];
    /** Token image URL by token id. A token's `notePath` and `statblockPath` are dropped: they name another vault's notes. */
    tokenImages: Readonly<Record<string, string | null>>;
    widgets: SceneSnapshot['widgets'];
    /** The initiative list shows whenever `entries` is non-empty. An entry's `statblockPath` is dropped, and an `imagePath` that is not an image URL shows no avatar. */
    initiative: InitiativeState;
}
/**
 * `MeasurementSettings` as a remote view takes them. `ruleDistance` is optional: left out, it is `unitDistance`
 * (they differ only on a scene that sets its own distance per cell).
 */
export type RemoteMeasurementInput = Omit<MeasurementSettings, 'ruleDistance'> & {
    ruleDistance?: number;
};
export interface RemotePlayerState {
    movableTokenIds: readonly string[];
    measurement: RemoteMeasurementInput;
    /**
     * Stand-ins the GM's projection decided on; players never receive the GM's definitions. Decided per token: a resource
     * definition with `visibleToPlayers: false` draws no bar on that token; it still counts for its downed look (`defeatedWhenSpent`).
     */
    tokenUi: {
        conditions: readonly ConditionDefinition[];
        resources: Readonly<Record<string, readonly ResourceDefinition[]>>;
    };
    initiative: {
        rules: InitiativeRules | null;
        health: Readonly<Record<string, {
            value: number;
            max: number;
        }>>;
    };
}
/** A button of the status bar that tells `RemoteView.onStatusAction` its `id`. */
export interface RemoteStatusAction {
    /** Distinct among the status's actions. */
    id: string;
    label: string;
    /** Lucide name, drawn before the label. */
    icon?: string;
}
export interface RemoteStatus {
    title: string;
    /** A short state of the connection, shown after the title, e.g. "Connected"; empty shows none. */
    connection: string;
    /** The colour of the dot before the title: connected, pending (connecting or waiting) or ended. */
    tone: 'connected' | 'pending' | 'ended';
    message: string | null;
    /** A button that runs `run`, guarded; it comes first when `actions` are given too. */
    action?: {
        label: string;
        run(): void;
    };
    /** More buttons after `action`, at most 3 buttons in all with it; a choice is told to `onStatusAction` by its id. */
    actions?: readonly RemoteStatusAction[];
}
export interface RemoteViewsApi {
    /**
     * Opens (or reveals, with `reuse`) a tab of type `atlas-vtt-remote`, owned by the calling extension. `maxDice` is the most
     * dice its tray offers for one roll, a whole number from 1 to 100 (default 100); a revealed view keeps its own title, icon
     * and `maxDice`. The promise rejects on a malformed option and when the view could not open; the call itself never throws.
     */
    open(options: {
        title: string;
        icon?: string;
        reuse?: boolean;
        maxDice?: number;
    }): Promise<RemoteView>;
}
/**
 * A remote view: read-only, never saved, with no undo history. Every method does nothing once the view closed, and every
 * listener runs guarded and is dropped when the view closes. `views.*`, `lasers.*`, `lighting.*`, `tokens.snapPoint` and `dice.throw` take its `viewId`;
 * `views.active()` never returns it, and `tokens.move` and `presentation.present` refuse it.
 */
export interface RemoteView {
    readonly viewId: ViewId;
    /**
     * Shows the scene: read once and copied, so the caller keeps no reference into Atlas and nothing it changes later gets
     * past the checks, and the snapshot is loaded with the map path `remote:<viewId>`. Null shows an empty, unloaded scene.
     * A record handed again as the same object is not copied again, and one equal by value to the record shown keeps it, so
     * nothing redraws. Fog over a remote view's limits fails closed: more than 2,000 operations, more than 200,000 points
     * in all or 10,000 in one operation, or a brush radius above the map's longer side (100,000 px while its size is 0 × 0).
     * The view then covers the whole map with fog and hides every token, and its status bar says the scene has too much fog
     * to show; nothing throws. A malformed scene, or a record that is not plain data, throws and the scene shown stays.
     */
    setScene(scene: RemoteSceneInput | null): void;
    /** Says what the player may do and how their tokens show; a part equal by value to the one shown is kept, so nothing it draws redraws. */
    setPlayer(state: RemotePlayerState): void;
    /**
     * The status bar at the start of the view's top row; its action runs guarded. Throws when `status` is not a RemoteStatus,
     * also for more than 3 buttons in all (`action` and `actions`), and for an entry of `actions` with an empty id, label or icon,
     * or an id given twice.
     */
    setStatus(status: RemoteStatus): void;
    /** The player chose one of the status's `actions`: its id. Not called for `action`, which runs its own `run`. */
    onStatusAction?(listener: (id: string) => void): Disposer;
    /** The shared log shown in this view's dice log (the first 100 entries, copied); Clear is hidden, Roll again calls `onRoll`. */
    setDiceLog(entries: readonly DiceRollResult[]): void;
    /** Throws one of the player's own rolls with their Atlas dice look; a result card where WebGL is unavailable. Once per result id. */
    throwRoll(result: DiceRollResult): void;
    /**
     * The dice look the view's rolls are thrown in, for a scene whose collection chose one on the owner's side (its
     * `dice.lookFor(collectionId).lookId`): a full look id, `''` for Atlas's own dice, or null (the default) for the
     * player's own look. A look the player's Atlas has not registered shows the player's own meanwhile. Throws for anything
     * but a string of at most 300 characters or null.
     */
    setDiceLook?(lookId: string | null): void;
    /**
     * Shows `camera`'s world area as large as fits the view, gliding with `animate`, else at once; it keeps showing it through
     * resizes until the player moves the camera. `padded` leaves the margin the remote view's Fit map (Shift+1) leaves around the map (16 screen
     * pixels), for a Fit button of your own. Throws when `camera` is not finite numbers with a size above 0.
     */
    setCamera(camera: ViewCamera, options?: {
        animate?: boolean;
        padded?: boolean;
    }): void;
    /** Ends a drag in progress; the token goes back. */
    cancelDrag(): void;
    /** The player let go of a token they may move, at the snapped drop point. The token goes back until the scene moves it. */
    onTokenDrop(listener: (move: TokenMove) => void): Disposer;
    /** The player moved the camera (`byUser`), or Fit map ran; lets the extension stop following the GM. */
    onCameraMoved(listener: (byUser: boolean) => void): Disposer;
    /**
     * The dice tray, at most the view's `maxDice` (100 by default), or Roll again; return null once sent, or why not (shown in the tray, or as a notice for
     * Roll again). Listeners are asked in the order they were added until one returns null; a roll is sent by one listener at
     * most. With no listener, or when none sent it, the first reason given shows ("The roll could not be sent." for a listener
     * that throws or for none). The tray never rolls locally in a remote view.
     */
    onRoll(listener: (dice: Readonly<Record<string, number>>, modifier: number) => string | null): Disposer;
    /** Called once when the view closes: `close()`, the user closing the tab, the extension or Atlas unloading. */
    onClose(listener: () => void): Disposer;
    /** Closes the view's tab and drops every listener; `onClose` listeners run once. Calling it again does nothing. */
    close(): void;
}
