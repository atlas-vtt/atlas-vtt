import { Container, Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import type { AudioSource } from '../../types/audioTypes';
import { destroyTree } from '../utils/destroyTree';
import { levelObjects } from '../../levels/levelObjects';

const ICON_RADIUS = 10;
const HIT_TOLERANCE = 12;
const ICON_COLOR = 0x44AAFF;
const INNER_RING_COLOR = 0x44AAFF;
const OUTER_RING_COLOR = 0x44AAFF;

/**
 * Renders speaker icons and radius rings on the map when the audio tool
 * is active. Only the selected audio source shows its inner/outer rings.
 */
export class AudioRenderer {
  private container: Container;
  private iconGraphics: Graphics;
  private ringGraphics: Graphics;
  private store: StoreApi<ViewAtlasState>;
  private viewport: Viewport;
  private unsubscribers: Array<() => void> = [];
  private visible = false;
  private selectedAudioId: string | null = null;

  constructor(viewport: Viewport, store: StoreApi<ViewAtlasState>) {
    this.viewport = viewport;
    this.store = store;

    this.container = new Container();
    this.container.zIndex = 1050;
    this.container.sortableChildren = true;
    this.container.eventMode = 'none';
    viewport.addChild(this.container);

    this.iconGraphics = new Graphics();
    this.iconGraphics.zIndex = 2;
    this.container.addChild(this.iconGraphics);

    this.ringGraphics = new Graphics();
    this.ringGraphics.zIndex = 1;
    this.container.addChild(this.ringGraphics);

    this.setupSubscriptions();
  }

  /* ------------------------------------------------------------------ */
  /*  Store subscriptions                                                */
  /* ------------------------------------------------------------------ */

  private setupSubscriptions(): void {
    let prevTool = '';
    let prevAudios: Record<string, AudioSource> = {};

    const unsub = this.store.subscribe((state) => {
      const toolChanged = state.activeTool !== prevTool;
      const audiosChanged = levelObjects(state).audios !== prevAudios;

      if (toolChanged) {
        prevTool = state.activeTool;
        const shouldShow = state.activeTool === 'audio';
        if (shouldShow !== this.visible) {
          this.visible = shouldShow;
          this.container.visible = shouldShow;
          if (shouldShow) this.redraw();
        }
      }

      if (audiosChanged && this.visible) {
        prevAudios = levelObjects(state).audios;
        this.redraw();
      }
    });

    this.unsubscribers.push(unsub);
  }

  /* ------------------------------------------------------------------ */
  /*  Drawing                                                            */
  /* ------------------------------------------------------------------ */

  private redraw(): void {
    this.iconGraphics.clear();
    this.ringGraphics.clear();

    const audios = levelObjects(this.store.getState()).audios;

    for (const source of Object.values(audios)) {
      this.drawIcon(source);

      if (source.id === this.selectedAudioId) {
        this.drawRadiusRings(source);
      }
    }
  }

  private drawIcon(source: AudioSource): void {
    // Filled circle background
    this.iconGraphics
      .circle(source.x, source.y, ICON_RADIUS)
      .fill({ color: ICON_COLOR, alpha: 0.9 });

    // Inner speaker symbol
    this.iconGraphics
      .circle(source.x, source.y, ICON_RADIUS * 0.45)
      .stroke({ color: 0xFFFFFF, width: 1.5, alpha: 0.9 });

    // Outer glow ring
    this.iconGraphics
      .circle(source.x, source.y, ICON_RADIUS + 3)
      .stroke({ color: ICON_COLOR, width: 1, alpha: 0.3 });
  }

  private drawRadiusRings(source: AudioSource): void {
    // Inner radius -- solid ring (full-volume zone)
    this.ringGraphics
      .circle(source.x, source.y, source.innerRadius)
      .stroke({ color: INNER_RING_COLOR, width: 2, alpha: 0.6 });

    // Outer radius -- dashed ring (falloff zone)
    const segments = 64;
    const dashRatio = 0.5;
    for (let i = 0; i < segments; i++) {
      if (i % 2 !== 0) continue;
      const startAngle = (i / segments) * Math.PI * 2;
      const endAngle = ((i + dashRatio) / segments) * Math.PI * 2;

      const x1 = source.x + Math.cos(startAngle) * source.outerRadius;
      const y1 = source.y + Math.sin(startAngle) * source.outerRadius;
      const x2 = source.x + Math.cos(endAngle) * source.outerRadius;
      const y2 = source.y + Math.sin(endAngle) * source.outerRadius;

      this.ringGraphics
        .moveTo(x1, y1)
        .lineTo(x2, y2)
        .stroke({ color: OUTER_RING_COLOR, width: 1.5, alpha: 0.35 });
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                         */
  /* ------------------------------------------------------------------ */

  /** Hit-test world coordinates against all audio source icons. */
  hitTestAudioSources(worldX: number, worldY: number): string | null {
    const audios = levelObjects(this.store.getState()).audios;
    const tolSq = HIT_TOLERANCE * HIT_TOLERANCE;

    for (const source of Object.values(audios)) {
      const dx = worldX - source.x;
      const dy = worldY - source.y;
      if (dx * dx + dy * dy <= tolSq) {
        return source.id;
      }
    }

    return null;
  }

  setSelectedAudio(id: string | null): void {
    if (this.selectedAudioId === id) return;
    this.selectedAudioId = id;
    if (this.visible) this.redraw();
  }

  getSelectedAudioId(): string | null {
    return this.selectedAudioId;
  }

  destroy(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
    destroyTree(this.container);
  }
}
