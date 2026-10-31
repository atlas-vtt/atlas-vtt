import { LIGHT_CEILING } from '../../../lighting/lightingConstants';
import { BOUNCE_GATHER_GLSL } from './cascadeShaders';
import { GLSL_VERSION, SRGB_GLSL, TONEMAP_GLSL, TRACE_GLSL, fieldGlsl, traceGlsl } from './glsl';
import { WALL_PUSH_GLSL, wallPushGlsl } from './wallPushGlsl';
import { SHOWN_GLSL } from './compositeUpscaleShader';

/** What only the traced picture reads: its wall fields, the traces through them, the faces of walls and the bounce. */
const TRACED_GLSL = `
uniform float uCore;
uniform float uBand;
uniform float uTexel;
${fieldGlsl('uField')}
${fieldGlsl('uSightField')}
${fieldGlsl('uTwoWayField')}
float clearance(vec2 w) { return uFieldClearance(w); }
float sightClearance(vec2 w) { return uSightFieldClearance(w); }
${TRACE_GLSL}
${traceGlsl('sightReaches', 'sightClearance')}
${WALL_PUSH_GLSL}
${wallPushGlsl('uSightField', 'Sight')}
${BOUNCE_GATHER_GLSL}`;

const EXPLORED_TRACED_GLSL = `
// Explored memory is stamped with hard-edged polygons: blur it over a disc of two memory texels,
// shrunk to the pixel's clearance from the walls that stop sight, so memory never smears across one. 12 Vogel taps,
// Gaussian in distance. A read takes in the memory texels around it, a diagonal of one at most,
// so no tap comes nearer than that to a wall. On a large map that is wider than a wall: there a
// wall's face remembers the floor in front of it, and where walls leave no room for that (on a
// wall's centre line, in the corner of a junction), the one memory texel the pixel lies in, or
// nothing where a wall lies between the pixel and that texel's middle.
float exploredAt(vec2 w) {
  // The memory's scale is set by the map's longer side, whose texel count rounds least.
  vec2 size = vec2(textureSize(uExplored, 0));
  float texel = size.x >= size.y ? uMapSize.x / size.x : uMapSize.y / size.y;
  float footprint = 1.4143 * texel;
  if (footprint > uSightFieldParams.y) {
    w = climbFromWallSight(w, footprint);
    if (uSightFieldDistance(w) < footprint) {
      // No room: the one memory texel the pixel lies in, if the way to its middle is clear. A texel
      // whose middle lies behind a wall was recorded from there, and one whose middle can be
      // reached lies whole on this side of every wall (a wall is as thick as the texel is wide).
      vec2 cell = clamp(floor(w / uMapSize * size), vec2(0.0), size - 1.0);
      return sightReaches(w, (cell + 0.5) / size * uMapSize) ? texelFetch(uExplored, ivec2(cell), 0).r : 0.0;
    }
  }
  float r = min(2.0 * texel, min(sightClearance(w), uSightFieldDistance(w) - footprint));
  float sum = textureLod(uExplored, clamp(w / uMapSize, 0.0, 1.0), 0.0).r;
  if (r < 0.25 * texel) return sum;
  float weights = 1.0;
  for (int i = 0; i < 12; i++) {
    float t = sqrt((float(i) + 0.5) / 12.0);
    float a = float(i) * 2.39996323;
    float k = exp(-2.0 * t * t);
    sum += k * textureLod(uExplored, clamp((w + vec2(cos(a), sin(a)) * t * r) / uMapSize, 0.0, 1.0), 0.0).r;
    weights += k;
  }
  return sum / weights;
}`;

// The polygon picture has no wall field: the memory is read as it was stamped, through one
// bilinear read, which carries it at most a memory texel past the line a stamp ended on.
const EXPLORED_POLYGONS_GLSL = `
float exploredAt(vec2 w) {
  return textureLod(uExplored, clamp(w / uMapSize, 0.0, 1.0), 0.0).r;
}`;

const TRACED_BOUNCE_GLSL = `
  // Without bounce (the lighting quality's choice) no probe is read or traced to.
  bool bounces = uBounceGain > 0.0;
  vec3 bounce = bounces ? bounceAt(world) : vec3(0.0);
  // Tiles end at the capsule: from its core to the band a wall's face takes the light (direct
  // and bounce alike) of the floor in front of it, on its own side, then blends back to its own
  // over a texel, where its own is fully lit (blending earlier left a dark line along walls).
  float d = wallDistance(world);
  float front = clamp((d - uCore) / uPixelWorld + 0.5, 0.0, 1.0) * (1.0 - smoothstep(uBand, uBand + uTexel, d));`;

const TRACED_ZONE_READ_GLSL = `
    zone = textureLod(uZones, world / uLightWorld, 0.0);
    zoneLifted = textureLod(uZonesLifted, world / uLightWorld, 0.0);`;

// The polygon picture's zones are flat fills read at the texel a pixel lies in: a zone darker than
// its scene fills the walls' band as far as that read reaches past its outline (`PolygonWorld`), so
// it shows neither the scene's light inside its walls nor its own darkness a texel's half-diagonal past them.
const POLYGON_ZONE_READ_GLSL = `
    ivec2 zoneTexel = clamp(ivec2(floor(world / uLightWorld * vec2(textureSize(uZones, 0)))), ivec2(0), textureSize(uZones, 0) - 1);
    zone = texelFetch(uZones, zoneTexel, 0);
    zoneLifted = texelFetch(uZonesLifted, zoneTexel, 0);`;

const TRACED_FACES_GLSL = `
  // Nearer than the core a wall that stops light both ways keeps its own light, its ink. A one-way
  // wall's core takes the darker of the floors on its two sides instead: on its blocking side the
  // rule lights the floor up to the centre line, and a tile ending at the capsule drew a black
  // line where a lit object's top meets its shadow. The darker side is never more than either
  // side has, so no light crosses the line, whichever way the gradient points this close to it.
  // Each side's floor is read a texel past the band, and only where no wall that stops light both
  // ways comes within that reach of the pixel and the conservative field proves both floors a
  // band (less a texel) from every centre line: no other wall lies between them and this one,
  // so neither reads a neighbouring room.
  float reach = uBand + uTexel;
  vec2 n = vec2(0.0);
  if (d < uCore + uPixelWorld && uTwoWayFieldDistance(world) + uTwoWayFieldParams.x > d + reach) n = wallNormal(world);
  if (n != vec2(0.0)) {
    vec2 sideA = world + n * (reach - d);
    vec2 sideB = world - n * (reach + d);
    if (min(uFieldDistance(sideA), uFieldDistance(sideB)) >= uBand - uTexel) {
      vec4 lampsA = textureLod(uLightMap, sideA / uLightWorld, 0.0);
      vec4 lampsB = textureLod(uLightMap, sideB / uLightWorld, 0.0);
      vec3 bounceA = bounces ? bounceAt(sideA) : vec3(0.0);
      vec3 bounceB = bounces ? bounceAt(sideB) : vec3(0.0);
      bool darkerA = dot(lampsA.rgb + bounceA * uBounceGain, LUMA) <= dot(lampsB.rgb + bounceB * uBounceGain, LUMA);
      vec2 floorAt = darkerA ? sideA : sideB;
      lamps = darkerA ? lampsA : lampsB;
      bounce = darkerA ? bounceA : bounceB;
      if (uHasZones > 0.5) {
        zone = textureLod(uZones, floorAt / uLightWorld, 0.0);
        zoneLifted = textureLod(uZonesLifted, floorAt / uLightWorld, 0.0);
      }
    }
  }
  if (front > 0.0) {
    vec2 floorAt = climbFromWall(world, uBand);
    lamps = mix(lamps, textureLod(uLightMap, floorAt / uLightWorld, 0.0), front);
    if (bounces) bounce = mix(bounce, bounceAt(floorAt), front);
    // A wall's face has the ambient light of the floor in front of it, on its own side.
    if (uHasZones > 0.5) {
      zone = mix(zone, textureLod(uZones, floorAt / uLightWorld, 0.0), front);
      zoneLifted = mix(zoneLifted, textureLod(uZonesLifted, floorAt / uLightWorld, 0.0), front);
    }
  }`;

/**
 * The lighting layer's final pass. uTexture is the layer itself, what the vision tokens
 * perceive (`SightMeshes`, `sightChannels`):
 * - red: seen by light, as the light shows it;
 * - green: perceived without light, in the scene's look without colour (uGreyKeep, uGreyTint:
 *   the grey of darkvision, black and white, or heat tones), in the hue of the scene's tint
 *   while it has one (uDarkTinted, uDarkTint: `tinted`);
 * - blue: perceived without light, in colour, at uColourLevel;
 * - alpha: dim light is perceived as bright (`litAsBright`).
 * Where two looks meet on a pixel, the brighter one shows (`brighter`).
 * uBackTexture is the scene beneath (map and tokens, sRGB). World textures are read
 * through uScreenToWorld, so every render (GM or player camera) lights its own view;
 * uPixelWorld is the size of a screen pixel in world pixels.
 * uAreaOrigin is where the filter's area starts on screen (PIXI's uOutputFrame holds it only
 * for the last filter of a chain; `AreaAwareFilter` computes it for any position in one).
 * In the player view, what the party does not perceive now shows its memory (uMemory 1): the
 * dim grey map tinted by uExploredTint where explored, uUnexplored elsewhere; both colours are
 * linear. That is what lies out of sight and what lies in sight in the dark, without a sense
 * that shows it: stepping behind a wall must not reveal a remembered room that standing in it hides.
 * uDarkness (read only while uHasDarkness is set) is the darkness map: red is how much of the
 * light magical darkness swallows (the lights it swallows are gone from the light map already;
 * here the ambient light and the bounce go too, and what is perceived without light), green
 * what a sense that sees in magical darkness perceives of it (0.5 as dim light, 1 as bright),
 * blue where a light it swallows would shine. Where it swallows something the players would see
 * (ambient light, a light, what a sense shows) they see a faint cool veil in its place (uVeil),
 * so that magical darkness tells apart from the unlit dark; where it swallows nothing there is
 * none. The GM sees the dim map under a stronger veil everywhere in it (uGmVeil).
 * uZones (read only while uHasZones is set) is the zone map: the ambient light of the scene's
 * zones, premultiplied by their share of the pixel in alpha, which is 1 inside a zone, where the
 * rule counts it; uZonesLifted is the same where dim light is perceived as bright.
 * Two wall fields: uField holds the walls that stop light (the faces of walls and the bounce
 * read it), uSightField those that stop sight (the explored memory's blur must not cross them).
 * They are one texture bound twice unless a wall of the scene blocks one thing only. uTwoWayField
 * holds the walls that stop light both ways, the same texture as uField unless a wall is one-way:
 * where it is farther than uField, the nearest wall is one-way.
 * While the grid is marked (uGrid 1, or 2 for a colour picked to contrast with the map; `UnlitGrid`)
 * it drew no colour but erased the alpha beneath its lines, which the tokens drawn after it fill in
 * again: uBackTexture's missing alpha is how much of the grid shows, painted unlit in uGridColor
 * (sRGB); a colour picked to contrast with the map is white where the ambient light is low. The GM
 * sees it everywhere, the players wherever their picture shows the map, now or from memory.
 * Openings (read only while uHasBelow is set): uStack holds the level stack (`LevelStack`) on its
 * box of texels (uStackBox, uStackTexel, uStackGrid): red is the level each texel shows, 0 the one
 * the view shows, 1 and 2 the levels below drawn (nearest first), 255 nothing. In the viewed
 * level's composite (uLevelIndex 0) a texel that shows anything else is a hole: the eraser took the
 * map and the grid's backing there, so what is left of the scene beneath is the viewed level's own
 * tokens, lit as everywhere, over uBelow1 or uBelow2 (that level's snapshot, its own composite
 * drawn in world space over the stack's box from texel uBelowGrid.xy, uBelowGrid.z of its texels a
 * side in a stack texel, read at the snapshot texel inside this very stack texel, where
 * uBelowShown says there is one) dimmed by uBelowDim once per level
 * down, or nothing (black for the GM, the unexplored colour for the players). In a level below's
 * composite (uLevelIndex 1 or 2) nothing is seen outside the texels that show it.
 * Worked out on fewer pixels than the render's (uShownOut: how many of the render's pixels across
 * one of them covers; 0 while it is not, `CompositeUpscale`), the alpha says how much the pixel shows
 * of the map (`SHOWN_GLSL`), so that darkness wins as it is drawn up, and what the tokens perceive
 * is the least of the render's pixels it covers: a sliver they do not see is never drawn over.
 *
 * Two pictures share this pass (`picture`). The traced one (`LightingWorld`) reads its wall
 * fields: a wall's face takes the light of the floor in front of it, the bounce is gathered, and
 * the memory is blurred no further than the walls let it. The polygon one (`PolygonWorld`) has
 * no field, no bounce and no faces: its light and zones leave the walls' band out, and the memory
 * is one bilinear read.
 */
export function compositeFragmentFor(picture: 'traced' | 'polygons'): string {
  const traced = picture === 'traced';
  return `${GLSL_VERSION}
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uBackTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
// PIXI's: the filter's input in device pixels (xy); the scene is read texel for texel by it.
uniform vec4 uInputPixel;
uniform sampler2D uLightMap;
uniform sampler2D uExplored;
uniform vec2 uAreaOrigin;
uniform mat3 uScreenToWorld;
uniform float uPixelWorld;
uniform vec2 uLightWorld;
uniform vec2 uMapSize;
uniform vec3 uAmbient;
uniform float uExposure;
uniform float uBounceGain;
uniform float uPurkinje;
uniform float uMode;
uniform float uAllSeen;
uniform float uMemory;
uniform vec3 uExploredTint;
uniform vec3 uUnexplored;
uniform float uGreyKeep;
uniform vec3 uGreyTint;
uniform vec3 uDarkTint;
uniform float uDarkTinted;
uniform float uColourLevel;
uniform float uAmbientLift;
uniform sampler2D uDarkness;
uniform float uHasDarkness;
uniform vec3 uVeil;
uniform vec3 uGmVeil;
uniform float uGreyLevel;
uniform vec2 uDarkLevels;
uniform sampler2D uZones;
uniform sampler2D uZonesLifted;
uniform float uHasZones;
uniform float uGrid;
uniform vec3 uGridColor;
uniform sampler2D uStack;
uniform vec4 uStackBox;
uniform vec2 uStackGrid;
uniform float uStackTexel;
uniform float uHasBelow;
uniform float uLevelIndex;
uniform sampler2D uBelow1;
uniform sampler2D uBelow2;
uniform vec2 uBelowShown;
uniform float uBelowDim;
uniform vec3 uBelowGrid;
uniform float uShownOut;
${traced ? TRACED_GLSL : ''}
${SRGB_GLSL}
${TONEMAP_GLSL}
${SHOWN_GLSL}

// Share of its colour an area no token sees loses in the GM view.
const float UNSEEN_FADE = 0.4;
// How much the other lights here may add to the brightest one, as a share of it (LIGHT_CEILING).
const float CEILING_REACH = ${LIGHT_CEILING.reach.toFixed(4)};

// What all the lights here give, as a share of their sum, when the brightest gives \`strongest\` of
// \`all\`: that one whole, what the others add easing towards CEILING_REACH of it.
float underCeiling(float all, float strongest) {
  float rest = all - strongest;
  if (rest <= 0.0 || strongest <= 0.0) return 1.0;
  return (strongest + rest / (1.0 + rest / (CEILING_REACH * strongest))) / all;
}
// Ambient light below which a grid coloured against the map is drawn white: a bright map lies too dark there for black lines.
const float GRID_DARK_AMBIENT = 0.35;

// The level the stack shows at world point w: 0 the one the view shows (also off the stack's grid
// and box), 1 or 2 a level below drawn, 255 nothing. The texel holding w decides, as the rule's shownAt.
int stackAt(vec2 w) {
  if (uHasBelow < 0.5) return 0;
  vec2 cell = floor(w / uStackTexel);
  if (any(lessThan(cell, vec2(0.0))) || any(greaterThanEqual(cell, uStackGrid))) return 0;
  vec2 local = cell - uStackBox.xy;
  if (any(lessThan(local, vec2(0.0))) || any(greaterThanEqual(local, uStackBox.zw))) return 0;
  return int(texelFetch(uStack, ivec2(local), 0).r * 255.0 + 0.5);
}

// The snapshot texel of a level below that holds w: worked out from the stack texel holding w, as
// stackAt reads it, so it always lies in that stack texel and never shows a neighbour's.
ivec2 snapshotTexel(vec2 w) {
  vec2 cell = floor(w / uStackTexel);
  float sub = uBelowGrid.z;
  vec2 inside = clamp(floor((w - cell * uStackTexel) * sub / uStackTexel), vec2(0.0), vec2(sub - 1.0));
  return ivec2((cell - uBelowGrid.xy) * sub + inside);
}

vec4 sightTexel(vec2 device) {
  return texelFetch(uTexture, clamp(ivec2(floor(device)), ivec2(0), ivec2(uInputPixel.xy) - 1), 0);
}

// What the vision tokens perceive at this pixel; on fewer pixels than the render's, the least of the render's pixels it covers.
vec4 sightHere() {
  if (uShownOut <= 0.0) return textureLod(uTexture, vTextureCoord, 0.0);
  vec2 device = vTextureCoord * uInputPixel.xy;
  float h = max(0.5 * uShownOut - 0.5, 0.0);
  vec4 near = min(sightTexel(device + vec2(-h, -h)), sightTexel(device + vec2(h, -h)));
  return min(near, min(sightTexel(device + vec2(-h, h)), sightTexel(device + vec2(h, h))));
}

${traced ? EXPLORED_TRACED_GLSL : EXPLORED_POLYGONS_GLSL}

// A colour in the hue of a tint, exactly as bright as it was: the tint says what the dark looks
// like, never how much of it is seen. The tinted colour is scaled back to the colour's own
// luminance; where one channel cannot carry that (a pure blue as bright as a pale floor), the
// hue gives way to white as far as it must.
vec3 tinted(vec3 color, vec3 tint) {
  float light = dot(color, LUMA);
  vec3 hued = color * tint;
  float huedLight = dot(hued, LUMA);
  // The hue at luminance 1; a colour without the tint's channels takes the tint's own.
  vec3 hue = huedLight > 1e-6 ? hued / huedLight : tint / max(dot(tint, LUMA), 1e-6);
  float top = max(hue.r, max(hue.g, hue.b));
  float share = top > 1.0 ? clamp((1.0 / max(light, 1e-6) - 1.0) / (top - 1.0), 0.0, 1.0) : 1.0;
  return light * mix(vec3(1.0), hue, share);
}

// Whichever colour is brighter, blended near a tie (a per-channel max mixes them into pink).
vec3 brighter(vec3 a, vec3 b) {
  return mix(a, b, smoothstep(-0.02, 0.02, dot(b - a, LUMA)));
}

// Senses: the scene where dim light is perceived as bright. Every light is taken at its bright
// level (the light map's alpha is its luminance there), dim ambient light raised to bright
// (the ambient light is given so: by uAmbientLift, or a zone's own); bounce stays as it is. No light, no
// change: darkness is not lit by this.
vec3 litAsBright(vec3 albedo, vec4 lamps, vec3 bounce, vec3 ambient) {
  vec3 direct = lamps.rgb * (lamps.a / max(dot(lamps.rgb, LUMA), 1e-4));
  vec3 light = ambient + (direct + bounce * uBounceGain) * uExposure;
  float level = dot(light, LUMA);
  vec3 lit = neutral(albedo * light, dot(ambient, LUMA));
  float fill = 1.0 - lamps.a * uExposure / max(level, 1e-4);
  float night = (1.0 - smoothstep(0.03, 0.35, level)) * uPurkinje * fill;
  return nightShift(lit, night);
}

void main() {
  vec2 screen = vTextureCoord * uInputSize.xy + uAreaOrigin;
  vec2 world = (uScreenToWorld * vec3(screen, 1.0)).xy;
  vec4 back = textureLod(uBackTexture, vTextureCoord, 0.0);
  int shownLevel = stackAt(world);
  // A hole in the viewed level: its map and grid were erased there, and what is left is its tokens.
  bool hole = uLevelIndex < 0.5 && shownLevel != 0;
  // A level below sees nothing of itself where the stack does not show it.
  float gate = uLevelIndex > 0.5 && shownLevel != int(uLevelIndex + 0.5) ? 0.0 : 1.0;
  // A marked grid erased the alpha beneath it, premultiplied: what is left of the scene there is its colour scaled by the alpha.
  float grid = uGrid > 0.5 && !hole ? clamp(1.0 - back.a, 0.0, 1.0) : 0.0;
  vec3 albedo = toLinear(uGrid > 0.5 || hole ? back.rgb / max(back.a, 1.0 / 255.0) : back.rgb);
  // rgb: the lights' light; alpha: its luminance had every light its bright level here.
  vec4 lamps = textureLod(uLightMap, world / uLightWorld, 0.0);
${traced ? TRACED_BOUNCE_GLSL : '  vec3 bounce = vec3(0.0);'}
  // r: the share of the light magical darkness swallows here; g: what sees in it, and how.
  // b: where a light it swallows would shine.
  vec3 dark = vec3(0.0);
  if (uHasDarkness > 0.5) dark = textureLod(uDarkness, world / uLightWorld, 0.0).rgb;
  // The ambient light of the zones here, and their share of the pixel.
  vec4 zone = vec4(0.0);
  vec4 zoneLifted = vec4(0.0);
  if (uHasZones > 0.5) {
${traced ? TRACED_ZONE_READ_GLSL : POLYGON_ZONE_READ_GLSL}
  }
${traced ? TRACED_FACES_GLSL : ''}
  // Lights add up in the light map's colour, and its alpha keeps the brightest one's level at its
  // bright level, which is never below what that light gives here: so the brightest light gives at
  // most that much, and one light alone is drawn as it always was. What the others add eases, and
  // their bounce with them, so lights held together never whiten the floor.
  float all = dot(lamps.rgb, LUMA);
  float eased = underCeiling(all, min(lamps.a, all));
  lamps.rgb *= eased;
  bounce *= eased;
  // Magical darkness swallows the ambient light and the bounce; the lights it swallows are not in the light map.
  float lightLeft = 1.0 - dark.r;
  // The ambient light here before the darkness takes of it.
  vec3 ambientGiven = uAmbient;
  vec3 ambientAsBright = uAmbient * uAmbientLift * lightLeft;
  if (uHasZones > 0.5) {
    ambientGiven = zone.rgb + uAmbient * (1.0 - zone.a);
    ambientAsBright = (zoneLifted.rgb + uAmbient * uAmbientLift * (1.0 - zoneLifted.a)) * lightLeft;
  }
  vec3 ambient = ambientGiven * lightLeft;
  bounce *= lightLeft;
  vec4 sight = sightHere() * gate;
  // Senses: what is perceived without light is seen too.
  float seen = max(uAllSeen * gate, max(sight.r, max(sight.g, sight.b)));
  vec3 direct = lamps.rgb;
  vec3 light = ambient + (direct + bounce * uBounceGain) * uExposure;
  float level = dot(light, LUMA);
  // The tonemap's toe darkens low values more than in proportion, so on a dark floor a light's
  // dim range showed far below its share of the bright range. A light is tonemapped at its
  // bright level instead and the result scaled back to what it gives; without a light this is 1.
  float lift = 1.0 + max(lamps.a - dot(direct, LUMA), 0.0) * uExposure / max(level, 1e-4);
  vec3 lit = neutral(albedo * light * lift, dot(ambient, LUMA)) / lift;
  // Cool grey where the light is low, by the share of it that is no light's own (ambient and
  // bounce): shifting a light's fade to black drew a pale ring around it.
  float fill = 1.0 - dot(direct, LUMA) * uExposure / max(level, 1e-4);
  float night = (1.0 - smoothstep(0.03, 0.35, level)) * uPurkinje * fill;
  lit = nightShift(lit, night);

  // Senses: dim light as bright.
  if (sight.a > 0.0) lit = mix(lit, litAsBright(albedo, lamps, bounce, ambientAsBright), sight.a);

  // Senses in magical darkness: only one that sees there perceives it (green of the darkness
  // map), at the level it sees there instead of the level of its look in the dark.
  float sensed = 1.0;
  float greyGain = 1.0;
  float colourGain = 1.0;
  if (dark.r > 0.0) {
    float levelIn = mix(uDarkLevels.x, uDarkLevels.y, clamp(dark.g * 2.0 - 1.0, 0.0, 1.0));
    sensed = mix(1.0, clamp(dark.g * 2.0, 0.0, 1.0), dark.r);
    greyGain = mix(1.0, levelIn / uGreyLevel, dark.r);
    colourGain = mix(1.0, levelIn / max(uColourLevel, 1e-4), dark.r);
  }
  float grey = dot(albedo, LUMA);
  vec3 darkSight = mix(vec3(grey), albedo, uGreyKeep) * uGreyTint * greyGain;
  if (uDarkTinted > 0.5) darkSight = tinted(darkSight, uDarkTint);
  vec3 visible = mix(lit, brighter(lit, darkSight), sight.g * sensed);
  // Senses: perceived without light, in colour.
  visible = mix(visible, brighter(visible, albedo * uColourLevel * colourGain), sight.b * sensed);
  // The players' view falls back on memory wherever the party perceives nothing now: out of
  // sight, and in sight where no light and no sense shows the map (recalls: memory is on and a
  // token has vision). The memory is read only where it can show: out of sight, or where the
  // live picture is no brighter than the brightest the memory can be.
  vec3 remembered = vec3(grey) * MEMORY_SHOWN * uExploredTint;
  float recalls = uMode > 0.5 && uMemory > 0.5 && uAllSeen < 0.5 ? 1.0 : 0.0;
  float dimmest = dot(visible, LUMA) - max(dot(uUnexplored, LUMA), dot(remembered, LUMA));
  float explored = uMode > 0.5 && uMemory > 0.5 && (seen < 1.0 || (recalls > 0.5 && dimmest < 0.0)) ? exploredAt(world) : 0.0;
  vec3 memory = mix(uUnexplored, remembered, explored);
  // In sight the memory makes up what the live picture lacks of the memory's own brightness:
  // nothing where the picture is as bright (lit and sensed places are exactly as the light
  // shows them), all of it in the dark, and at a light's rim the two add up to the memory's
  // brightness, so the light fades into the memory beneath it without a darker ring between.
  float lacking = max(dot(memory - visible, LUMA), 0.0) / max(dot(memory, LUMA), 1e-5);
  vec3 inSight = visible + memory * (recalls * lacking);
  // The players see the veil only where the darkness takes something from their picture: ambient
  // light, a light's light (blue of the darkness map), or what a sense that does not see in it
  // would show. Over unlit floor and over memory there is none: it would give away where the
  // darkness is although nothing is swallowed there.
  float taken = max(max(clamp(dot(ambientGiven, LUMA) * 50.0, 0.0, 1.0), dark.b), max(sight.g, sight.b) * (1.0 - clamp(dark.g * 2.0, 0.0, 1.0)));
  vec3 player = mix(memory, inSight + uVeil * (dark.r * taken), seen);
  visible += uVeil * dark.r;

  // The GM always sees the map and every light at full strength: a dim floor screen-blended under
  // the light. What no token sees keeps its brightness and loses part of its colour.
  vec3 floorColor = albedo * 0.05;
  vec3 gmLit = 1.0 - (1.0 - lit) * (1.0 - floorColor);
  vec3 unseen = mix(gmLit, vec3(dot(gmLit, LUMA)), UNSEEN_FADE);
  vec3 gm = mix(unseen, 1.0 - (1.0 - visible) * (1.0 - floorColor), seen) + uGmVeil * dark.r;

  vec3 color = max(uMode > 0.5 ? player : gm, 0.0);
  // How much of the map shows here, whatever its colour: the light and senses where perceived now, the memory where remembered.
  float liveShown = max(level, max(sight.g, sight.b) * sensed);
  float memoryShown = explored * MEMORY_SHOWN;
  float shownHere = uMode > 0.5 ? mix(memoryShown, max(liveShown, recalls * memoryShown), seen) : liveShown;
  vec3 shown = toSrgb(color);
  if (grid > 0.0) {
    // The players see the grid where a light or a sense shows them the map, or where they remember it; never over what they have not seen.
    float byLight = max(uAllSeen, sight.r) * smoothstep(0.01, 0.06, level);
    float bySense = max(sight.g, sight.b) * sensed;
    float gridShown = uMode > 0.5 ? max(max(byLight, bySense), explored) : 1.0;
    // A colour picked to contrast with the map was picked for the map lit: where the ambient light (the scene's, or a zone's)
    // is low, the floor is dark and the grid is white. Lights never change it, or the grid would shade through every light's fade.
    vec3 ink = uGrid > 1.5 && dot(ambientGiven, LUMA) < GRID_DARK_AMBIENT ? vec3(1.0) : uGridColor;
    shown = mix(shown, ink, grid * clamp(gridShown, 0.0, 1.0));
  }
  if (hole) {
    // The level below as its snapshot holds it in this very stack texel, or nothing; the viewed level's tokens over it.
    vec3 under = uMode > 0.5 ? toSrgb(uUnexplored) : vec3(0.0);
    ivec2 snap = snapshotTexel(world);
    if (shownLevel == 1 && uBelowShown.x > 0.5) {
      under = texelFetch(uBelow1, clamp(snap, ivec2(0), textureSize(uBelow1, 0) - 1), 0).rgb * uBelowDim;
    } else if (shownLevel == 2 && uBelowShown.y > 0.5) {
      under = texelFetch(uBelow2, clamp(snap, ivec2(0), textureSize(uBelow2, 0) - 1), 0).rgb * (uBelowDim * uBelowDim);
    }
    shown = mix(under, shown, clamp(back.a, 0.0, 1.0));
    shownHere = min(shownHere, dot(shown, LUMA));
  }
  float dither = (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;
  finalColor = vec4(shown + dither, uShownOut > 0.0 ? shownEncoded(shownHere) : 1.0);
}`;
}
