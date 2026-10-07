/**
 * Other people's lasers in an Atlas view, drawn like the GM's own (`LaserBeam`, or
 * `CanvasLaserBeam` without a GPU) at the default size, and fading the same way. An extension
 * shows them through the view's `LaserHub` (`lasers.show`). The ticker runs only while a laser is on screen.
 */
import { Container, type Ticker } from 'pixi.js';
import { DEFAULT_LASER_POINTER_SETTINGS } from '../../tools/laserPointerSettings';
import { destroyTree } from '../utils/destroyTree';
import type { LaserBeamView } from './LaserBeam';
import { beamWidth } from './laserBeamGeometry';
import type { LaserHub } from './LaserHub';
import { RemoteLasers } from './remoteLasers';

export interface RemoteLaserRendererOptions {
  ticker: Pick<Ticker, 'add' | 'remove'>;
  /** The viewport's scale now. */
  zoom(): number;
  createBeam(): LaserBeamView;
  hub: LaserHub;
  /** Tests pass their own clock. */
  now?: () => number;
}

export class RemoteLaserRenderer {
  readonly container = new Container({ label: 'remote-lasers' });
  private readonly lasers = new RemoteLasers();
  private readonly beams = new Map<string, LaserBeamView>();
  private ticking = false;
  private readonly stopListening: () => void;

  constructor(private readonly options: RemoteLaserRendererOptions) {
    this.container.eventMode = 'none';
    this.stopListening = options.hub.onRemote((laser) => {
      this.lasers.receive(laser.from, laser.color, laser.points, laser.lifted, this.now(), laser.dt ? { dt: laser.dt } : {});
      this.startTicking();
    });
  }

  destroy(): void {
    this.stopListening();
    this.stopTicking();
    for (const [from, beam] of [...this.beams]) this.dropBeam(from, beam);
    this.lasers.clear();
    destroyTree(this.container);
  }

  private readonly tick = (): void => {
    const zoom = this.options.zoom() || 1;
    const width = beamWidth(DEFAULT_LASER_POINTER_SETTINGS.size, zoom);
    const shown = new Set<string>();
    for (const frame of this.lasers.frame(this.now())) {
      shown.add(frame.from);
      this.beamOf(frame.from).draw({ trail: frame.trail, dot: null, pointer: frame.head, color: frame.color, width, zoom });
    }
    for (const [from, beam] of [...this.beams]) if (!shown.has(from)) this.dropBeam(from, beam);
    if (!this.lasers.isActive) this.stopTicking();
  };

  private beamOf(from: string): LaserBeamView {
    let beam = this.beams.get(from);
    if (!beam) {
      beam = this.options.createBeam();
      this.beams.set(from, beam);
      this.container.addChild(beam.view);
    }
    return beam;
  }

  /** The view goes with its container first, then what it leaves alive. */
  private dropBeam(from: string, beam: LaserBeamView): void {
    this.beams.delete(from);
    destroyTree(beam.view);
    beam.destroy();
  }

  private startTicking(): void {
    if (this.ticking) return;
    this.ticking = true;
    this.options.ticker.add(this.tick);
  }

  private stopTicking(): void {
    if (!this.ticking) return;
    this.ticking = false;
    this.options.ticker.remove(this.tick);
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }
}
