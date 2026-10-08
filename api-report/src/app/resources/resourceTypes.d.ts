/**
 * Expendable token resources (HP, STR, Stress, ammunition…) defined per
 * collection. A token stores one value per definition key.
 */
/**
 * How a resource counts: `drains` starts full and goes down, `fills` starts at 0 and goes up. `static` does not
 * count at all: a value that stays as its statblock gives it, such as an armour class, shown as that one number.
 */
export type ResourceDirection = 'drains' | 'fills' | 'static';
export interface ResourceDefinition {
    /** Stable id derived from the name at creation; tokens key their values by it. Never renamed. */
    key: string;
    name: string;
    /** Statblock field (dotted path) that supplies the maximum, e.g. `hp`, `stats.0`, `resources.mana`. */
    field: string;
    direction: ResourceDirection;
    /** `#rrggbb`. */
    color: string;
    /** Spent (0 when draining, max when filling) marks the token defeated. */
    defeatedWhenSpent?: boolean;
    visibleToPlayers: boolean;
    /**
     * The socket it takes on a token, 0 to `MAX_RESOURCES - 1`: two bars, two wheels on the right, two on the left.
     * Without one it takes the first free socket in list order. Read sockets through `slottedResources`.
     */
    slot?: number;
}
/** `current` counts in the resource's direction: remaining when draining, used when filling. A static value is its `max`. */
export interface ResourceValue {
    current: number;
    max: number;
}
export type ResourceViewer = 'dm' | 'player';
/**
 * Supplies the resource definitions of the collection a map belongs to. A view that has no
 * collection (the remote view) answers for the token it is asked about.
 */
export type ResourceDefsProvider = (tokenId?: string) => readonly ResourceDefinition[];
/** A token has this many sockets, so it shows at most this many resources. */
export declare const MAX_RESOURCES = 6;
/** The first slots are bars below the token; the rest are wheels beside it (two on its right, two on its left), shown on hover and selection. */
export declare const BAR_SLOTS = 2;
export type ResourceShape = 'bar' | 'wheel';
export interface VisibleResource {
    definition: ResourceDefinition;
    value: ResourceValue;
    /** Place in the collection's list, which decides the shape. */
    slot: number;
}
/** The part of a token that holds resources. */
export interface ResourceHolder {
    resources?: Record<string, ResourceValue> | undefined;
    /** Keys whose maximum was set by hand and no longer follows the statblock. */
    overriddenMax?: string[] | undefined;
}
