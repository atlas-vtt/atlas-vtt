/**
 * Dice in a colour of their own: the dice a dice set colours ("Sun" in gold).
 *
 * A coloured die is its kind's body with other faces. It shares the kind's
 * geometry and relief, and paints only its albedo, the way accent dice are
 * painted: the colour under the card's grain, with the numerals in the ink
 * that reads on it. That atlas is the whole cost of a colour (2 to 8.3 MB of
 * graphics memory per kind of die and colour, mipmaps included), so it is made
 * for the colours dice are really rolled in, and only the last `KEPT` of them
 * stay while no stage shows them; one a stage shows is never let go.
 */

import * as THREE from 'three';

import { buildColouredMap, diceArtworkReady, loadDiceArtwork } from './dieArtwork';
import { parseHex } from './diceLook';
import type { DieSides } from './dieGeometry';
import { activeLook, resolveLook, type ResolvedLook } from './dieSkin';

/** What a coloured die shares with its kind: the body and the relief. */
export interface ColourableAssets {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshPhysicalMaterial;
  redraw: () => void;
}

/** Coloured atlases kept while no stage shows them, the most recently thrown first to stay. */
const KEPT = 8;

interface ColouredEntry {
  assets: ColourableAssets;
  /** Stages that show it now. */
  users: number;
  /** When it was last asked for; the oldest unused go first. */
  used: number;
}

const coloured = new Map<string, ColouredEntry>();
/** Materials of coloured dice let go: a ghost trail drops the copies it keeps of them. */
const retired = new WeakSet<THREE.Material>();
let clock = 0;

const keyOf = (sides: DieSides, colour: string): string => `${sides}|${colour.toLowerCase()}`;

/** A coloured look as accent dice have it, in the active look's font. */
function colouredLook(colour: string): ResolvedLook {
  return resolveLook({ colour: 'accent', font: activeLook().font }, parseHex(colour));
}

/** The assets of a die of `sides` in `colour`, sharing `plain`'s body and relief. */
export function colouredAssets(plain: ColourableAssets, sides: DieSides, colour: string): ColourableAssets {
  const key = keyOf(sides, colour);
  const known = coloured.get(key);
  if (known) {
    known.used = ++clock;
    return known.assets;
  }
  const textures = buildColouredMap(sides, () => colouredLook(colour));
  const material = plain.material.clone();
  material.map = textures.map;
  const assets: ColourableAssets = { geometry: plain.geometry, material, redraw: textures.redraw };
  coloured.set(key, { assets, users: 0, used: ++clock });
  // Faces painted before the artwork arrived are painted once more when it does.
  const font = activeLook().font;
  if (!diceArtworkReady(font)) void loadDiceArtwork(font).then(() => assets.redraw());
  trim();
  return assets;
}

/** A stage shows these dice now; `releaseColoured` when it shows others. */
export function retainColoured(assets: readonly ColourableAssets[]): void {
  for (const entry of entriesOf(assets)) entry.users += 1;
}

export function releaseColoured(assets: readonly ColourableAssets[]): void {
  for (const entry of entriesOf(assets)) entry.users = Math.max(0, entry.users - 1);
  trim();
}

/** Whether `material` belonged to a coloured die that was let go. */
export function isRetired(material: THREE.Material): boolean {
  return retired.has(material);
}

/** Repaints the coloured faces, of one kind of die or all: the artwork arrived or the look's font changed. */
export function refreshColouredDice(sides?: DieSides): void {
  for (const [key, entry] of coloured) {
    if (sides === undefined || key.startsWith(`${sides}|`)) entry.assets.redraw();
  }
}

/** How many coloured atlases are held now; for the tests that measure the cost. */
export function colouredAtlasCount(): number {
  return coloured.size;
}

function entriesOf(assets: readonly ColourableAssets[]): ColouredEntry[] {
  return [...coloured.values()].filter((entry) => assets.includes(entry.assets));
}

/** Lets go of the oldest coloured atlases no stage shows, beyond the `KEPT` newest. */
function trim(): void {
  const idle = [...coloured.entries()].filter(([, entry]) => entry.users === 0).sort(([, a], [, b]) => b.used - a.used);
  for (const [key, entry] of idle.slice(KEPT)) {
    coloured.delete(key);
    retired.add(entry.assets.material);
    entry.assets.material.map?.dispose();
    entry.assets.material.dispose();
  }
}
