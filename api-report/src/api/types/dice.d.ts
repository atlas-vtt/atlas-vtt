import type { Disposer, ViewId } from './common';
import type { DiceRollResult } from './records';
export interface DiceRollRequest {
    /** e.g. "2d6+1d20-1"; the tray's selection is turned into this with `diceFormula` from @atlas-vtt/shared/rules. A formula without dice, such as "+3", is added to the rules' default roll. */
    formula: string;
    /** Rolls by the rules of this map's collection (exploding dice, critical rule); Atlas's defaults otherwise. Rules only: the roll shows in every open map's log. */
    mapPath?: string | null;
    /** Someone other than the GM: shown in the log and toasts, shown as a result card rather than thrown on the GM's map, never saved in the map file. */
    rolledBy?: string;
}
/**
 * A die type a dice look paints: the six dice bodies, and 100 for the tens die of a d100 (a d10 of its own; its units
 * die is a d10). A d2 and a d3 are thrown as a d6 and wear its faces.
 */
export type DiceLookDie = 4 | 6 | 8 | 10 | 12 | 20 | 100;
/**
 * One face's art: an image (an `ImageBitmap` or a canvas is always readable), or a URL Atlas loads: `data:`, `blob:`, or
 * `https:` from a server that allows CORS. For a vault file, read it yourself (`app.vault.adapter.readBinary`, then
 * `createImageBitmap(new Blob([data]))` or `URL.createObjectURL`): an `app://` resource URL may not be readable back, and
 * then that face shows Atlas's numeral.
 */
export type DiceFaceArt = CanvasImageSource | string;
/**
 * A dice look an extension adds (`dice.registerLook`). Atlas keeps its own dice, throw, sounds and result: only the
 * faces and the body's colour change. Each face's art goes where Atlas prints the numeral, upright, centred and as large
 * as the face lets it be within Atlas's margin; it is copied at most 256 px on its longer side.
 */
export interface DiceLookSpec {
    /** Unique among this extension's looks; Atlas stores the GM's choice as `<extension id>:<id>`. */
    id: string;
    /** Shown in Atlas's dice look settings, as given (at most 64 characters). */
    name: string;
    /**
     * The art of one die type, keyed by face value: 1 to `sides` for d4, d6, d8, d10, d12 and d20 (the d10's 10 is the face
     * Atlas prints "10", read as 0 on a d100's units die), and 0, 10, 20, … 90 for 100, the d100's tens die (0 is "00").
     * A d4 face carries three numbers, at its corners: each value's art is painted at the three corners showing it, turned
     * to point at the corner, and the value at the top tip is the roll. Called once per die type for each registration, all
     * types together, before the look first shows; until every type answered (at most 10 s each), Atlas keeps the look it
     * had. A value left out, an image that fails to load, an image over 8,192 px on a side, an image that cannot be read
     * back (a cross-origin URL without CORS), an answer after 10 s or a call that throws or rejects gets Atlas's own numeral
     * for that face: a look never breaks a die. Runs guarded; failures are logged once per registration.
     */
    faces(sides: DiceLookDie): Promise<Readonly<Record<number, DiceFaceArt>>>;
    /** The relief of each face, by the same keys, grey (dark is pressed in); without it, a face's art is pressed in as its silhouette. */
    bump?(sides: DiceLookDie): Promise<Readonly<Record<number, DiceFaceArt>>>;
    /** `colour` paints the card (`#rrggbb`; left out keeps Atlas's card stock); `ink` colours the numerals Atlas paints where the look has no art. */
    body?: {
        colour?: string;
        ink?: string;
    };
    /** An image of the look for the dice settings: a URL as in `DiceFaceArt`. */
    preview?: string;
    /**
     * How a face's art is drawn. `'numeral'` (the default): where Atlas prints the numeral, on
     * Atlas's card with its grain and worn rim. `'face'`: the art covers the whole face cell, scaled to fill it and turned
     * as the numeral reads, with no card, numeral or wear of Atlas's, so a pack's own face design shows as it is; its
     * relief is the look's `bump` art, else flat. The chamfers and corners, and faces without art, keep `body.colour`
     * (faces without art also keep Atlas's numeral). Anything else throws.
     */
    fill?: 'numeral' | 'face';
}
/** Capability `dice-colours`: a colour dice can be rolled in, as the dice tray offers it: the shape of a die's tag. */
export interface DiceColour {
    /** Plain text (no markup), trimmed, at most 32 characters, e.g. "Fire". */
    name: string;
    /** `#rrggbb` */
    color: string;
}
/** Capability `dice-look-choice`: the dice look a collection's maps throw in, or the GM's default. */
export interface DiceLookInEffect {
    /** A full look id (`<extension id>:<look id>`), or `''` for Atlas's own dice. */
    lookId: string;
    /** `collection`: the collection chose it (`useLook` with `collectionId`); `default`: it follows the GM's choice. */
    from: 'collection' | 'default';
    /** False while the look's extension has not registered it: Atlas's dice in the GM's colour show meanwhile, and the choice stays. */
    loaded: boolean;
}
/** How `dice.publish` shows a roll. */
export interface DicePublishOptions {
    /** False: logged, toasted and shown in the player window as before, but never thrown in 3D (a result card instead). Default true. */
    throw?: boolean;
}
export interface DiceApi {
    /** Rolls and logs the roll; returns a frozen copy of the result. */
    roll(request: DiceRollRequest): DiceRollResult;
    /** Every roll Atlas logs: the dice tray, statblocks, `roll`, `publish`. Listeners receive frozen copies and run guarded. */
    onRolled(listener: (result: DiceRollResult) => void): Disposer;
    /**
     * Adds a roll made elsewhere (another Atlas, dice rolled outside Atlas) to the log, toasts and sounds, and to the player window.
     * A roll without `rolledBy` is also thrown with Atlas's 3D dice in every open GM map view, unless `options.throw` is
     * false: then it shows as a result card there, for dice already shown elsewhere (an extension's own
     * throw). Throws when `result` is not a roll of plain data with at most 1,000 dice, or `options` is not `{ throw?: boolean }`.
     */
    publish(result: DiceRollResult, options?: DicePublishOptions): void;
    /**
     * Throws `roll`, a result decided elsewhere, with Atlas's 3D dice in the GM map view `viewId`,
     * seeded by the roll's id as Atlas's own throws are, in the user's dice look and speed. Each roll id is thrown
     * once per view: handing it again throws nothing and answers true. False when nothing is thrown: the view is not open
     * or its map not loaded, its dice display is not showing, the user shows dice as result cards, or `roll` is not a roll
     * (not plain data, more than 1,000 dice, or a die whose value is not a whole number from 1 to its `max` included); show
     * the roll your own way then.
     * Where the view cannot draw 3D dice (no WebGL), or the roll does not list all its dice, Atlas shows its result card.
     * It only throws: nothing is logged, `onRolled` hears nothing and the player window shows nothing (`publish` does those).
     * `publish` already throws a roll without `rolledBy` in every open GM map view; use `throw` for a roll you do not
     * publish, or one published with `rolledBy`.
     */
    throw?(viewId: ViewId, roll: DiceRollResult): boolean;
    /**
     * Adds a dice look the GM can choose in Atlas's dice settings, after Atlas's own; only when `has('dice-looks')`. It
     * paints Atlas's 3D dice everywhere they are thrown (the dice tray, the player window, `throw`). The
     * spec is read once. Throws for an `id` or `name` that is not a non-empty string, an `id` this extension already
     * registered, a `faces` that is not a function, a `body` colour that is not `#rrggbb`, or a `fill` other than `'numeral'` or `'face'`. The GM's choice is kept by
     * full id: while this extension is not loaded, or after the disposer ran, Atlas paints its own look and keeps the choice,
     * so the look returns when it is registered again.
     */
    registerLook?(spec: DiceLookSpec): Disposer;
    /**
     * Capability `dice-colours`: colours the GM can roll dice in from Atlas's dice tray, by collection. `provider` is asked
     * with the collection of the map whose tray opens (never for a map outside a collection), guarded, and again after
     * `ui.invalidate()`. When any provider answers colours, the tray shows a colour picker (Atlas's "No colour" first,
     * chosen at first); dice added while a colour is picked carry it as their tag (`color`, `colorName`), in the log,
     * the toasts and Atlas's 3D dice. An entry whose `color` is not `#rrggbb` or whose `name` is not plain text of 1 to
     * 32 characters is left out, so is one equal to an earlier one; the tray shows at most 12. Throws for a provider
     * that is not a function.
     */
    registerColours?(provider: (collectionId: string) => readonly DiceColour[]): Disposer;
    /**
     * Capability `dice-look-choice`: chooses the dice look. `lookId` is one of this extension's look ids (as given to
     * `registerLook`), `''` for Atlas's own dice, or null. With `options.collectionId` it is that collection's choice:
     * Atlas throws the rolls of its maps in it, wherever they are shown (the GM's map views, the player window,
     * `dice.throw`), and null clears it, so the collection follows the GM's default again. Without a collection it sets
     * the GM's default, the dice look in Atlas's settings (null: Atlas's own dice). The choice is kept by full id while
     * the look is not registered, and the default's look shows meanwhile. A collection's choice lives in the asset index
     * alone, as `collections.setData` does, and `collections-changed` tells it; the default's, `settings-changed`.
     * Rejects for a collection that does not exist; throws for a malformed `lookId` or options.
     */
    useLook?(lookId: string | null, options?: {
        collectionId?: string;
    }): Promise<void>;
    /** Capability `dice-look-choice`: the dice look a collection's maps throw in (its own choice, else the default), or (no collection) the default; frozen. */
    lookFor?(collectionId?: string | null): Promise<DiceLookInEffect>;
}
