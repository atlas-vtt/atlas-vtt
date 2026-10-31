import { FOREST_LOOKS } from './forestLooks';
import type { DungeonStyle } from './style';

/**
 * The looks a GM picks a dungeon's drawing from: each a whole, its colours, strokes, shadow,
 * surroundings and grid chosen together, so every one stays legible on a table at 100 px per
 * cell under tokens. Atlas' own names and values. Ids are stored in the GM's settings: never
 * rename or reuse one.
 */

export type DungeonStyleId =
  | 'crayon'
  | 'parchment'
  | 'masonry'
  | 'print'
  | 'stipple'
  | 'blueprint'
  | 'night'
  | 'sepia'
  | 'moss'
  | 'ice'
  | 'volcanic'
  | 'sandstone'
  | 'sewer'
  | 'vellum'
  | 'slate'
  | 'contrast'
  | 'drafting';

export interface DungeonStyleEntry {
  id: DungeonStyleId;
  style: DungeonStyle;
}

/** In the order the gallery shows them. */
export const DUNGEON_STYLES: readonly DungeonStyleEntry[] = [
  {
    // Graphite on vellum, coloured in with wax crayon, as the Reprieve map of the Lockwood Manor collection.
    id: 'crayon',
    style: {
      direction: 'crayon',
      colors: { ink: '#2c1d12', rock: '#efe5cd', water: '#5d94b8', floor: '#f4ecda', paper: '#efe5cd' },
      strokes: { thin: 0.5, normal: 1.2, thick: 1.9 },
      shadow: { color: '#2c1d12', strength: 0.6 },
      surround: { mode: 'hatching', strokes: 3, size: 0.3, reach: 0.5, stroke: 0.8 },
      floor: 'flagstone',
      grid: { weight: 0.8, strength: 0.35 },
      forest: FOREST_LOOKS.crayon,
    },
  },
  {
    id: 'parchment',
    style: {
      direction: 'stone',
      colors: { ink: '#2a1c14', rock: '#c6b291', water: '#8fa79c', floor: '#f1e5c9', paper: '#d4c3a3' },
      strokes: { thin: 0.55, normal: 1.3, thick: 0.9 },
      shadow: { color: '#3b2a1c', strength: 0.55 },
      surround: { mode: 'hatching', strokes: 4, size: 0.42, reach: 0.62, stroke: 0.95 },
      floor: 'flagstone',
      grid: { weight: 0.9, strength: 0.5 },
      forest: FOREST_LOOKS.parchment,
    },
  },
  {
    id: 'masonry',
    style: {
      direction: 'stone',
      colors: { ink: '#22262b', rock: '#c8c2b2', water: '#7f979c', floor: '#e6e3da', paper: '#b9b4a6' },
      strokes: { thin: 0.5, normal: 1.3, thick: 0.9 },
      shadow: { color: '#23272c', strength: 0.5 },
      surround: { mode: 'stonework', strokes: 3, size: 0.52, reach: 0.7, stroke: 0.5 },
      floor: 'ashlar',
      grid: { weight: 1, strength: 0.45 },
      forest: FOREST_LOOKS.masonry,
    },
  },
  {
    id: 'print',
    style: {
      direction: 'engraved',
      colors: { ink: '#111111', rock: '#e2e2e2', water: '#d4dde3', floor: '#ffffff', paper: '#ffffff' },
      strokes: { thin: 0.5, normal: 1.3, thick: 2.1 },
      shadow: { color: '#111111', strength: 0.8 },
      surround: { mode: 'hatching', strokes: 3, size: 0.28, reach: 0.45, stroke: 0.9 },
      floor: 'flagstone',
      grid: { weight: 1, strength: 0.45 },
      forest: FOREST_LOOKS.print,
    },
  },
  {
    id: 'stipple',
    style: {
      direction: 'engraved',
      colors: { ink: '#2a2c30', rock: '#2a2c30', water: '#cfdad8', floor: '#f8f6f0', paper: '#e4e1d8' },
      strokes: { thin: 0.4, normal: 1.1, thick: 1.9 },
      shadow: { color: '#2a2c30', strength: 0.7 },
      surround: { mode: 'dots', strokes: 4, size: 0.5, reach: 0.75, stroke: 0.35 },
      floor: 'slab',
      grid: { weight: 0.9, strength: 0.4 },
      forest: FOREST_LOOKS.stipple,
    },
  },
  {
    id: 'blueprint',
    style: {
      direction: 'engraved',
      colors: { ink: '#e6f0ff', rock: '#1d4a8a', water: '#2f6db5', floor: '#2358a0', paper: '#173d75' },
      strokes: { thin: 0.5, normal: 1.2, thick: 1.9 },
      shadow: { color: '#0b1f40', strength: 0.8 },
      surround: { mode: 'hatching', strokes: 4, size: 0.3, reach: 0.5, stroke: 0.7 },
      floor: 'slab',
      grid: { weight: 0.9, strength: 0.35 },
      forest: FOREST_LOOKS.blueprint,
    },
  },
  {
    id: 'night',
    style: {
      direction: 'stone',
      colors: { ink: '#d8d4cc', rock: '#24262b', water: '#2f4656', floor: '#3a3d44', paper: '#1b1d21' },
      strokes: { thin: 0.5, normal: 1.4, thick: 0.9 },
      shadow: { color: '#000000', strength: 0.6 },
      surround: { mode: 'hatching', strokes: 3, size: 0.3, reach: 0.5, stroke: 0.9 },
      floor: 'slab',
      grid: { weight: 1, strength: 0.4 },
      forest: FOREST_LOOKS.night,
    },
  },
  {
    id: 'sepia',
    style: {
      direction: 'engraved',
      colors: { ink: '#3f2614', rock: '#bf9d6c', water: '#9c8c68', floor: '#ecd9b4', paper: '#d8bd8f' },
      strokes: { thin: 0.5, normal: 1.5, thick: 2.2 },
      shadow: { color: '#3f2614', strength: 0.8 },
      surround: { mode: 'hatching', strokes: 4, size: 0.32, reach: 0.55, stroke: 1.1 },
      floor: 'flagstone',
      grid: { weight: 1, strength: 0.45 },
      forest: FOREST_LOOKS.sepia,
    },
  },
  {
    id: 'moss',
    style: {
      direction: 'stone',
      colors: { ink: '#1f2a1b', rock: '#8a9a62', water: '#5d8566', floor: '#dfe2c6', paper: '#aab58a' },
      strokes: { thin: 0.5, normal: 1.5, thick: 0.9 },
      shadow: { color: '#1c2618', strength: 0.55 },
      surround: { mode: 'stonework', strokes: 3, size: 0.45, reach: 0.6, stroke: 0.6 },
      floor: 'cobble',
      weathering: { color: '#5b7a2e', amount: 0.5 },
      grid: { weight: 1, strength: 0.45 },
      forest: FOREST_LOOKS.moss,
    },
  },
  {
    id: 'ice',
    style: {
      direction: 'stone',
      colors: { ink: '#1c3a55', rock: '#a7c7dc', water: '#86bcd9', floor: '#f2f8fb', paper: '#d3e5ef' },
      strokes: { thin: 0.4, normal: 1.3, thick: 0.9 },
      shadow: { color: '#1c3a55', strength: 0.45 },
      surround: { mode: 'hatching', strokes: 2, size: 0.4, reach: 0.55, stroke: 0.8 },
      floor: 'cobble',
      weathering: { color: '#ffffff', amount: 0.6 },
      grid: { weight: 1, strength: 0.4 },
      forest: FOREST_LOOKS.ice,
    },
  },
  {
    id: 'volcanic',
    style: {
      direction: 'stone',
      colors: { ink: '#efe2cf', rock: '#2a2220', water: '#2e3d42', floor: '#4a3d38', paper: '#1d1716' },
      strokes: { thin: 0.5, normal: 1.4, thick: 0.9 },
      shadow: { color: '#000000', strength: 0.6 },
      surround: { mode: 'hatching', strokes: 3, size: 0.3, reach: 0.5, stroke: 0.8 },
      floor: 'cobble',
      weathering: { color: '#0c0908', amount: 0.45 },
      grid: { weight: 1, strength: 0.3 },
      forest: FOREST_LOOKS.volcanic,
    },
  },
  {
    id: 'sandstone',
    style: {
      direction: 'stone',
      colors: { ink: '#4f2f17', rock: '#d5a66b', water: '#5f9e9a', floor: '#f4e3c1', paper: '#e6c590' },
      strokes: { thin: 0.5, normal: 1.4, thick: 0.9 },
      shadow: { color: '#4f2f17', strength: 0.5 },
      surround: { mode: 'bricks', strokes: 3, size: 0.55, reach: 0.55, stroke: 0.7 },
      floor: 'flagstone',
      grid: { weight: 1, strength: 0.45 },
      forest: FOREST_LOOKS.sandstone,
    },
  },
  {
    id: 'sewer',
    style: {
      direction: 'stone',
      colors: { ink: '#1b2016', rock: '#6c7250', water: '#77823f', floor: '#cfcdb0', paper: '#868a6a' },
      strokes: { thin: 0.5, normal: 1.5, thick: 0.9 },
      shadow: { color: '#1b2016', strength: 0.55 },
      surround: { mode: 'bricks', strokes: 3, size: 0.4, reach: 0.5, stroke: 0.6 },
      floor: 'ashlar',
      weathering: { color: '#3f4a1d', amount: 0.45 },
      grid: { weight: 1, strength: 0.45 },
      forest: FOREST_LOOKS.sewer,
    },
  },
  {
    id: 'vellum',
    style: {
      direction: 'stone',
      colors: { ink: '#5e1220', rock: '#e0c9b0', water: '#a9b5b6', floor: '#fbf4e6', paper: '#f0e3cb' },
      strokes: { thin: 0.5, normal: 1.4, thick: 0.9 },
      shadow: { color: '#3a1018', strength: 0.5 },
      surround: { mode: 'hatching', strokes: 3, size: 0.28, reach: 0.45, stroke: 1 },
      floor: 'flagstone',
      grid: { weight: 1, strength: 0.45 },
      forest: FOREST_LOOKS.vellum,
    },
  },
  {
    id: 'slate',
    style: {
      direction: 'stone',
      colors: { ink: '#14181c', rock: '#6f7378', water: '#5f8a8c', floor: '#a4a9ab', paper: '#cfccc0' },
      strokes: { thin: 0.5, normal: 1.4, thick: 0.9 },
      shadow: { color: '#14181c', strength: 0.5 },
      surround: { mode: 'bricks', strokes: 3, size: 0.34, reach: 0.5, stroke: 0.9 },
      floor: 'slab',
      grid: { weight: 1, strength: 0.45 },
      forest: FOREST_LOOKS.slate,
    },
  },
  {
    id: 'contrast',
    style: {
      direction: 'engraved',
      colors: { ink: '#000000', rock: '#000000', water: '#a9bccb', floor: '#ffffff', paper: '#000000' },
      strokes: { thin: 0.5, normal: 1.6, thick: 2.1 },
      shadow: { color: '#000000', strength: 0.8 },
      surround: { mode: 'none', strokes: 3, size: 0.3, reach: 0.6, stroke: 1 },
      floor: 'slab',
      grid: { weight: 1, strength: 0.6 },
      forest: FOREST_LOOKS.contrast,
    },
  },
  {
    id: 'drafting',
    style: {
      direction: 'engraved',
      colors: { ink: '#1b2733', rock: '#e1e6e4', water: '#d3e3e8', floor: '#fbfaf6', paper: '#eceee8' },
      strokes: { thin: 0.45, normal: 1.1, thick: 1.8 },
      shadow: { color: '#1b2733', strength: 0.6 },
      surround: { mode: 'bricks', strokes: 2, size: 0.36, reach: 0.42, stroke: 0.55 },
      floor: 'ashlar',
      grid: { weight: 0.8, strength: 0.4 },
      forest: FOREST_LOOKS.drafting,
    },
  },
];

export const DEFAULT_STYLE_ID: DungeonStyleId = 'crayon';

const BY_ID = new Map(DUNGEON_STYLES.map(entry => [entry.id, entry.style] as const));

export function isDungeonStyleId(value: unknown): value is DungeonStyleId {
  return typeof value === 'string' && BY_ID.has(value as DungeonStyleId);
}

/** The style of an id; the default's for one Atlas does not know. */
export function dungeonStyle(id: string): DungeonStyle {
  return BY_ID.get(id as DungeonStyleId) ?? BY_ID.get(DEFAULT_STYLE_ID)!;
}
