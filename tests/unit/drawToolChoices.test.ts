import { describe, expect, it } from 'vitest';
import { DRAW_FONTS, DRAW_MODES, DRAW_SIZES, TEXT_LOOKS } from '../../src/app/annotations/annotationTypes';
import {
  CELLS_CHOICES, CLEAR_SCOPES, COMMON_DRAW_TOOLS, DASH_CHOICES, DRAW_COLOR_SWATCHES, DRAW_MODE_CHOICES, ENDS_CHOICES, FILL_CHOICES, FONT_CHOICES,
  LOOK_CHOICES, SIZE_CHOICES, drawModeChoice, drawModeTools, drawModeUnavailable, eraserOrBack, nextDrawMode,
} from '../../src/app/packages/components/toolbar/drawToolChoices';

const MODES = DRAW_MODE_CHOICES.map((choice) => choice.value);
const GRID = { enabled: true, size: 70 };
const NO_GRID = { enabled: false, size: 70 };
const GRID_OFF = { enabled: true, visible: false, size: 70 };

describe('the Draw tool\'s modes', () => {
  it('offers every mode, in the tool\'s order, each under its own name', () => {
    expect(MODES).toEqual(['pen', 'line', 'rectangle', 'ellipse', 'text', 'stamp', 'cells', 'eraser']);
    expect(MODES).toEqual(DRAW_MODES);
    expect(new Set(DRAW_MODE_CHOICES.map((choice) => choice.label)).size).toBe(MODES.length);
  });

  it('cannot fill cells without a grid that is there and shown, and says why', () => {
    expect(drawModeUnavailable('cells', GRID)).toBeNull();
    for (const grid of [NO_GRID, GRID_OFF, { enabled: true, size: 0 }, null, undefined]) expect(drawModeUnavailable('cells', grid)).toBe('Turn on the grid to colour cells');
    for (const mode of MODES.filter((mode) => mode !== 'cells')) expect(drawModeUnavailable(mode, null)).toBeNull();
  });

  it('shows the pen for a mode that cannot be chosen on the map', () => {
    expect(drawModeChoice('line').label).toBe('Line');
    expect(drawModeChoice('cells').value).toBe('cells');
    expect(drawModeChoice('cells', GRID).value).toBe('cells');
    expect(drawModeChoice('cells', NO_GRID).value).toBe('pen');
    expect(drawModeChoice('cells', null).value).toBe('pen');
  });

  it('steps through the modes and from the last to the first, over a mode that cannot be chosen', () => {
    const seen = [MODES[0]!];
    for (let step = 1; step < MODES.length; step++) seen.push(nextDrawMode(seen[step - 1]!, GRID));
    expect(seen).toEqual(MODES);
    expect(nextDrawMode('eraser', GRID)).toBe('pen');
    expect(nextDrawMode('stamp', GRID)).toBe('cells');
    expect(nextDrawMode('stamp', GRID_OFF)).toBe('eraser');
    expect(nextDrawMode('cells', NO_GRID)).toBe('eraser');
  });

  it('switches to the eraser, and from it back to the mode in hand before', () => {
    expect(eraserOrBack('line', 'pen', GRID)).toBe('eraser');
    expect(eraserOrBack('eraser', 'line', GRID)).toBe('line');
    expect(eraserOrBack('eraser', 'cells', GRID)).toBe('cells');
    // Nothing was in hand before the eraser, or a mode that cannot be chosen now: the pen.
    expect(eraserOrBack('eraser', 'eraser', GRID)).toBe('pen');
    expect(eraserOrBack('eraser', 'cells', NO_GRID)).toBe('pen');
  });
});

describe('the tools of a mode', () => {
  it('begins with colour, size, players and layer, in that order, in every mode that makes or changes drawings', () => {
    expect(COMMON_DRAW_TOOLS).toEqual(['color', 'size', 'players', 'layer']);
    for (const mode of MODES.filter((mode) => mode !== 'eraser' && mode !== 'cells')) expect(drawModeTools(mode)[0], mode).toEqual(COMMON_DRAW_TOOLS);
    // A cell has the grid's size, and the mode a layer of its own: the three it has stand in the same order.
    expect(drawModeTools('cells')[0]).toEqual(['color', 'players', 'cellsLayer']);
  });

  it('adds what only the mode has', () => {
    const own = (mode: (typeof MODES)[number]): string[] => drawModeTools(mode).slice(1).flat();
    expect(own('pen')).toEqual(['seeThrough']);
    expect(own('line')).toEqual(['dash', 'ends', 'curved', 'fill', 'seeThrough']);
    expect(own('rectangle')).toEqual(['dash', 'fill']);
    expect(own('ellipse')).toEqual(own('rectangle'));
    expect(own('text')).toEqual(['font', 'look']);
    expect(own('stamp')).toEqual(['icon']);
    expect(own('cells')).toEqual(['cellsFill', 'cellsUnfill']);
    expect(drawModeTools('eraser')).toEqual([['size'], ['eraseWhole'], ['clear']]);
  });

  it('names no tool twice in a mode, and has no wider bar than the Line mode\'s nine tools', () => {
    for (const mode of MODES) {
      const tools = drawModeTools(mode).flat();
      expect(new Set(tools).size, mode).toBe(tools.length);
      expect(tools.length, mode).toBeLessThanOrEqual(9);
    }
    expect(drawModeTools('line').flat()).toHaveLength(9);
  });
});

describe('the choices of the tools\' menus', () => {
  it('offers every size, face and look the tool knows, and a line, its ends and a fill with none of each first', () => {
    expect(SIZE_CHOICES.map((choice) => choice.value)).toEqual(DRAW_SIZES);
    expect(FONT_CHOICES.map((choice) => choice.value)).toEqual(DRAW_FONTS);
    expect(FONT_CHOICES.map((choice) => choice.label)).toEqual(['Medieval', 'Sci-fi', 'Mono']);
    expect(LOOK_CHOICES.map((choice) => choice.value)).toEqual(TEXT_LOOKS);
    expect(DASH_CHOICES.map((choice) => choice.value)).toEqual([null, 'dashed', 'dotted']);
    expect(ENDS_CHOICES.map((choice) => choice.value)).toEqual([null, 'end', 'both']);
    expect(FILL_CHOICES.map((choice) => choice.value)).toEqual([null, 'soft', 'solid']);
  });

  it('shows each choice of a menu by an icon and a name of its own', () => {
    for (const choices of [SIZE_CHOICES, FONT_CHOICES, LOOK_CHOICES, DASH_CHOICES, ENDS_CHOICES, FILL_CHOICES]) {
      expect(new Set(choices.map((choice) => choice.icon)).size).toBe(choices.length);
      expect(new Set(choices.map((choice) => choice.label)).size).toBe(choices.length);
    }
  });

  it('offers colours as they are stored, black and white among them', () => {
    const colours = DRAW_COLOR_SWATCHES.map((swatch) => swatch.value);
    for (const colour of colours) expect(colour).toMatch(/^#[0-9a-f]{6}$/);
    expect(colours).toEqual(expect.arrayContaining(['#ffffff', '#000000']));
    expect(colours).toHaveLength(8);
  });

  it('fills cells or clears them, each under its own icon', () => {
    expect([CELLS_CHOICES.cellsFill.label, CELLS_CHOICES.cellsUnfill.label]).toEqual(['Fill', 'Unfill']);
    expect(CELLS_CHOICES.cellsFill.icon).not.toBe(CELLS_CHOICES.cellsUnfill.icon);
  });

  it('clears what lies above the tokens, the whole level, or what players drew', () => {
    expect(CLEAR_SCOPES.map(({ scope }) => scope)).toEqual(['above', 'level', 'players']);
    expect(CLEAR_SCOPES.find(({ scope }) => scope === 'level')).toMatchObject({ label: 'Everything on this map', labelOnLevel: 'Everything on this level' });
  });
});
