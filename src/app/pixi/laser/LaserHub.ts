/**
 * One Atlas view's lasers: the GM's own as it is drawn (`LaserPointerRenderer` emits, an
 * extension's `lasers.onLocal` listens), and other people's to show (`lasers.show` shows,
 * `RemoteLaserRenderer` draws). PIXI-free.
 */
import type { LocalLaserEvent, RemoteLaser } from './laserEvents';

export type { LocalLaserEvent, RemoteLaser };

export class LaserHub {
  private readonly local = new Set<(event: LocalLaserEvent) => void>();
  private readonly remote = new Set<(laser: RemoteLaser) => void>();

  onLocal(listener: (event: LocalLaserEvent) => void): () => void {
    this.local.add(listener);
    return () => { this.local.delete(listener); };
  }

  emitLocal(event: LocalLaserEvent): void {
    for (const listener of [...this.local]) listener(event);
  }

  onRemote(listener: (laser: RemoteLaser) => void): () => void {
    this.remote.add(listener);
    return () => { this.remote.delete(listener); };
  }

  showRemote(laser: RemoteLaser): void {
    for (const listener of [...this.remote]) listener(laser);
  }
}
