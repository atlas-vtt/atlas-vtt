import type { ViewPlayback } from '../../liquids/viewLiquids';
import type { MapVideoMode } from '../../mosaicCanvas/video/mapVideoPlayback';
import { frameTime } from '../../utils/animationFrames';
import { EffectClock } from './effectMotion';
import type { EffectDetail } from './effectShader';
import type { MeasureEffectMesh } from './MeasureEffectMesh';

/**
 * The effects of the measured areas a view shows, played together on one clock by the rules its
 * liquids move by (`ViewPlayback`, `setMode`): `play` moves them as often as the quality lets
 * liquids move while one is in view, `pause` holds the moment shown, `poster` shows each on its
 * still picture (maps not animated, reduced motion). The view's ticker is asked only while there
 * is an effect, and a render only when a frame is due. Without a playback (a view that plays
 * nothing, a renderer without WebGL) no effect is drawn at all: `drawable` says so, and the areas
 * keep their plain wash.
 */
export class AreaEffects {
  private readonly meshes = new Set<MeasureEffectMesh>();
  private readonly clock = new EffectClock();
  private mode: MapVideoMode = 'pause';
  private shownDetail: EffectDetail;
  private ticking = false;

  constructor(private readonly playback: ViewPlayback | null = null) {
    this.shownDetail = playback?.detail() ?? 2;
  }

  get drawable(): boolean {
    return this.playback?.drawable ?? false;
  }

  /** How much of its look a new effect draws: the quality's, as every effect shown. */
  get detail(): EffectDetail {
    return this.shownDetail;
  }

  /** Whether the view's ticker is asked now; for tests. */
  get playing(): boolean {
    return this.ticking;
  }

  /** Plays `mesh` with the others, from the moment they show. */
  add(mesh: MeasureEffectMesh): void {
    mesh.setStill(this.mode === 'poster');
    mesh.setTime(this.clock.seconds);
    this.meshes.add(mesh);
    this.listen();
  }

  remove(mesh: MeasureEffectMesh): void {
    this.meshes.delete(mesh);
    this.listen();
  }

  setMode(mode: MapVideoMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.clock.hold();
    for (const mesh of this.meshes) mesh.setStill(mode === 'poster');
    if (this.meshes.size > 0) this.playback?.requestRender();
  }

  /** Shows every effect on its still picture for one picture of the scene (a thumbnail); returns what puts the moment shown back. */
  stillFor(): () => void {
    for (const mesh of this.meshes) mesh.setStill(true);
    return (): void => {
      for (const mesh of this.meshes) mesh.setStill(this.mode === 'poster');
    };
  }

  destroy(): void {
    this.meshes.clear();
    this.listen();
  }

  /** The ticker is asked while there is an effect to play, and at no other time. */
  private listen(): void {
    const wanted = this.playback !== null && this.meshes.size > 0;
    if (wanted === this.ticking) return;
    this.ticking = wanted;
    if (wanted) this.playback?.ticker.add(this.tick);
    else this.playback?.ticker.remove(this.tick);
    this.clock.hold();
  }

  private readonly tick = (): void => {
    const playback = this.playback;
    if (!playback) return;
    const detail = playback.detail();
    if (detail !== this.shownDetail) {
      this.shownDetail = detail;
      for (const mesh of this.meshes) mesh.update({ detail });
      playback.requestRender();
    }
    if (this.mode !== 'play') return;
    // An effect whose body is hidden (a measurement the canvas does not show now) is not seen either.
    const seen = [...this.meshes].filter((mesh) => mesh.view.parent?.visible !== false && playback.inView(mesh.bounds));
    if (seen.length === 0) {
      this.clock.hold();
      return;
    }
    if (!this.clock.tick(frameTime(playback.ticker), playback.fps())) return;
    for (const mesh of seen) mesh.setTime(this.clock.seconds);
    playback.requestRender();
  };
}
