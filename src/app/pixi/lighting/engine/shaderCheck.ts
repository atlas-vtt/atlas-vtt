import { ENGINE_SHADERS, type EngineShaderSource } from './engineShaders';
import { engineProgram } from './gpu';

export interface ShaderFailure {
  name: string;
  /** What the driver said about the shader's stages and its link. */
  log: string;
}

type Gl = WebGLRenderingContext | WebGL2RenderingContext;

/**
 * Compiles and links the sources PIXI will hand the driver for each engine program, and
 * returns those that fail. PIXI itself only logs a failed link and then throws from its
 * uniform sync, deep inside a render; asking the driver first keeps a device that rejects
 * the shaders (or a context that came back broken) from ever reaching that point.
 */
export function failedEngineShaders(gl: Gl, sources: readonly EngineShaderSource[] = Object.values(ENGINE_SHADERS)): ShaderFailure[] {
  return shaderLinkFailures(startShaderLinks(gl, sources));
}

/** Engine programs handed to the driver to compile and link, not asked about yet. */
export interface ShaderLinks {
  gl: Gl;
  links: { name: string; program: WebGLProgram | null; vertex: WebGLShader | null; fragment: WebGLShader | null }[];
}

/**
 * Hands the driver every engine program of `sources` to compile and link, without asking how it
 * went: the browser's graphics process does that work meanwhile, so asking later
 * (`shaderLinkFailures`) no longer waits for it.
 */
export function startShaderLinks(gl: Gl, sources: readonly EngineShaderSource[]): ShaderLinks {
  // Where the driver offers it, links run on its own threads instead of one after another.
  gl.getExtension('KHR_parallel_shader_compile');
  return {
    gl,
    links: sources.map((source) => {
      const { vertex: vertexSource = '', fragment: fragmentSource = '' } = engineProgram(source);
      const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
      const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
      const program = vertex && fragment ? gl.createProgram() : null;
      if (program) {
        gl.attachShader(program, vertex!);
        gl.attachShader(program, fragment!);
        gl.linkProgram(program);
      }
      return { name: source.name, program, vertex, fragment };
    }),
  };
}

/** The programs of `started` that did not link, with the driver's logs; every object it made is deleted. */
export function shaderLinkFailures({ gl, links }: ShaderLinks): ShaderFailure[] {
  const failures: ShaderFailure[] = [];
  for (const { name, program, vertex, fragment } of links) {
    const log = linkLog(gl, program, vertex, fragment);
    if (log !== null) failures.push({ name, log });
  }
  return failures;
}

/** One line per failed shader, for the console. */
export function describeShaderFailures(failures: readonly ShaderFailure[]): string {
  return failures.map(({ name, log }) => `${name}: ${log}`).join('\n');
}

/** Null when the program linked; otherwise the driver's logs. */
function linkLog(gl: Gl, program: WebGLProgram | null, vertex: WebGLShader | null, fragment: WebGLShader | null): string | null {
  if (!vertex || !fragment || !program) {
    deleteAll(gl, program, vertex, fragment);
    return 'the graphics device created no shader object';
  }
  const linked = gl.getProgramParameter(program, gl.LINK_STATUS) === true;
  const logs = linked ? [] : [gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment), gl.getProgramInfoLog(program)];
  deleteAll(gl, program, vertex, fragment);
  if (linked) return null;
  return logs.map((log) => log?.trim()).filter(Boolean).join('\n') || 'the driver gave no log';
}

function compile(gl: Gl, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

function deleteAll(gl: Gl, program: WebGLProgram | null, vertex: WebGLShader | null, fragment: WebGLShader | null): void {
  if (program) gl.deleteProgram(program);
  if (vertex) gl.deleteShader(vertex);
  if (fragment) gl.deleteShader(fragment);
}
