import { Assets, Sprite, Texture, type Container } from 'pixi.js';
import bowImageUrl from '../../assets/token-bow.webp';
import nailsImageUrl from '../../assets/token-nails.webp';
import cupImageUrl from '../../assets/token-cup.webp';
import { destroyTree } from '../utils/destroyTree';
import { getTokenRingOuterDiameter } from './tokenRingMetrics';
import type { TokenGroupContainer } from './types';

/** A hand-painted prop every yassified token wears, placed on its ring. */
interface Prop {
  label: string;
  url: string;
  /** Where on the ring it sits, in degrees: 0 is the right, 90 the bottom. */
  angle: number;
  /** How far out, as a share of the ring's radius. */
  reach: number;
  /** Its width as a share of the ring's outer diameter. */
  width: number;
  /** Its tilt in radians. */
  tilt: number;
}

/**
 * The bow pinned on top right, a manicured hand raised straight up from the bottom left as the yassified emoji holds
 * it, and the tumbler held on the bottom right.
 */
const PROPS: readonly Prop[] = [
  { label: 'tokenBow', url: bowImageUrl, angle: -45, reach: 0.86, width: 0.55, tilt: 0.3 },
  { label: 'tokenNails', url: nailsImageUrl, angle: 126, reach: 0.84, width: 0.36, tilt: 0 },
  { label: 'tokenCup', url: cupImageUrl, angle: 40, reach: 0.9, width: 0.36, tilt: 0.12 },
];
/** Above the art, ring and glass, below the downed skull and the hidden-token marker. */
const PROP_Z_INDEX = 4;

// Loaded once per app session and shared by every token, like the ring's texture.
const loaded = new Map<string, Texture>();
let pendingLoad: Promise<boolean> | null = null;

/** Loads every prop's texture; true once all are there. */
function loadPropTextures(): Promise<boolean> {
  if (loaded.size === PROPS.length) return Promise.resolve(true);
  pendingLoad ??= Promise.all(PROPS.map(async ({ url }) => {
    const texture = await Assets.load<Texture>({ src: url, parser: 'texture', data: { autoGenerateMipmaps: true, scaleMode: 'linear' } });
    if (texture instanceof Texture && texture !== Texture.EMPTY) loaded.set(url, texture);
  }))
    .then(() => loaded.size === PROPS.length)
    .catch((error: unknown) => {
      console.error('[TokenYassify] Failed to load the props\' textures:', error);
      return false;
    })
    .finally(() => { pendingLoad = null; });
  return pendingLoad;
}

/**
 * Yassify (Appearance settings): every token wears a bow, raises a hand to show off its nails and holds a tumbler,
 * upright whichever way the token turns and sized by its ring. The props are children of the token's group, so they
 * move, hide and go with their token, in the player window too. Every token shares the three textures.
 */
export class TokenYassify {
  private readonly waiting = new Set<TokenGroupContainer>();

  /** `requestRender` must draw a frame: textures arriving after their tokens are invisible to the render scheduler. */
  constructor(private readonly requestRender: () => void) {}

  /** Dresses `tokenGroup` while `on`, takes the props off otherwise. */
  public update(tokenGroup: TokenGroupContainer, on: boolean): void {
    if (!on) {
      this.waiting.delete(tokenGroup);
      for (const { label } of PROPS) {
        const prop = tokenGroup.getChildByLabel(label);
        if (prop) destroyTree(prop);
      }
      return;
    }
    if (tokenGroup.getChildByLabel(PROPS[0]!.label)) return;
    if (loaded.size < PROPS.length) {
      this.waitForTextures(tokenGroup);
      return;
    }
    for (const { label, url } of PROPS) {
      tokenGroup.addChild(new Sprite({ texture: loaded.get(url)!, anchor: 0.5, label, zIndex: PROP_Z_INDEX, eventMode: 'none' }));
    }
    tokenGroup.sortChildren();
    this.refresh(tokenGroup);
  }

  /** Places the props again for the ring's size, after the ring was rebuilt. */
  public refresh(tokenGroup: TokenGroupContainer): void {
    const radius = ringDiameter(tokenGroup) / 2;
    for (const { label, angle, reach, width, tilt } of PROPS) {
      const prop = tokenGroup.getChildByLabel(label) as Sprite | null;
      if (!prop) continue;
      const radians = (angle * Math.PI) / 180;
      prop.position.set(Math.cos(radians) * radius * reach, Math.sin(radians) * radius * reach);
      prop.rotation = tilt;
      prop.scale.set((2 * radius * width) / prop.texture.width);
    }
  }

  /** Forgets a token group that is going away. */
  public release(tokenGroup: TokenGroupContainer): void {
    this.waiting.delete(tokenGroup);
  }

  private waitForTextures(tokenGroup: TokenGroupContainer): void {
    const first = this.waiting.size === 0;
    this.waiting.add(tokenGroup);
    if (!first) return;
    void loadPropTextures().then((ready) => {
      const groups = Array.from(this.waiting);
      this.waiting.clear();
      if (!ready) return;
      for (const group of groups) if (!group.destroyed) this.update(group, true);
      this.requestRender();
    });
  }
}

/** The ring's outer diameter, or where it would be on a token without one. */
function ringDiameter(tokenGroup: TokenGroupContainer): number {
  const ring: Container | null = tokenGroup.getChildByLabel('tokenRing');
  return ring && ring.width > 0 ? ring.width : getTokenRingOuterDiameter(tokenGroup.tokenSize, tokenGroup.strokeWidth);
}
