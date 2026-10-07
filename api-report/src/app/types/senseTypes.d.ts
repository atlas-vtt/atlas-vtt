/**
 * Senses: the ways a token perceives beyond normal sight, as data a game system defines.
 * Sight rules read these fields and nothing else, so each field says exactly what it decides.
 */
/**
 * How well a point is lit. `magical-dark` is inside a source of magical darkness that no light
 * there outranks (`lightLevelAt`): no ambient light and no such light counts in it.
 */
export type LightLevel = 'bright' | 'dim' | 'dark' | 'magical-dark';
/**
 * How a sense perceives a point at one light level:
 * - `none`: not at all.
 * - `normal`: as the light shows it, so bright light in full and dim light as dim.
 * - `as-bright`: in full, as if it stood in bright light.
 * - `as-dim`: as if it stood in dim light.
 *
 * A rule that says a sense "sees normally" in darkness is `as-bright`: darkness has no light of
 * its own to see by, so `normal` is not offered there.
 */
export type Seeing = 'none' | 'normal' | 'as-bright' | 'as-dim';
/** How a sense perceives a point where there is no light. */
export type DarkSeeing = Extract<Seeing, 'none' | 'as-dim' | 'as-bright'>;
/** What a sense perceives at each light level; each level takes only the ways that mean something there. */
export interface SenseSight {
    bright: Extract<Seeing, 'none' | 'normal'>;
    /** `as-bright`: dim light is drawn and counted as bright (low-light vision). */
    dim: Extract<Seeing, 'none' | 'normal' | 'as-bright'>;
    dark: DarkSeeing;
    /** Inside a darkness source. */
    magicalDark: DarkSeeing;
}
/**
 * How the map is drawn where a sense sees without light (`dark` and `magicalDark`): in `colour`,
 * in shades of grey (`monochrome`), in `black-and-white`, or as `heat` tones. Where there is
 * light, the light decides the look. Read only for senses that reveal `all`.
 */
export type SenseLook = 'colour' | 'monochrome' | 'black-and-white' | 'heat';
/**
 * Whether a token gives the sense a distance:
 * - `unlimited`: none is asked for; the sense reaches as far as its line of sight, or the map.
 * - `required`: it needs one. Without the token's or `defaultRange` it perceives nothing.
 * - `optional`: unlimited unless the token gives one.
 *
 * A distance stored on a token's sense always limits it, whatever this says (see `resolveSenses`).
 */
export type SenseRange = 'unlimited' | 'required' | 'optional';
/** Which of the token fields that senses replaced a definition stands for. */
export type SenseRole = 'darkvision' | 'tremorsense';
/**
 * What a sense gives the token's other senses instead of perceiving by itself:
 * `see-invisible` lets its eyes (normal sight and every sense that does not work while blinded)
 * perceive tokens with a condition whose effect is `invisible`. A blinded token has no use of it.
 */
export type SenseGrant = 'see-invisible';
export interface SenseDefinition {
    /**
     * `darkvision` for a generic sense, `<preset key>-<sense>` for a game system's (`dnd5e-darkvision`),
     * as condition ids are made. `sight` is reserved for normal sight. Never changed once shipped:
     * tokens, collections and presets record it.
     */
    id: string;
    name: string;
    /** One line in plain words: what the sense lets the players see. */
    description: string;
    /**
     * Set, the entry is a modifier, not a way of perceiving: it changes the token's eye senses
     * (`SenseGrant`) and perceives nothing itself. Its other fields then hold fixed values that say
     * so (`sees` is `none` at every level, `range` is `unlimited`), and readers that work out what
     * a token perceives skip it as a sense of its own. A token lists it like any sense, without a
     * distance.
     */
    grants?: SenseGrant;
    /**
     * Walls stop the sense: it perceives only what the token has a clear line to. False: it
     * perceives everything within its distance, whatever lies between.
     */
    lineOfSight: boolean;
    /** What it perceives at each light level, within its line of sight or distance. */
    sees: SenseSight;
    /** How the map is drawn where the sense sees without light. */
    look: SenseLook;
    /**
     * `all`: the map and the tokens on it; what it perceives is drawn and recorded as explored.
     * Only for a sense with `lineOfSight`: one that walls do not stop is read as `creatures`.
     * `creatures`: tokens only; the map, the light and explored memory stay as they are.
     */
    reveals: 'all' | 'creatures';
    /**
     * True: a token it perceives is seen, and shown as it is. False: the token is sensed, not seen,
     * and a token perceived by imprecise senses only is shown as an outline, without nameplate,
     * bars or conditions.
     */
    precise: boolean;
    /** It perceives tokens with a condition whose effect is `invisible`, itself (see `grants` for a sense that lets the eyes do so). */
    seesInvisible: boolean;
    /**
     * The sense does not use the eyes: a token with a condition whose effect is `blinded` keeps
     * it, and the vision cone does not clip it. False: it is a way of seeing, lost while blinded
     * and clipped by the cone, and the token's sight range limits it as it limits its sight.
     */
    worksWhileBlinded: boolean;
    range: SenseRange;
    /** Game units a token's sense takes when it gives none; only for `required`. */
    defaultRange?: number;
    /** Tokens it never perceives: `airborne` are those with a condition of that effect. */
    ignores?: 'airborne';
    /** The collection's sense an old `TokenVision.darkvision` or `tremorsense` number is read as. */
    role?: SenseRole;
}
/** One sense of a token, by the id of its definition. */
export interface TokenSense {
    id: string;
    /** Game units; unset takes the definition's default, or reaches without limit. */
    range?: number;
}
