import { buildCircle, Circle, Mesh, MeshGeometry, Sprite } from 'pixi.js';
import { tokenArtBox } from './tokenRingMetrics';
import type { TokenGroupContainer } from './types';

/** The framed art as drawn: the art sprite's texture on the token's circle. */
export const TOKEN_ART_DISC_LABEL = 'tokenArtDisc';

/** Each token's art disc and the token size its geometry was built for. */
const discs = new WeakMap<TokenGroupContainer, { mesh: Mesh<MeshGeometry>; size: number }>();

/**
 * The token's circle, as `Graphics.circle` builds it (`buildCircle`), so its edge is the one a mask
 * of the circle cut, with the framed art's texture laid over the `size` × `size` art box. Batched:
 * a mask is a stencil pass that breaks PIXI's batch, four draw calls per token.
 */
function discGeometry(size: number): MeshGeometry {
  const ring: number[] = [];
  buildCircle.build(new Circle(0, 0, size / 2), ring);
  const count = ring.length / 2;
  const positions = new Float32Array(ring.length + 2);
  positions.set(ring, 2);
  const uvs = positions.map((value) => value / size + 0.5);
  const indices = new Uint32Array(count * 3);
  for (let i = 0; i < count; i++) indices.set([0, i + 1, ((i + 1) % count) + 1], i * 3);
  const geometry = new MeshGeometry({ positions, uvs, indices });
  geometry.batchMode = 'batch';
  return geometry;
}

/** Framed art is drawn by its disc and the sprite only holds texture, size and turn; unframed art is the sprite. */
function syncArtDisc(container: TokenGroupContainer, sprite: Sprite, framed: boolean, size: number): void {
  let disc = discs.get(container);
  sprite.visible = !framed;
  if (!framed) {
    if (disc) disc.mesh.visible = false;
    return;
  }
  if (!disc || disc.mesh.destroyed) {
    const mesh = new Mesh({ geometry: discGeometry(size), texture: sprite.texture, label: TOKEN_ART_DISC_LABEL, eventMode: 'none', zIndex: sprite.zIndex });
    container.addChildAt(mesh, container.getChildIndex(sprite));
    disc = { mesh, size };
    discs.set(container, disc);
  } else if (disc.size !== size) {
    const old = disc.mesh.geometry;
    disc.mesh.geometry = discGeometry(size);
    disc.size = size;
    old.destroy();
  }
  disc.mesh.texture = sprite.texture;
  disc.mesh.rotation = sprite.rotation;
  disc.mesh.visible = true;
}

/** Keep full, unframed artwork proportional when a token is placed or resized. */
export function syncTokenArtwork(container: TokenGroupContainer, size: number): void {
  const sprite = container.getChildByLabel('tokenSprite');
  if (!(sprite instanceof Sprite)) return;
  const framed = container.tokenData?.showRing !== false;
  const glass = container.getChildByLabel('glassOverlay');
  if (glass) glass.visible = framed;
  const box = tokenArtBox(size, container.strokeWidth, framed, sprite.texture.width, sprite.texture.height);
  sprite.width = box.width;
  sprite.height = box.height;
  syncArtDisc(container, sprite, framed, size);
}

/** Fits the artwork to the token again after its texture changed. */
export function fitTokenArtwork(container: TokenGroupContainer): void {
  const size = container.tokenSize;
  if (Number.isFinite(size) && size > 0) syncTokenArtwork(container, size);
}
