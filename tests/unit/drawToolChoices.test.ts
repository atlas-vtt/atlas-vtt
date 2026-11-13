import { describe, expect, it } from 'vitest';
import { DRAW_FONTS, DRAW_MODES, DRAW_SIZES, TEXT_ALIGNS, TEXT_LOOKS } from '../../src/app/annotations/annotationTypes';
import {
  ALIGN_CHOICES, CLEAR_SCOPES, COMMON_DRAW_TOOLS, DASH_CHOICES, DRAW_COLOR_SWATCHES, DRAW_MODE_CHOICES, ENDS_CHOICES, FILL_CHOICES, FONT_CHOICES,
  LOOK_CHOICES, SIZE_CHOICES, STAMP_ICONS, drawModeChoice, drawModeTools, eraserOrBack, nextDrawMode,
} from '../../src/app/packages/components/toolbar/drawToolChoices';
import { MAP_ICON_SVG } from '../../src/app/pixi/mapIcons';

const MODES = DRAW_MODE_CHOICES.map((choice) => choice.value);

describe('the Draw tool\'s modes', () => {
  it('offers the modes that are built, in the tool\'s order, each under its own name', () => {
    expect(MODES).toEqual(['select', 'pen', 'line', 'rectangle', 'ellipse', 'text', 'stamp', 'eraser']);
    expect(MODES).toEqual(DRAW_MODES.filter((mode) => mode !== 'cells'));
    expect(new Set(DRAW_MODE_CHOICES.map((choice) => choice.label)).size).toBe(MODES.length);
  });

  it('shows the pen for a mode the bar does not offer', () => {
    expect(drawModeChoice('line').label).toBe('Line');
    expect(drawModeChoice('cells').value).toBe('pen');
  });

  it('steps through the modes and from the last to the first, never to a mode that is not built', () => {
    const seen = [MODES[0]!];
    for (let step = 1; step < MODES.length; step++) seen.push(nextDrawMode(seen[step - 1]!));
    expect(seen).toEqual(MODES);
    expect(nextDrawMode('eraser')).toBe('select');
    expect(nextDrawMode('stamp')).toBe('eraser');
    expect(nextDrawMode('cells')).toBe('select');
  });

  it('switches to the eraser, and from it back to the mode in hand before', () => {
    expect(eraserOrBack('line', 'pen')).toBe('eraser');
    expect(eraserOrBack('eraser', 'line')).toBe('line');
    // Nothing was in hand before the eraser, or a mode the bar does not offer: the pen.
    expect(eraserOrBack('eraser', 'eraser')).toBe('pen');
    expect(eraserOrBack('eraser', 'cells')).toBe('pen');
  });
});

describe('the tools of a mode', () => {
  it('begins with colour, size, players and layer, in that order, in every mode that makes or changes drawings', () => {
    expect(COMMON_DRAW_TOOLS).toEqual(['color', 'size', 'players', 'layer']);
    for (const mode of MODES.filter((mode) => mode !== 'eraser')) expect(drawModeTools(mode)[0], mode).toEqual(COMMON_DRAW_TOOLS);
  });

  it('adds what only the mode has', () => {
    const own = (mode: (typeof MODES)[number]): string[] => drawModeTools(mode).slice(1).flat();
    expect(own('pen')).toEqual(['seeThrough']);
    expect(own('line')).toEqual(['dash', 'ends', 'curved', 'fill', 'seeThrough']);
    expect(own('rectangle')).toEqual(['dash', 'fill']);
    expect(own('ellipse')).toEqual(own('rectangle'));
    expect(own('text')).toEqual(['font', 'look', 'align', 'bold', 'italic']);
    expect(own('stamp')).toEqual(['icon']);
    expect(own('select')).toEqual(['front', 'back', 'lock', 'clear']);
    expect(drawModeTools('eraser')).toEqual([['size'], ['eraseWhole'], ['clear']]);
    expect(drawModeTools('cells')).toEqual([]);
  });

  it('names no tool twice in a mode, and has no wider bar than the Line mode\'s nine tools', () => {
    for (const mode of MODES) {
      const tools = drawModeTools(mode).flat();
      expect(new Set(tools).size, mode).toBe(tools.length);
      expect(tools.length, mode).toBeLessThanOrEqual(drawModeTools('line').flat().length);
    }
    expect(drawModeTools('line').flat()).toHaveLength(9);
  });
});

describe('the choices of the tools\' menus', () => {
  it('offers every size, face, look and alignment the tool knows, and a line, its ends and a fill with none of each first', () => {
    expect(SIZE_CHOICES.map((choice) => choice.value)).toEqual(DRAW_SIZES);
    expect(FONT_CHOICES.map((choice) => choice.value)).toEqual(DRAW_FONTS);
    expect(FONT_CHOICES.map((choice) => choice.label)).toEqual(['Medieval', 'Sci-fi', 'Mono']);
    expect(LOOK_CHOICES.map((choice) => choice.value)).toEqual(TEXT_LOOKS);
    expect(ALIGN_CHOICES.map((choice) => choice.value)).toEqual(TEXT_ALIGNS);
    expect(DASH_CHOICES.map((choice) => choice.value)).toEqual([null, 'dashed', 'dotted']);
    expect(ENDS_CHOICES.map((choice) => choice.value)).toEqual([null, 'end', 'both']);
    expect(FILL_CHOICES.map((choice) => choice.value)).toEqual([null, 'soft', 'solid']);
  });

  it('shows each choice of a menu by an icon and a name of its own', () => {
    for (const choices of [SIZE_CHOICES, FONT_CHOICES, LOOK_CHOICES, ALIGN_CHOICES, DASH_CHOICES, ENDS_CHOICES, FILL_CHOICES]) {
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

  it('offers the symbols the map can draw', () => {
    expect(STAMP_ICONS.map(({ key }) => key)).toEqual(Object.keys(MAP_ICON_SVG));
  });

  it('clears what lies above the tokens, the whole level, or what players drew', () => {
    expect(CLEAR_SCOPES.map(({ scope }) => scope)).toEqual(['above', 'level', 'players']);
    expect(CLEAR_SCOPES.find(({ scope }) => scope === 'level')).toMatchObject({ label: 'Everything on this map', labelOnLevel: 'Everything on this level' });
  });
});
