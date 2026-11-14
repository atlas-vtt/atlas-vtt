/** How a press of the fog tool marks the map. */
export type FogShape = 'brush' | 'rectangle' | 'polygon' | 'lasso' | 'cells' | 'room';

/** The fog tool's choices: its bar above the toolbar sets them, the tool reads them. Never saved. */
export interface FogToolChoices {
  shape: FogShape;
  /** The brush's radius in map pixels. */
  brushSize: number;
}

/** The smallest and largest brush, in map pixels. */
export const FOG_BRUSH_SIZES = { min: 10, max: 200 } as const;

export const DEFAULT_FOG_TOOL: FogToolChoices = { shape: 'brush', brushSize: 50 };

/** What the fog tool does with a stroke. */
export type FogWhat = 'hide' | 'reveal';

/** The tools that are the fog tool: one hides, the other reveals. */
export type FogToolId = 'fog' | 'eraser';

export function isFogTool(tool: string): tool is FogToolId {
  return tool === 'fog' || tool === 'eraser';
}

/** What the fog tool does as it is set; `hide` too while another tool is in use and the fog tool would hide. */
export function fogWhat(state: { activeTool: string }): FogWhat {
  return state.activeTool === 'eraser' ? 'reveal' : 'hide';
}

/** The tool that does `what`. */
export function fogToolFor(what: FogWhat): FogToolId {
  return what === 'reveal' ? 'eraser' : 'fog';
}

/** Whether a stroke reveals: the revealing tool's does, and `flipped` (Alt held) makes a stroke do the other thing. */
export function fogStrokeReveals(activeTool: string, flipped: boolean): boolean {
  return (activeTool === 'eraser') !== flipped;
}

export function clampBrushSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_FOG_TOOL.brushSize;
  return Math.min(FOG_BRUSH_SIZES.max, Math.max(FOG_BRUSH_SIZES.min, Math.round(size)));
}

/** The choices as the tool can hold them: the brush within its limits. */
export function settledFogTool(choices: FogToolChoices): FogToolChoices {
  return { ...choices, brushSize: clampBrushSize(choices.brushSize) };
}

/** How much one step changes the brush: a share of its size, so steps look alike on a small and a large brush. */
const BRUSH_STEP = 1.15;
/** The step of a key that is held: the keyboard repeats it some 25 times a second, which with a press's step ran through every size in a second. */
const HELD_BRUSH_STEP = 1.05;

/** The brush one step larger (`direction` 1) or smaller (-1), within its limits; `held`: the finer step of a key held down. */
export function steppedBrushSize(size: number, direction: 1 | -1, held = false): number {
  const from = clampBrushSize(size);
  const scaled = Math.round(from * (held ? HELD_BRUSH_STEP : BRUSH_STEP) ** direction);
  // A small brush still moves by a pixel.
  return clampBrushSize(scaled === from ? from + direction : scaled);
}
