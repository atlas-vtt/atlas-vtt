import type { TokenSense } from './senseTypes';
/** Dynamic lighting of one scene. Saved in the map file, never undo-tracked. */
export interface SceneLighting {
    enabled: boolean;
    /** Light everywhere without a source: 0 is pitch black, 1 is daylight. */
    ambient: number;
    /** Tint of the ambient light; unset is neutral white. */
    ambientColor?: string;
    /** Vision tokens limit what players see; unset is on. Off, players see everything the light shows. */
    tokenVision?: boolean;
    /** What tokens saw stays shown as explored; unset is on. Off records nothing and shows no memory, but keeps the saved memory. */
    exploredMemory?: boolean;
    /** Tint of remembered areas in the players' view; unset is neutral. */
    exploredColor?: string;
    /** Fill of never-seen areas in the players' view; unset is black. */
    unexploredColor?: string;
    /** Ambient light (0–1) from which everything in sight counts as lit, dimly at least; below it the scene is dark. Unset is 0.25. */
    litThreshold?: number;
    /** A dragged token sees and shines from where its drag began until it is dropped; unset is off: sight and light follow the drag. */
    sightOnDrop?: boolean;
    /** Ambient light (0–1) from which the scene is brightly lit; unset is 0.75, and it never lies below the lit threshold. */
    brightThreshold?: number;
    /**
     * How the scene draws what a sense with a look without colour (darkvision, infravision) shows in
     * the dark; unset is `system`. Only the picture: what is perceived stays the sense's. Read with `darkSightLookOf`.
     */
    darkSightLook?: DarkSightLook;
    /** Tint of that picture, `#rrggbb`; unset is none. Read with `darkSightTintOf`. */
    darkSightTint?: string;
}
/**
 * The look of what is perceived without light and without colour: `system` as each sense of the
 * game system says (grey, black and white, heat tones), `grey` the grey of darkvision for all of
 * them, `colour` the map's own colours.
 */
export type DarkSightLook = 'system' | 'grey' | 'colour';
/** The options a scene may leave unset. */
export type SceneLightingOption = Exclude<keyof SceneLighting, 'enabled' | 'ambient'>;
/** Changes to a scene's lighting: an option given as undefined is removed, so the scene reads its default again. */
export type SceneLightingChanges = Partial<Pick<SceneLighting, 'enabled' | 'ambient'>> & {
    [Field in SceneLightingOption]?: SceneLighting[Field] | undefined;
};
export declare const DEFAULT_SCENE_LIGHTING: SceneLighting;
export type LightAnimation = 'none' | 'torch' | 'candle' | 'pulse' | 'magic';
/** What a placed light is: it picks the light's marker. `custom` is any other light. */
export type LightKind = 'candle' | 'torch' | 'lantern' | 'magical' | 'darkness' | 'custom';
/** What a light gives off. Distances are game units (feet, metres…), converted at render time. */
export interface LightEmission {
    /** Radius of full light. */
    bright: number;
    /** Radius where the light ends; at least `bright`. */
    dim: number;
    color: string;
    /** Brightness multiplier, 1 is nominal. */
    intensity: number;
    animation: LightAnimation;
    /** Size of the flame; larger sources cast softer shadows. */
    sourceRadius?: number;
    /** The kind the GM gave the light; lights without one are read by `lightKindOf`. */
    kind?: LightKind;
    /**
     * A source of magical darkness: within its `dim` radius, as far as walls let it, nothing is
     * lit, by the scene's ambient light or by a light of its priority or lower. `bright`, colour,
     * intensity and flicker say nothing for it.
     */
    darkness?: boolean;
    /**
     * Which wins where a light and a darkness meet: the one with the higher priority, the darkness
     * when they are equal. Unset is 0.
     */
    priority?: number;
    /**
     * Width of the beam in degrees (1–359) of a light that shines one way, like a bullseye
     * lantern; unset or 360 shines all around. It faces the `rotation` of the placed light, or of
     * the token that carries it. Read with `coneAngle`.
     */
    angle?: number;
    /**
     * Id of the collection's light preset the light was made from (`LightPresetDefinition.id`); it
     * stays while the light's values are edited. Read with `lightPresetOf`, which also reads lights
     * without one.
     */
    preset?: string;
}
/** A light placed on the map. */
export interface LightSource {
    id: string;
    kind: 'light';
    x: number;
    y: number;
    emission: LightEmission;
    /** Switched off by the GM. */
    hidden?: boolean;
    /** Where a light with an `angle` shines, in degrees like a token's rotation: 0 faces up on the map, 90 right. Unset is 0. */
    rotation?: number;
    /**
     * A light that follows the ambient light, like a street lamp: it shines only while the scene's
     * ambient light (0–1) is at or below this level. Unset, or 1, it always shines. Read with
     * `ambientGate` and `isLightOn`.
     */
    activeBelowAmbient?: number;
}
export type LightInput = Omit<LightSource, 'id' | 'kind'>;
/** Changes to a placed light: a field given as undefined is removed, so a light can be put back exactly as it was. */
export type LightChanges = {
    [Field in keyof LightInput]?: LightInput[Field] | undefined;
};
/**
 * An area of the map with ambient light of its own: a cave mouth that is dark by day, a lit hall
 * in a dark dungeon. Map geometry the GM draws like walls (undo-tracked, in `objects.lightZones`);
 * later zones lie over earlier ones. Read them with `lightZoneList`.
 */
export interface LightZone {
    id: string;
    kind: 'light-zone';
    name?: string;
    /** The zone's corners in world pixels, at least three. Inside them the zone's light counts. */
    polygon: {
        x: number;
        y: number;
    }[];
    /** The ambient light inside, as the scene's: 0 is pitch black, 1 is daylight. */
    ambient: number;
    /** Tint of that light; unset is the scene's. */
    ambientColor?: string;
}
export type LightZoneInput = Omit<LightZone, 'id' | 'kind'>;
/** Changes to a light zone: a field given as undefined is removed (a name, a colour). */
export type LightZoneChanges = {
    [Field in keyof LightZoneInput]?: LightZoneInput[Field] | undefined;
};
/** How a token sees. Distances are game units. */
export interface TokenVision {
    enabled: boolean;
    /** Sight range; unset is unlimited. */
    range?: number;
    /**
     * Radius the token sees without light, drawn desaturated. Written before senses existed and
     * read as one while `senses` is unset (`tokenSenses`); `withSenses` drops it.
     */
    darkvision?: number;
    /**
     * Radius within which the token senses other tokens through walls and darkness; the map stays
     * unseen. Read and dropped like `darkvision`.
     */
    tremorsense?: number;
    /** Width of the vision cone in degrees (1–360), facing the token's rotation; unset sees all around. */
    angle?: number;
    /**
     * What the token perceives beyond normal sight, by the senses of its collection. Once set, even
     * empty, it replaces `darkvision` and `tremorsense`. Read with `tokenSenses`, write with `withSenses`.
     */
    senses?: TokenSense[];
}
/** What a collection or game system gives new tokens; vision itself always starts off. */
export type TokenVisionDefaults = Omit<TokenVision, 'enabled'>;
