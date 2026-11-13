import { GLSL_VERSION } from './glsl';
import { STACK_GLSL } from './stackGlsl';

/**
 * The openings of a view whose scene has no lighting (`UnlitOpenings`): a quad in world pixels
 * (vWorld) over the stack's box, drawn over the view's map and grid and beneath its tokens. No
 * composite lights such a view, so this draws what the composite draws into a hole: where the
 * stack shows a level below, that level's snapshot, dimmed once per level down, or black where
 * none is bound or the stack shows nothing. The viewed level's own texels are left as they are.
 */
export const unlitOpeningsFragment = `${GLSL_VERSION}
in vec2 vWorld;
out vec4 finalColor;
${STACK_GLSL}
void main() {
  int shown = stackAt(vWorld);
  finalColor = shown == 0 ? vec4(0.0) : vec4(belowAt(shown, vWorld, vec3(0.0)), 1.0);
}`;
