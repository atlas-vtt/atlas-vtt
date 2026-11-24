import { ColorMatrixFilter, Container, Sprite, type ColorMatrix, type Texture, type Ticker } from 'pixi.js';
import type { AnimationPlaybackControls } from 'framer-motion';
import { destroyTree } from '../utils/destroyTree';
import { addFilter, removeFilter } from '../utils/filterList';
import { animateOnTicker } from '../utils/tickerMotion';
import { EASE_OUT_CONTROL_POINTS } from '../../utils/motion';
import { createDownedEmblemTexture, DOWNED_EMBLEM_TEXTURE_SIZE } from './downedEmblemTexture';
import { TOKEN_ART_DISC_LABEL } from './tokenArtwork';
import type { TokenGroupContainer } from './types';

const MARKER_LABEL = 'downedMarker';
/** Above the art, ring and glass; below the hidden-token marker and the instance badge. */
const MARKER_Z_INDEX = 5;
/** The skull settles from this scale as it fades in. */
const MARKER_ENTER_SCALE = 1.15;
/** The skull is a quiet marker: the grey token already says most of it. */
const MARKER_OPACITY = 0.72;
const ENTER_DURATION_S = 0.5;
const EXIT_DURATION_S = 0.35;
/** Token parts that turn grey; the ring is rebuilt on resize, so `refresh` re-applies it. */
const GREYED_PARTS = ['tokenSprite', TOKEN_ART_DISC_LABEL, 'tokenRing'] as const;

/** Luminance greyscale, dimmed and cooled slightly so the creature reads as lifeless. */
const LIFELESS_MATRIX: ColorMatrix = [
  ...greyRow(0.7), 0, 0,
  ...greyRow(0.72), 0, 0,
  ...greyRow(0.76), 0, 0,
  0, 0, 0, 1, 0,
];

function greyRow(brightness: number): [number, number, number] {
  return [0.2126 * brightness, 0.7152 * brightness, 0.0722 * brightness];
}

interface DownedVisual {
  downed: boolean;
  filter: ColorMatrixFilter;
  marker: Container;
  /** 0 is alive, 1 fully downed. */
  progress: number;
  animation: AnimationPlaybackControls | null;
}

/**
 * Greys out tokens at 0 hit points and marks them with a skull. Going down and being
 * healed ease in and out; a token that loads already downed shows the state at once.
 * Every marker shares one emblem texture, created on first use.
 */
export class DownedTokenOverlay {
  private texture: Texture | null = null;
  private readonly visuals = new Map<TokenGroupContainer, DownedVisual>();

  /**
   * `requestRender` must draw a frame: filter strength is invisible to the render scheduler.
   * Animations step on the ticker `getTicker` returns; without one every change is instant.
   */
  constructor(private readonly requestRender: () => void, private readonly getTicker: () => Ticker | null) {}

  public update(tokenGroup: TokenGroupContainer, downed: boolean, animate: boolean): void {
    const existing = this.visuals.get(tokenGroup);
    if (!existing && !downed) return;
    const visual = existing ?? this.createVisual(tokenGroup);
    this.refresh(tokenGroup);
    if (visual.downed === downed) return;

    visual.downed = downed;
    visual.animation?.stop();
    visual.animation = null;
    const target = downed ? 1 : 0;
    const onDone = downed ? undefined : (): void => this.release(tokenGroup);
    const ticker = animate ? this.getTicker() : null;
    if (!ticker) {
      this.applyProgress(visual, target);
      onDone?.();
      return;
    }
    visual.animation = animateOnTicker(ticker, visual.progress, target, {
      duration: downed ? ENTER_DURATION_S : EXIT_DURATION_S,
      ease: [...EASE_OUT_CONTROL_POINTS],
      onUpdate: (progress) => this.applyProgress(visual, progress),
      ...(onDone && { onComplete: onDone }),
    });
  }

  /** Re-applies the grey to rebuilt token parts and fits the skull to the token size. */
  public refresh(tokenGroup: TokenGroupContainer): void {
    const visual = this.visuals.get(tokenGroup);
    if (!visual) return;
    for (const label of GREYED_PARTS) {
      const part = tokenGroup.getChildByLabel(label);
      if (part) addFilter(part, visual.filter);
    }
    const emblem = visual.marker.children[0];
    emblem?.scale.set((tokenGroup.tokenSize || 70) / DOWNED_EMBLEM_TEXTURE_SIZE);
    this.requestRender();
  }

  /** Removes the grey and the skull, e.g. before the token group is destroyed. */
  public release(tokenGroup: TokenGroupContainer): void {
    const visual = this.visuals.get(tokenGroup);
    if (!visual) return;
    this.visuals.delete(tokenGroup);
    visual.animation?.stop();
    for (const label of GREYED_PARTS) {
      const part = tokenGroup.getChildByLabel(label);
      if (part) removeFilter(part, visual.filter);
    }
    visual.filter.destroy();
    destroyTree(visual.marker);
    this.requestRender();
  }

  public destroy(): void {
    for (const tokenGroup of [...this.visuals.keys()]) this.release(tokenGroup);
    this.texture?.destroy(true);
    this.texture = null;
  }

  private createVisual(tokenGroup: TokenGroupContainer): DownedVisual {
    const filter = new ColorMatrixFilter({ resolution: 'inherit' });
    filter.matrix = LIFELESS_MATRIX;
    const marker = new Container({ label: MARKER_LABEL, zIndex: MARKER_Z_INDEX, eventMode: 'none', interactiveChildren: false });
    const texture = this.getTexture();
    if (texture) marker.addChild(new Sprite({ texture, anchor: 0.5, eventMode: 'none' }));
    tokenGroup.addChild(marker);
    tokenGroup.sortChildren();

    const visual: DownedVisual = { downed: false, filter, marker, progress: 0, animation: null };
    this.applyProgress(visual, 0);
    this.visuals.set(tokenGroup, visual);
    return visual;
  }

  private applyProgress(visual: DownedVisual, progress: number): void {
    visual.progress = progress;
    if (visual.marker.destroyed) return;
    visual.filter.alpha = progress;
    visual.marker.alpha = progress * MARKER_OPACITY;
    visual.marker.scale.set(MARKER_ENTER_SCALE - (MARKER_ENTER_SCALE - 1) * progress);
    this.requestRender();
  }

  private getTexture(): Texture | null {
    if (this.texture) return this.texture;
    try {
      this.texture = createDownedEmblemTexture();
    } catch (error) {
      // Without the emblem the token still greys out
      console.error('[DownedTokenOverlay] Failed to draw the skull emblem:', error);
    }
    return this.texture;
  }
}
