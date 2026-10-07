/**
 * Filters on the statblocks linked to a collection's tokens. A collection
 * defines which statblock fields it filters by (its game system suggests some);
 * the asset manager keeps what the user picked in a `CreatureFilterSelection`.
 */
/** A filter a collection offers on its tokens' statblocks. */
export type CreatureFilterDefinition = CreatureRangeFilter | CreatureOptionsFilter;
export type CreatureFilterKind = CreatureFilterDefinition['kind'];
interface CreatureFilterBase {
    /** Stable within the collection; the asset manager remembers selections by it. */
    id: string;
    /** Shown in the asset manager, e.g. "CR" or "Role". */
    label: string;
}
/**
 * A numeric scale such as CR, level or tier. It reads exactly one field, so two
 * scales (CR 5 and tier 5) can never be compared with each other.
 */
export interface CreatureRangeFilter extends CreatureFilterBase {
    kind: 'range';
    field: string;
}
/**
 * Categories such as type, role or source. The values of all its fields are
 * merged, for systems that spread one list over several keys (Pathfinder 2e
 * traits in `trait_01` to `trait_07`).
 */
export interface CreatureOptionsFilter extends CreatureFilterBase {
    kind: 'options';
    fields: string[];
    /**
     * How the values are read: `alignment` splits alignments into their parts
     * (Lawful, Neutral, Chaotic, Good, Evil, Unaligned, Any), so "chaotic evil"
     * is Chaotic and Evil; `category` drops a detail in brackets at the end, so
     * "Horde (10/HP)" is Horde. Unset, each value is one option.
     */
    values?: 'alignment' | 'category';
    /** `all`: a creature needs every picked option, as parts of one alignment do. Unset: any of them. */
    match?: 'all';
}
/** Whether a token must have a linked statblock. */
export type StatblockLinkFilter = 'any' | 'linked' | 'unlinked';
/** Options picked in one filter: those a token must have, and those it must not. */
export interface OptionPicks {
    include: string[];
    exclude: string[];
}
/** What the user picked in the asset manager's filters. Empty picks and missing ranges filter nothing. */
export interface CreatureFilterSelection {
    statblock: StatblockLinkFilter;
    /** Statblock layouts (Fantasy Statblocks layout names). */
    layouts: OptionPicks;
    /** Inclusive bounds by range filter id. */
    ranges: Record<string, NumericRange>;
    /** Picked option keys by options filter id. */
    options: Record<string, OptionPicks>;
}
/** Whether an option is picked to be required, excluded, or not at all. */
export type OptionState = 'include' | 'exclude' | null;
export interface NumericRange {
    min: number;
    max: number;
}
/** A selection that filters nothing. */
export declare function emptyCreatureSelection(): CreatureFilterSelection;
export {};
