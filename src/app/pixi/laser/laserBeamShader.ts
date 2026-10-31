import { Color, Shader, UniformGroup } from 'pixi.js';

const vertex = `
in vec2 aPosition;
in vec4 aSegment;
in vec4 aShape;
out vec2 vPosition;
out vec4 vSegment;
out vec4 vShape;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vPosition = aPosition;
  vSegment = aSegment;
  vShape = aShape;
}`;

// Each capsule measures the pixel's distance to its segment, with life and radius
// interpolated along it. The cross-section is three gaussians: a faint glow reaching the
// capsule's edge, a saturated body taking uBodyShare of the radius, and a hot filament a
// quarter of the body wide; near the pointer the filament widens into a white-hot spot. Capsules overlap at every joint, so they are drawn with max blending
// into the beam's own layer (see LaserBeam), which keeps the union seamless.
const fragment = `
in vec2 vPosition;
in vec4 vSegment;
in vec4 vShape;

uniform vec3 uLaserColor;
uniform vec2 uPointer;
uniform float uPointerRadius;
uniform float uPointerVisible;
uniform float uBodyShare;

void main() {
  vec2 a = vSegment.xy;
  vec2 ab = vSegment.zw - a;
  float lengthSquared = dot(ab, ab);
  float t = lengthSquared > 0.0 ? clamp(dot(vPosition - a, ab) / lengthSquared, 0.0, 1.0) : 0.0;
  float life = mix(vShape.x, vShape.y, t);
  float radius = mix(vShape.z, vShape.w, t);
  float d = radius > 0.0 ? length(vPosition - (a + ab * t)) / radius : 1.0;
  if (d >= 1.0) discard;

  // Each gaussian is at half strength where x reaches 1.
  float bodyD = d / uBodyShare;
  float filamentD = bodyD / 0.24;
  float spotD = length(vPosition - uPointer) / (uPointerRadius * uBodyShare * 0.43);
  float halo = exp(-d * d * 3.0) * 0.4;
  float body = exp(-bodyD * bodyD * 0.693);
  float filament = exp(-filamentD * filamentD * 0.693) * 0.5;
  float spot = exp(-spotD * spotD * 0.693) * 0.9 * uPointerVisible;

  float alpha = max(halo, body) * smoothstep(0.0, 0.5, life);
  vec3 color = mix(uLaserColor, vec3(1.0), max(filament, spot));
  gl_FragColor = vec4(color * alpha, alpha);
}`;

export interface LaserBeamShader {
  shader: Shader;
  /** Colour of the beam and where its hot spot sits; `pointer` is null while the pointer is off the map. */
  update(color: string, pointer: { x: number; y: number } | null, radius: number, bodyShare: number): void;
}

/**
 * Shader for the laser beam's capsules (`laserBeamGeometry.ts`). Atlas renders with WebGL, so it
 * ships a GLSL program only.
 */
export function createLaserBeamShader(): LaserBeamShader {
  const laserUniforms = new UniformGroup({
    uLaserColor: { value: new Float32Array([1, 0, 0]), type: 'vec3<f32>' },
    uPointer: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
    uPointerRadius: { value: 1, type: 'f32' },
    uPointerVisible: { value: 0, type: 'f32' },
    uBodyShare: { value: 0.25, type: 'f32' },
  });
  const { uniforms } = laserUniforms;
  return {
    shader: Shader.from({ gl: { vertex, fragment, name: 'atlas-laser-beam' }, resources: { laserUniforms } }),
    update(color, pointer, radius, bodyShare): void {
      const rgb = new Color(color);
      uniforms.uLaserColor.set([rgb.red, rgb.green, rgb.blue]);
      uniforms.uPointerVisible = pointer ? 1 : 0;
      if (pointer) uniforms.uPointer.set([pointer.x, pointer.y]);
      uniforms.uPointerRadius = radius;
      uniforms.uBodyShare = bodyShare;
    },
  };
}
