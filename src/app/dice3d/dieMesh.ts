/**
 * The chamfered body of each die and its material, built once per kind of die
 * and shared by every die of that kind.
 */

import * as THREE from 'three';

import { atlasLayout } from './atlasCell';
import { buildTextures, diceArtworkReady, loadDiceArtwork, type DieTextures } from './dieArtwork';
import { parseHex, readableInk } from './diceLook';
import { bodySides, type DieBody } from './dieBody';
import { dieGeometry, type DieSides } from './dieGeometry';
import { activeLook, type ResolvedLook } from './dieSkin';
import { FACE_CELL_REACH, faceFrame } from './faceFrame';
import { vAdd, vCross, vDot, vNormalize, vScale, vSub, type Vec3 } from './vectorMath';

/** How far each face is pulled in towards the chamfer. */
const CHAMFER = 0.105;

export interface DieAssets {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshPhysicalMaterial;
  redraw: () => void;
}

/** One set of textures and mesh per body (the d100's tens die has its own); dice of the same kind share it. */
const assetCache = new Map<DieBody, DieAssets>();

type Uv = [number, number];

/** Centre of atlas cell `index` in UV coordinates (V points up). */
export function cellCenter(sides: DieSides, index: number): Uv {
  const { cols, rows } = atlasLayout(sides);
  const col = index % cols;
  const row = Math.floor(index / cols);
  return [(col + 0.5) / cols, 1 - (row + 0.5) / rows];
}

/**
 * The body with chamfers: every face is pulled in a little towards its
 * centroid, and the gaps between are filled with narrow strips (edges) and
 * small caps (corners). All unindexed, so `computeVertexNormals` yields exactly
 * the hard facets a ground edge needs. A real bevel catches the light
 * differently from the face at every turn, where a lighter tone would not.
 */
export function chamferedGeometry(sides: DieSides): THREE.BufferGeometry {
  const die = dieGeometry(sides);
  const positions: number[] = [];
  const uvs: number[] = [];
  const blank = cellCenter(sides, sides);

  // Inset corners per face, plus the UV mapping into the face's cell.
  const inset: Vec3[][] = [];
  const insetUv: Uv[][] = [];
  const { cols, rows } = atlasLayout(sides);
  for (let f = 0; f < die.faces.length; f++) {
    const frame = faceFrame(die, f);
    const [cu, cv] = cellCenter(sides, f);
    const face = die.faces[f]!;
    inset.push(
      face.map((vi) => {
        const v = die.vertices[vi]!;
        return vAdd(v, vScale(vSub(frame.center, v), CHAMFER));
      }),
    );
    insetUv.push(
      face.map((vi): Uv => {
        const d = vSub(die.vertices[vi]!, frame.center);
        const s = FACE_CELL_REACH / frame.reach;
        return [cu + (vDot(d, frame.right) * s) / cols, cv + (vDot(d, frame.up) * s) / rows];
      }),
    );
  }

  const pushTriangle = (a: Vec3, b: Vec3, c: Vec3, ua: Uv, ub: Uv, uc: Uv, outward: Vec3): void => {
    // Secure the winding: the face must point outwards, not into the body.
    const flip = vDot(vCross(vSub(b, a), vSub(c, a)), outward) < 0;
    const order = flip ? [a, c, b] : [a, b, c];
    const uvOrder = flip ? [ua, uc, ub] : [ua, ub, uc];
    for (const p of order) positions.push(p[0], p[1], p[2]);
    for (const uv of uvOrder) uvs.push(uv[0], uv[1]);
  };

  // 1. The faces themselves, as a fan around the first corner.
  for (let f = 0; f < die.faces.length; f++) {
    const corners = inset[f]!;
    const cornerUvs = insetUv[f]!;
    for (let k = 1; k < corners.length - 1; k++) {
      pushTriangle(
        corners[0]!,
        corners[k]!,
        corners[k + 1]!,
        cornerUvs[0]!,
        cornerUvs[k]!,
        cornerUvs[k + 1]!,
        die.normals[f]!,
      );
    }
  }

  // 2. The edges: every two neighbouring faces leave a strip between them.
  const edges = new Map<string, { face: number; a: number; b: number }[]>();
  for (let f = 0; f < die.faces.length; f++) {
    const face = die.faces[f]!;
    for (let i = 0; i < face.length; i++) {
      const a = face[i]!;
      const b = face[(i + 1) % face.length]!;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const list = edges.get(key) ?? [];
      list.push({ face: f, a, b });
      edges.set(key, list);
    }
  }
  for (const pair of edges.values()) {
    if (pair.length !== 2) continue;
    const e1 = pair[0]!;
    const e2 = pair[1]!;
    const insetAt = (face: number, vertex: number): Vec3 => inset[face]![die.faces[face]!.indexOf(vertex)]!;
    const p1a = insetAt(e1.face, e1.a);
    const p1b = insetAt(e1.face, e1.b);
    const p2a = insetAt(e2.face, e1.a);
    const p2b = insetAt(e2.face, e1.b);
    const out = vNormalize(vAdd(die.normals[e1.face]!, die.normals[e2.face]!));
    pushTriangle(p1a, p1b, p2b, blank, blank, blank, out);
    pushTriangle(p1a, p2b, p2a, blank, blank, blank, out);
  }

  // 3. The corners: three or more chamfers meet there in a cap.
  for (let vi = 0; vi < die.vertices.length; vi++) {
    const around: Vec3[] = [];
    for (let f = 0; f < die.faces.length; f++) {
      const at = die.faces[f]!.indexOf(vi);
      if (at >= 0) around.push(inset[f]![at]!);
    }
    if (around.length < 3) continue;
    const axis = vNormalize(die.vertices[vi]!);
    const e1 = vNormalize(vCross(axis, Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
    const e2 = vCross(axis, e1);
    around.sort((p, q) => Math.atan2(vDot(p, e2), vDot(p, e1)) - Math.atan2(vDot(q, e2), vDot(q, e1)));
    for (let k = 1; k < around.length - 1; k++) {
      pushTriangle(around[0]!, around[k]!, around[k + 1]!, blank, blank, blank, axis);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

export function dieAssets(body: DieBody): DieAssets {
  const cached = assetCache.get(body);
  if (cached !== undefined) return cached;

  const textures = buildTextures(body);
  // **Card has no gloss.** This used to be polished wood with a lacquer coat
  // and gilded, i.e. metallic, numerals: three controls that all did the same
  // thing, reflect. Paper does not reflect. What remains is a dull surface with
  // grain, and the whole form comes from the light.
  const material = new THREE.MeshPhysicalMaterial({
    map: textures.map,
    bumpMap: textures.bumpMap,
    bumpScale: 1.5,
    roughness: 0.92,
    metalness: 0,
    envMapIntensity: 0.2,
  });

  const assets: DieAssets = {
    geometry: chamferedGeometry(bodySides(body)),
    material,
    redraw: textures.redraw,
  };
  assetCache.set(body, assets);
  // Faces painted before their artwork arrived are painted once more when it does.
  // Only then: repainting means drawing every cell again and uploading the atlas anew.
  const font = activeLook().font;
  if (!diceArtworkReady(font)) void loadDiceArtwork(font).then(() => assets.redraw());
  return assets;
}

/** Redraws the faces of every cached body, or of one: when the artwork arrives or the look changes. */
export function refreshDieArtwork(body?: DieBody): void {
  if (body !== undefined) {
    assetCache.get(body)?.redraw();
    return;
  }
  for (const assets of assetCache.values()) assets.redraw();
  for (const assets of variantCache.values()) assets.redraw();
}

/** A look a die is painted in other than the active one (a collection's, `dice.useLook`), named by `key`. */
export interface LookVariant {
  /** Changes whenever `look` would paint differently. */
  key: string;
  look: () => ResolvedLook;
}

/** How many bodies painted in another look or colour are kept; the one used longest ago goes first. */
const MAX_VARIANTS = 32;

interface VariantAssets extends DieAssets {
  textures: DieTextures;
}

/** Bodies painted in another look or in a die's colour, by look, body and colour; each its own atlas and material. */
const variantCache = new Map<string, VariantAssets>();

/** `look` with its body in `tint` (`#rrggbb`) and numerals that read on it; a look's art stays as it is. */
export function tintedLook(look: ResolvedLook, tint: string | null): ResolvedLook {
  const rgb = tint === null ? null : parseHex(tint);
  return rgb ? { ...look, body: tint, ink: readableInk(rgb) } : look;
}

function disposeVariant(assets: VariantAssets): void {
  assets.material.dispose();
  assets.textures.map.dispose();
  assets.textures.bumpMap.dispose();
}

/**
 * The body painted in `variant` (null: the active look) and coloured `tint` (null: its own colour). Without either
 * it is `dieAssets(body)` itself, shared by every die of that kind. Otherwise the body shares its geometry and gets
 * its own atlas, relief and material, cached per look, body and colour (at most `MAX_VARIANTS`), redrawn with the
 * shared ones and given back with the stage pools.
 */
export function dieVariantAssets(body: DieBody, variant: LookVariant | null, tint: string | null): DieAssets {
  if (variant === null && tint === null) return dieAssets(body);
  const key = `${variant?.key ?? ''}|${body}|${tint ?? ''}`;
  const cached = variantCache.get(key);
  if (cached) {
    variantCache.delete(key);
    variantCache.set(key, cached);
    return cached;
  }
  const lookOf = (): ResolvedLook => tintedLook(variant ? variant.look() : activeLook(), tint);
  const base = dieAssets(body);
  const textures = buildTextures(body, lookOf);
  const material = base.material.clone();
  material.map = textures.map;
  material.bumpMap = textures.bumpMap;
  const assets: VariantAssets = { geometry: base.geometry, material, redraw: textures.redraw, textures };
  variantCache.set(key, assets);
  for (const [oldKey, old] of variantCache) {
    if (variantCache.size <= MAX_VARIANTS) break;
    variantCache.delete(oldKey);
    disposeVariant(old);
  }
  const font = lookOf().font;
  if (!diceArtworkReady(font)) void loadDiceArtwork(font).then(() => { if (variantCache.get(key) === assets) assets.redraw(); });
  return assets;
}

/** Gives back every body painted in another look or colour: the stage pools are released. */
export function releaseDieVariants(): void {
  for (const assets of variantCache.values()) disposeVariant(assets);
  variantCache.clear();
}
