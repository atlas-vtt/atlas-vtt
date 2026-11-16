import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { TokenEntity } from '../../../types';
import type { TokenPerception } from '../../../vision/tokenPerception';
import { HIDDEN_TOKEN_ALPHA } from '../../playerSafeFrame';
import { getTokenRingOuterDiameter } from '../../token-renderer/tokenRingMetrics';
import { loadedTokenRingTexture, loadTokenRingTexture } from '../../token-renderer/tokenRingTexture';
import { computeTokenPixelSize, computeTokenStrokeWidth } from '../../token-renderer/tokenSizing';
import { destroyTree } from '../../utils/destroyTree';

/** Token art, shared by the tokens that show it: each holds what it shows (`TextureCache`). */
export interface TokenArt {
  acquire(imagePath: string): Promise<Texture>;
  release(imagePath: string): void;
  destroyAll(): void;
}

interface Shown {
  token: TokenEntity;
  group: Container;
  art: Sprite;
  mask: Graphics;
  ring: Sprite;
  /** The art this token holds, and the load that brings it. */
  path: string;
  load: number;
}

/** How a token below shows in the picture being drawn: not at all, or at an opacity. */
export type BelowTokenLook = { visible: false } | { visible: true; alpha: number };

/** How the tokens below look in a picture: as the players perceive them (`perception`), or as the GM sees them, hidden ones translucent. */
export function tokenLook(perception: TokenPerception | null): (token: TokenEntity) => BelowTokenLook {
  return (token) => {
    if (!perception) return { visible: true, alpha: token.isHidden ? HIDDEN_TOKEN_ALPHA : 1 };
    return perception(token.id) === 'seen' ? { visible: true, alpha: 1 } : { visible: false };
  };
}

/**
 * The tokens of a level below the view, as its picture through the view's openings draws them:
 * their art in its circle with its ring, at its size, turn and place in the order, and nothing else
 * (no name, bars or controls), never hit-tested. Which of them show is the picture's (`show`).
 */
export class BelowTokens {
  readonly view = new Container({ label: 'tokens-below', sortableChildren: true, eventMode: 'none', interactiveChildren: false });
  private readonly shown = new Map<string, Shown>();
  private tokens: Record<string, TokenEntity> | null = null;
  private cellSize = 0;
  private ringScale = 1;
  private loads = 0;

  constructor(private readonly art: TokenArt, private readonly onArt: () => void) {}

  /** Follows the level's tokens; the same record, cell size and ring size (`tokenSettings.tokenRingSize`) again do nothing. */
  sync(tokens: Record<string, TokenEntity>, cellSize: number, ringScale: number): void {
    if (tokens === this.tokens && cellSize === this.cellSize && ringScale === this.ringScale) return;
    const resized = cellSize !== this.cellSize || ringScale !== this.ringScale;
    this.tokens = tokens;
    this.cellSize = cellSize;
    this.ringScale = ringScale;
    for (const [id, shown] of this.shown) {
      if (!tokens[id]) this.remove(id, shown);
    }
    for (const token of Object.values(tokens)) {
      const existing = this.shown.get(token.id);
      // Immer hands out a new token whenever one changes: the others are left as they are.
      if (!existing) this.place(this.add(token), token);
      else if (existing.token !== token || resized) this.place(existing, token);
    }
  }

  /** How every token looks by `look`, as a key: the same key, the same tokens shown alike. */
  lookKey(look: (token: TokenEntity) => BelowTokenLook): string {
    let key = '';
    for (const { token } of this.shown.values()) {
      const decided = look(token);
      key += decided.visible ? `${decided.alpha},` : '-,';
    }
    return key;
  }

  /** Shows each token as `look` says, for the picture about to be drawn. */
  show(look: (token: TokenEntity) => BelowTokenLook): void {
    for (const { token, group } of this.shown.values()) {
      const decided = look(token);
      group.visible = decided.visible;
      if (decided.visible) group.alpha = decided.alpha;
    }
  }

  /** Lets go of every token, and of the art: it is this level's own. */
  destroy(): void {
    for (const [id, shown] of this.shown) this.remove(id, shown);
    destroyTree(this.view);
    this.art.destroyAll();
  }

  private add(token: TokenEntity): Shown {
    const group = new Container({ label: 'token-below' });
    const art = new Sprite(Texture.EMPTY);
    art.anchor.set(0.5);
    const mask = new Graphics();
    art.mask = mask;
    const ring = new Sprite(Texture.EMPTY);
    ring.label = 'token-below-ring';
    ring.anchor.set(0.5);
    group.addChild(mask, art, ring);
    this.view.addChild(group);
    const shown: Shown = { token, group, art, mask, ring, path: '', load: 0 };
    this.shown.set(token.id, shown);
    return shown;
  }

  private place(shown: Shown, token: TokenEntity): void {
    shown.token = token;
    const size = computeTokenPixelSize(this.cellSize, token.size || 1);
    shown.group.position.set(token.x, token.y);
    shown.group.zIndex = token.layer ?? 0;
    shown.art.width = size;
    shown.art.height = size;
    shown.art.rotation = ((token.rotation ?? 0) * Math.PI) / 180;
    shown.mask.clear().circle(0, 0, size / 2).fill({ color: 0xffffff });
    this.drawRing(shown);
    const path = token.imagePath ?? '';
    if (path !== shown.path || shown.load === 0) this.load(shown, path);
  }

  /** The ring the map draws around the token (`SpriteFactory.createTokenRing`): its texture, tinted, white without a colour. */
  private drawRing(shown: Shown): void {
    const { ring, token } = shown;
    const texture = loadedTokenRingTexture();
    ring.visible = token.showRing !== false && texture !== null;
    if (token.showRing === false) return;
    if (!texture) {
      void loadTokenRingTexture().then((loaded) => {
        if (!loaded || ring.destroyed) return;
        this.drawRing(shown);
        this.onArt();
      });
      return;
    }
    const size = computeTokenPixelSize(this.cellSize, token.size || 1) * this.ringScale;
    ring.texture = texture;
    ring.width = ring.height = getTokenRingOuterDiameter(size, computeTokenStrokeWidth(this.cellSize), this.ringScale);
    const tint = Number.parseInt((token.ringColor || '#ffffff').replace('#', ''), 16);
    ring.tint = Number.isFinite(tint) ? tint : 0xffffff;
  }

  /** Takes the art of `path` for the token, letting go of what it held; a later load wins over an earlier one still on its way. */
  private load(shown: Shown, path: string): void {
    if (shown.load !== 0) this.art.release(shown.path);
    shown.path = path;
    const load = ++this.loads;
    shown.load = load;
    void this.art.acquire(path).then((texture) => {
      if (shown.load !== load || shown.art.destroyed) return;
      shown.art.texture = texture;
      // The texture changed the art's size: the token's size again.
      const size = computeTokenPixelSize(this.cellSize, shown.token.size || 1);
      shown.art.width = size;
      shown.art.height = size;
      this.onArt();
    }).catch((error: unknown) => {
      console.warn('[BelowTokens] A token\'s art could not be loaded:', error);
    });
  }

  private remove(id: string, shown: Shown): void {
    this.shown.delete(id);
    if (shown.load !== 0) this.art.release(shown.path);
    shown.load = -1;
    shown.art.mask = null;
    destroyTree(shown.group);
  }
}
