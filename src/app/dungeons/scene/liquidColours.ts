import type { LiquidColors, LiquidKind } from '../../types/liquidTypes';
import { lavaDuotone } from '../render/art/lavaPalette';
import { mixColours, paletteOf, type Palette } from '../render/palette';
import { stoneColours } from '../render/stone/colours';
import type { DungeonStyle, DungeonView } from '../style';

/**
 * The colours each liquid moves in (`LiquidSurface.colors`): the pigments the static painters use
 * for it, so the motion is drawn in the map's own art. Engraved looks keep their ink and paper,
 * pale ink on Cyanotype included, and never gain a colour of their own; a monochrome map keeps to
 * its two pigments.
 */
export function liquidColours(style: DungeonStyle, view: DungeonView): Record<LiquidKind, LiquidColors> {
  return { water: waterColours(style, view), lava: lavaColours(style, view), acid: acidColours(style, view) };
}

/** The paper an engraved look draws its liquids on: the floor, tinted by its water unless monochrome. */
function engravedPaper(palette: Palette, view: DungeonView): string {
  return view.monochrome ? palette.floor : mixColours(palette.floor, palette.water, 0.5);
}

/** Water in the static water painters' pigments. */
export function waterColours(style: DungeonStyle, view: DungeonView): LiquidColors {
  const palette = paletteOf(style, view);
  if (style.direction === 'engraved') {
    const paper = engravedPaper(palette, view);
    // Ink can be pale (Cyanotype): do not treat it as a darkening colour or add white light.
    return { surface: paper, deep: palette.ink, glint: paper };
  }
  const c = stoneColours(palette, view.monochrome);
  return {
    surface: c.water,
    deep: view.monochrome ? (c.dark ? palette.floor : c.line) : mixColours(c.water, c.dark ? '#000000' : c.line, 0.42),
    glint: view.monochrome ? (c.dark ? c.line : palette.floor) : mixColours(c.water, c.light, c.dark ? 0.28 : 0.5),
  };
}

/** Lava in the inks of `paintMolten`, the warm earth pigments of `moltenAt`, or the monochrome duotone. */
export function lavaColours(style: DungeonStyle, view: DungeonView): LiquidColors {
  const palette = paletteOf(style, view);
  if (style.direction === 'engraved') {
    const paper = engravedPaper(palette, view);
    return { surface: paper, deep: palette.ink, glint: paper };
  }
  if (view.monochrome) return lavaDuotone(palette.ink, palette.floor);
  return { surface: '#d66028', deep: '#702414', glint: '#f09646' };
}

/** Acid in the painter's green ramp and bubble pigments, or in the look's ink. */
export function acidColours(style: DungeonStyle, view: DungeonView): LiquidColors {
  const palette = paletteOf(style, view);
  if (style.direction === 'engraved') return { surface: engravedPaper(palette, view), deep: palette.ink, glint: palette.ink };
  const stone = stoneColours(palette, view.monochrome);
  if (view.monochrome) {
    return { surface: stone.water, deep: mixColours(palette.floor, palette.ink, 0.5), glint: mixColours(palette.floor, palette.ink, stone.dark ? 0.55 : 0.4) };
  }
  // The painter's acid ramp (lavaField) and pale bubble rims (stone/acid), subdued on dark floors.
  return { surface: '#80b034', deep: '#344a1a', glint: mixColours('#d6f08c', '#80b034', stone.dark ? 0.45 : 0.2) };
}
