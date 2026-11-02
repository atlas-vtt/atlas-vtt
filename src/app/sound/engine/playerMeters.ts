import type { SoundAnalyser, SoundNode } from './audioNodes';

/** A little over one display frame at 48 kHz, so no moment falls between two readings. */
const WINDOW_FRAMES = 1024;

export interface MeterPoint {
  /** What the level is read under: `music`, `master` or a layer's sound key. */
  strip: string;
  node: SoundNode;
  /** Past the Silence fade already; a point before it reads as what the fade lets through. */
  afterSilence: boolean;
}

interface Tap extends MeterPoint {
  analyser: SoundAnalyser;
}

/**
 * Levels of what sounds, from analysers that exist only while someone looks. An analyser hangs off its
 * node and adds nothing to what is heard; reading one is a copy of a thousand samples.
 */
export class PlayerMeters {
  private readonly taps = new Map<string, Tap>();
  private readonly samples = new Float32Array(WINDOW_FRAMES);

  constructor(private readonly createAnalyser: () => SoundAnalyser) {}

  /** Taps every point of `points` and lets go of the others. */
  follow(points: ReadonlyMap<string, MeterPoint>): void {
    for (const [id, tap] of this.taps) {
      if (points.get(id)?.node === tap.node) continue;
      tap.node.disconnect(tap.analyser);
      this.taps.delete(id);
    }
    for (const [id, point] of points) {
      if (this.taps.has(id)) continue;
      const analyser = this.createAnalyser();
      analyser.fftSize = WINDOW_FRAMES;
      point.node.connect(analyser);
      this.taps.set(id, { ...point, analyser });
    }
  }

  /** How loud the last moment was per strip (root mean square, linear); `silence` is what the Silence fade lets through now. */
  read(into: Map<string, number>, silence: number): void {
    into.clear();
    for (const { analyser, strip, afterSilence } of this.taps.values()) {
      analyser.getFloatTimeDomainData(this.samples);
      let energy = 0;
      for (let i = 0; i < WINDOW_FRAMES; i++) {
        const sample = this.samples[i] ?? 0;
        energy += sample * sample;
      }
      const rms = Math.sqrt(energy / WINDOW_FRAMES);
      const level = afterSilence ? rms : rms * silence;
      into.set(strip, Math.max(level, into.get(strip) ?? 0));
    }
  }

  dispose(): void {
    this.follow(new Map());
  }
}
