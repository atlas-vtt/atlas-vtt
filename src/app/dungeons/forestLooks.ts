import type { DungeonStyleId } from './styleCatalog';
import type { ForestLook } from './style';

/**
 * Every look's forest, each of its own mood (`ForestLook`). The ink looks keep to their pigments;
 * their colours here only tint the woods' vellum and the water.
 */
export const FOREST_LOOKS: Readonly<Record<DungeonStyleId, ForestLook>> = {
  // Summer woods in wax crayon (the crayon painter keeps its own crayons; these are its tones).
  crayon: { woods: '#94ab84', canopy: { lit: '#7fa35a', mid: '#5c8a3f', deep: '#3f6d4c' }, conifers: 0, bare: 0, bark: '#4a3524', ground: '#e9dfc0', grass: '#a8a348', path: '#93805d', water: '#5d94b8' },
  // An old illustrated summer wood, warm and golden.
  parchment: { woods: '#5f6b45', canopy: { lit: '#a9b878', mid: '#7b8f52', deep: '#4f6338' }, conifers: 0.2, bare: 0.03, bark: '#4a3826', ground: '#dcd3a8', grass: '#a6ad6c', path: '#b39a6e', water: '#7d9c96' },
  // A temperate mixed wood, cool and grey-green, many firs.
  masonry: { woods: '#46584a', canopy: { lit: '#9db58a', mid: '#6b8a63', deep: '#3f5a44' }, conifers: 0.45, bare: 0.03, bark: '#3e3a33', ground: '#c9cfb3', grass: '#93a77c', path: '#a69c86', water: '#7896a0' },
  print: { woods: '#dadada', canopy: { lit: '#ffffff', mid: '#e8e8e8', deep: '#c8c8c8' }, conifers: 0.3, bare: 0.05, bark: '#111111', ground: '#ffffff', grass: '#e3e3e3', path: '#cfcfcf', water: '#d4dde3' },
  stipple: { woods: '#d2cfc6', canopy: { lit: '#f6f4ef', mid: '#dedad1', deep: '#bdb8ad' }, conifers: 0.35, bare: 0.05, bark: '#2b2b2b', ground: '#f6f4ef', grass: '#dcd8cc', path: '#c9c3b6', water: '#cdd3d4' },
  blueprint: { woods: '#163f86', canopy: { lit: '#5b8ad0', mid: '#2f63b4', deep: '#1d4b98' }, conifers: 0.4, bare: 0.05, bark: '#e8f0ff', ground: '#2a5db0', grass: '#3a6fc0', path: '#5c86c9', water: '#7ea6de' },
  // A dark wood by night: black-green firs, dead trees among them, the ground in shadow.
  night: { woods: '#0f1a1c', canopy: { lit: '#3f5d55', mid: '#26403b', deep: '#142624' }, conifers: 0.55, bare: 0.15, bark: '#1a1612', ground: '#2c3530', grass: '#38463a', path: '#4a4638', water: '#1d3442' },
  // An autumn wood in sepia.
  sepia: { woods: '#6e4f33', canopy: { lit: '#f0d9b0', mid: '#d8b585', deep: '#b08a5c' }, conifers: 0.15, bare: 0.1, bark: '#3b2716', ground: '#f3e2c2', grass: '#e2cb9c', path: '#cdb08a', water: '#c9b99a' },
  // An ancient haunted wood: moss over everything, dead trees, still dark water.
  moss: { woods: '#1f2a1c', canopy: { lit: '#6f8a4a', mid: '#4a6234', deep: '#2c3d22' }, conifers: 0.25, bare: 0.2, bark: '#2a241b', ground: '#5f6a44', grass: '#76844e', path: '#6b5f45', water: '#3f5246' },
  // A snowbound wood: firs with snow on their crowns, bare birches, cold water.
  ice: { woods: '#4d5f63', canopy: { lit: '#eef4f6', mid: '#4f6b66', deep: '#2f4744' }, conifers: 0.85, bare: 0.12, bark: '#3a3330', ground: '#e7edf0', grass: '#cfdbe0', path: '#b9c3c6', water: '#8fb4c7' },
  // A burnt wood: charred snags over the last brown crowns, the ground ash.
  volcanic: { woods: '#1c1715', canopy: { lit: '#6b5a3a', mid: '#45392a', deep: '#261f1a' }, conifers: 0.3, bare: 0.6, bark: '#141010', ground: '#4b4440', grass: '#5e5243', path: '#6e5f52', water: '#2f3b40' },
  // A dry wood in autumn: ochre and amber crowns over parched grass.
  sandstone: { woods: '#6b4a22', canopy: { lit: '#e0b25a', mid: '#b9832f', deep: '#7f541d' }, conifers: 0.1, bare: 0.08, bark: '#4a3218', ground: '#e3cf9a', grass: '#c9b06a', path: '#b8926a', water: '#6f9aa0' },
  // A bog: sickly olive crowns, drowned dead trees, murky water.
  sewer: { woods: '#252b1c', canopy: { lit: '#8a9150', mid: '#5e6638', deep: '#3a4024' }, conifers: 0.2, bare: 0.3, bark: '#2d2a1f', ground: '#5d6040', grass: '#6f7444', path: '#5a5038', water: '#4a5536' },
  // Crimson autumn: maples in red over pale grass.
  vellum: { woods: '#3e2421', canopy: { lit: '#d16a4a', mid: '#a3392f', deep: '#6b2421' }, conifers: 0.15, bare: 0.08, bark: '#2e1c17', ground: '#e2d0ad', grass: '#c6b07c', path: '#a88466', water: '#6e8c93' },
  // A misty pine wood in grey-green.
  slate: { woods: '#323c39', canopy: { lit: '#8fa39a', mid: '#5d7068', deep: '#3a4a45' }, conifers: 0.8, bare: 0.05, bark: '#2c2a28', ground: '#adb3a6', grass: '#949e8f', path: '#8f8a7e', water: '#6f8a92' },
  contrast: { woods: '#1a1a1a', canopy: { lit: '#ffffff', mid: '#e0e0e0', deep: '#bdbdbd' }, conifers: 0.3, bare: 0.05, bark: '#111111', ground: '#ffffff', grass: '#e6e6e6', path: '#cccccc', water: '#d0d8de' },
  drafting: { woods: '#5a6470', canopy: { lit: '#ffffff', mid: '#e7eaee', deep: '#c9ced5' }, conifers: 0.5, bare: 0, bark: '#2a3440', ground: '#ffffff', grass: '#e9ecef', path: '#cfd5dc', water: '#cfdbe6' },
};

/** A style's forest: its own, else the old illustrated summer wood's (a style made outside the catalogue). */
export function forestLookOf(style: { forest?: ForestLook }): ForestLook {
  return style.forest ?? FOREST_LOOKS.parchment;
}
