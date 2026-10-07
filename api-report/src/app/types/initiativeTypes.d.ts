/**
 * Initiative Tracker Types
 * Baldur's Gate 3-inspired initiative system for combat tracking
 */
import type { InitiativeSide } from './initiativeRulesTypes';
/**
 * Configuration for the initiative tracker
 */
export interface InitiativeConfig {
    /** Whether to auto-sort entries by initiative value after rolling */
    autoSort: boolean;
}
/**
 * A single entry in the initiative tracker
 */
export interface InitiativeEntry {
    /** Unique identifier for this entry */
    id: string;
    /** Reference to the token on the map */
    tokenId: string;
    /** Display name */
    name: string;
    /** Rolled initiative value (after modifiers) */
    initiative: number;
    /** Initiative modifier from statblock/character */
    initiativeModifier: number;
    /** Path to token image for avatar display */
    imagePath: string;
    /** Path to linked statblock note (for CMD+hover preview); `undefined` clears it when patched */
    statblockPath?: string | undefined;
    /** Whether this entry has the current turn */
    isActive: boolean;
    /** Whether this is an NPC (vs player character) */
    isNPC: boolean;
    /** Order in the initiative list (for manual reordering) */
    order: number;
    /** Does not act in the running round (Cairn: a failed DEX save in round 1); cleared when the round ends. */
    sitsOut?: boolean;
}
/**
 * Full state for the initiative tracker
 */
export interface InitiativeState {
    /** All entries in the initiative order */
    entries: InitiativeEntry[];
    /** Index of the currently active entry */
    currentIndex: number;
    /** Current combat round number */
    round: number;
    /** Whether combat is currently active */
    isActive: boolean;
    /** Configuration for initiative calculation */
    config: InitiativeConfig;
    /**
     * Set while a fight runs by sides: the side that acts first in a round and the one whose
     * turn it is. A fight keeps the mode it was started in, whatever the collection's rules say since.
     */
    sides?: {
        first: InitiativeSide;
        active: InitiativeSide;
    };
}
/**
 * Default configuration for initiative
 */
export declare const DEFAULT_INITIATIVE_CONFIG: InitiativeConfig;
/**
 * Default empty initiative state
 */
export declare const createDefaultInitiativeState: () => InitiativeState;
