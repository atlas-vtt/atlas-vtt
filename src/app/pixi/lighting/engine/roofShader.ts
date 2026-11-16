import { MAX_ROOF_VIEWERS } from '../../../vision/roofSight';
import { GLSL_VERSION, SRGB_GLSL, TONEMAP_GLSL } from './glsl';

/**
 * A level's roof (`RoofLayer`), drawn above the lighting. uTexture is the roof image as its tiles
 * drew it (premultiplied). Every pixel is looked up in the roof's pieces (uPieces, two bytes of id
 * per pixel of the image's overview, reached through uWorldToPieces) and drawn only where its piece
 * shows in uFade (one byte per piece id, its share; 0 faded) and, where uGate is set (the players
 * of a lit scene), where a sense sees roofs (`roofSeenAt`): within the reach and cone of one of
 * uViewerCount viewers in uViewers (two texels each: origin, radius, the light levels it perceives
 * in as bits; facing, width, own space and whether it has a cone), or with uAllFlags while sight is
 * all, at the ambient light the texel holding the pixel has (uAmbient on uAmbientGrid where the
 * scene has zones, else uSceneLevel). Lit (uLit), its colour is the roof's under that ambient light
 * (uAmbientColor times its level), never darker than uMinLight, tonemapped as the composite does;
 * unlit, the image as it is. uAlpha thins it (the GM's view). Nothing is ever read beneath it: where
 * it is not drawn it adds nothing to the picture.
 */
export const roofFragment = `${GLSL_VERSION}
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec2 uAreaOrigin;
uniform mat3 uScreenToWorld;
uniform sampler2D uPieces;
uniform vec2 uPiecesSize;
uniform mat3 uWorldToPieces;
uniform sampler2D uFade;
uniform float uGate;
uniform sampler2D uViewers;
uniform int uViewerCount;
uniform float uAllFlags;
uniform sampler2D uAmbient;
uniform float uHasAmbient;
uniform vec3 uAmbientGrid;
uniform float uSceneLevel;
uniform float uSceneLight;
uniform vec3 uAmbientColor;
uniform float uLit;
uniform float uMinLight;
uniform float uPurkinje;
uniform float uAlpha;
${SRGB_GLSL}
${TONEMAP_GLSL}

const float TURN = 6.28318531;

// The share of the piece the image's pixel at world w belongs to: 0 where it has none, or it faded.
float pieceShown(vec2 w) {
  vec2 p = (uWorldToPieces * vec3(w, 1.0)).xy;
  ivec2 pixel = ivec2(floor(p));
  if (any(lessThan(p, vec2(0.0))) || any(greaterThanEqual(vec2(pixel), uPiecesSize))) return 0.0;
  vec2 bytes = floor(texelFetch(uPieces, pixel, 0).rg * 255.0 + 0.5);
  int id = int(bytes.r) + 256 * int(bytes.g);
  if (id == 0) return 0.0;
  return texelFetch(uFade, ivec2(id % 256, id / 256), 0).r;
}

// The ambient light at w as the rule reads it: x the level's code (0 dark, 1 dim, 2 bright), y the light.
vec2 ambientAt(vec2 w) {
  if (uHasAmbient > 0.5) {
    vec2 cell = floor(w / uAmbientGrid.x);
    if (all(greaterThanEqual(cell, vec2(0.0))) && all(lessThan(cell, uAmbientGrid.yz))) {
      return floor(texelFetch(uAmbient, ivec2(cell), 0).rg * 255.0 + 0.5) / vec2(1.0, 255.0);
    }
  }
  return vec2(uSceneLevel, uSceneLight);
}

// Whether a viewer that perceives in the light coded as bit sees the roof at w from above.
bool seenAt(vec2 w, int bit) {
  if ((int(uAllFlags) & bit) != 0) return true;
  for (int i = 0; i < ${MAX_ROOF_VIEWERS}; i++) {
    if (i >= uViewerCount) break;
    vec4 a = texelFetch(uViewers, ivec2(2 * i, 0), 0);
    if ((int(a.w) & bit) == 0) continue;
    vec2 d = w - a.xy;
    float distance = length(d);
    if (distance > a.z) continue;
    vec4 b = texelFetch(uViewers, ivec2(2 * i + 1, 0), 0);
    if (b.w > 0.5 && distance > b.z) {
      float turned = mod(atan(d.y, d.x) - (b.x - b.y * 0.5), TURN);
      if (turned > b.y + 1e-6 && turned < TURN - 1e-6) continue;
    }
    return true;
  }
  return false;
}

void main() {
  vec4 roof = textureLod(uTexture, vTextureCoord, 0.0);
  vec2 screen = vTextureCoord * uInputSize.xy + uAreaOrigin;
  vec2 world = (uScreenToWorld * vec3(screen, 1.0)).xy;
  float shown = roof.a > 0.0 ? pieceShown(world) : 0.0;
  vec2 ambient = ambientAt(world);
  if (shown > 0.0 && uGate > 0.5 && !seenAt(world, 1 << int(ambient.x))) shown = 0.0;
  if (shown <= 0.0) {
    finalColor = vec4(0.0);
    return;
  }
  vec3 colour = roof.rgb / roof.a;
  if (uLit > 0.5) {
    float level = max(ambient.y, uMinLight);
    float luminance = dot(uAmbientColor * level, LUMA);
    vec3 lit = neutral(toLinear(colour) * uAmbientColor * level, luminance);
    float night = (1.0 - smoothstep(0.03, 0.35, luminance)) * uPurkinje;
    colour = toSrgb(nightShift(lit, night));
  }
  float alpha = roof.a * shown * uAlpha;
  finalColor = vec4(colour * alpha, alpha);
}`;
