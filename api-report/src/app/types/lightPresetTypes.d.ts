import type { StatedUnit } from '../grid/statedDistance';
import type { LightAnimation, LightKind } from './lightingTypes';
/** The units a preset's distances may be written in: a rulebook's, or grid cells. */
export type LightPresetUnit = Extract<StatedUnit, 'feet' | 'yards' | 'meters' | 'squares'>;
/**
 * A light a game system's rules name (a torch, a hooded lantern, the Light spell), offered
 * wherever a light is chosen. Its distances are in `unit`, as the rules write them; they are
 * converted to what the collection measures in where the preset is offered
 * (`lightPresetsOnMap`). A system that measures in bands names its presets by the band they reach.
 */
export interface LightPresetDefinition {
    /**
     * `torch` for a generic preset, `<preset key>-<light>` for a game system's (`dnd5e-torch`),
     * as condition ids are made. Never changed once shipped: lights record it.
     */
    id: string;
    name: string;
    /**
     * What `bright` and `dim` are counted in: a real unit, converted as rulebooks do (5 feet are
     * 1.5 metres), or `squares` for grid cells. Unset: the collection's own game units.
     */
    unit?: LightPresetUnit;
    /** Radius of full light. */
    bright: number;
    /** Radius where the light ends; at least `bright`. */
    dim: number;
    color: string;
    animation: LightAnimation;
    /** Picks the glyph of the light's marker and chip. */
    kind: LightKind;
    /** Size of the flame; unset is the engine's default. */
    sourceRadius?: number;
    /** Brightness multiplier; unset is 1. */
    intensity?: number;
    /** A source of magical darkness of radius `dim` (`LightEmission.darkness`). */
    darkness?: boolean;
    /** Which wins where a light and a darkness meet (`LightEmission.priority`); unset is 0. */
    priority?: number;
    /** Width of the beam in degrees of a light that shines one way (`LightEmission.angle`); unset shines all around. */
    angle?: number;
}
