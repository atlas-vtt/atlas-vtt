/**
 * What the grid scan shows at each moment of a detection, worked out from what the detection
 * reports and the time alone: no document, no PIXI. `GridScanLayer` draws its frames.
 *
 * Three beats. Looking: light drifts over the map in patches and the map's lines show in it.
 * Finding: the best grid found so far grows onto the map, the softer the less of it the map's
 * lines support. Locked: a swell runs out from the origin and leaves the grid sharp behind it.
 */

import { CriticalSpring } from '../utils/criticalSpring';
import type { LatticeLook, ScanFrame, ScanLattice } from './scanFrame';

/**
 * The answer's swell takes this long from the origin to the farthest corner: the pace of everything
 * the scan shows. `gridScanShader.ts` gives the swell its shape by the same time (`SWELL_SECONDS`).
 */
export const LOCK_MS = 1500;
/** The sharp grid stands in its glow this long after the swell has passed the map. */
const HOLD_MS = 500;
/** Then the glow dies down, slowly: the last thing a detection shows. The scene's own grid stands under it by then. */
export const LOCK_FADE_MS = 1800;
/**
 * An answer's glow dies down like an ember, quickly at first and then for a long while. Below this
 * share the eye no longer follows it on a map (measured on black: a line's light is under a fifth
 * of what it was, and half of that a quarter of a second later), so whoever waits for the scan need
 * not wait out the rest, most of a second.
 */
const QUIET_GLOW = 0.2;
/** A better grid replaces the shown one no sooner than this after the last: fits arrive up to ten a second. */
export const SWAP_MS = 260;
const SCRIM = 0.11;
/** What shows when the GM moves on is gone this soon. */
const CANCEL_SECONDS = 0.2;

function unit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * How soft a grid is drawn for the share of it that lies on the map's lines: the scan's one
 * statement about how sure the detection is. 1 is the widest, faintest line, 0 a sharp one.
 */
export function softnessOf(support: number): number {
  // A grid at the floor of what counts as found (0.05) is all haze; from 0.6 on it is as good as sharp.
  const sure = unit((support - 0.05) / 0.55);
  return 1 - sure * sure * (3 - 2 * sure);
}

/** A swell sets out gently and arrives gently: nothing of the scan starts or stops at once. */
function travel(progress: number): number {
  const at = unit(progress);
  return at * at * (3 - 2 * at);
}

/** How much of a grid is etched at once when it is found, and how far the etching creeps on while the search goes on. */
const GROWN_AT_ONCE = 0.58;
const GROWN_AT_MOST = 0.94;
/** Seconds in which the etching covers most of what is left to it. */
const CREEP_SECONDS = 3.5;
/** A grid being tried comes and goes over about this long, and the next one waits for it to have gone. */
const TRIAL_SECONDS = 0.45;
const TRIAL_GONE = 0.1;

/** Whether `a` is `b` as near as makes no difference on screen: a fit that only refines the grid shown replaces nothing. */
function sameLattice(a: ScanLattice | null, b: ScanLattice): boolean {
  return a !== null
    && a.gridType === b.gridType
    && Math.abs(a.cellSize - b.cellSize) < 0.01 * b.cellSize
    && Math.abs(a.offsetX - b.offsetX) < 0.5
    && Math.abs(a.offsetY - b.offsetY) < 0.5
    && a.toLattice.every((value, i) => Math.abs(value - b.toLattice[i]!) < 1e-6);
}

/** A grid grows onto the map over about this long, and goes in about half of it. */
const GROW_SECONDS = 1.1;
const FADE_SECONDS = 0.5;

/** One of the grids on show, with how strongly and how softly it is drawn. */
class Slot {
  lattice: ScanLattice | null = null;
  /** How much of the grid shows: it grows in patches, so this is no plain opacity (`gridScanShader.ts`). */
  readonly alpha = new CriticalSpring(0, 0, GROW_SECONDS);
  readonly soft = new CriticalSpring(1, 1, 0.5);

  look(seconds: number): LatticeLook {
    return { lattice: this.lattice, alpha: this.alpha.step(seconds), soft: this.soft.step(seconds) };
  }
}

type Phase = 'idle' | 'looking' | 'locking' | 'held' | 'leaving';

export class ScanChoreography {
  private phase: Phase = 'idle';
  /** Milliseconds since the scan began, and since its phase did. */
  private elapsed = 0;
  private inPhase = 0;
  private sinceSwap = Infinity;
  private front = new Slot();
  private back = new Slot();
  private shownSupport = 0;
  private pending: { lattice: ScanLattice; support: number } | null = null;
  private readonly scrim = new CriticalSpring(0, 0, 0.4);
  private readonly looking = new CriticalSpring(0, 0, 0.7);
  private readonly trialSlot = new Slot();
  private nextTrial: ScanLattice | null = null;
  /** The answer is shown: it stays sharp while the scan lets go of it. */
  private locked = false;
  /** Milliseconds since the answer came. */
  private sinceLock = 0;

  /** `reach` is the distance from the scan's origin to the farthest corner of the map. */
  constructor(private readonly reach: number) {}

  get active(): boolean {
    return this.phase !== 'idle';
  }

  begin(): void {
    this.enter('looking');
    this.elapsed = 0;
    this.sinceSwap = Infinity;
    this.shownSupport = 0;
    this.locked = false;
    this.pending = null;
    this.front = new Slot();
    this.back = new Slot();
    this.trialSlot.lattice = null;
    this.trialSlot.alpha.jumpTo(0);
    this.trialSlot.alpha.duration = TRIAL_SECONDS;
    this.nextTrial = null;
    this.scrim.duration = 0.4;
    this.scrim.target = SCRIM;
    this.looking.duration = 0.7;
    this.looking.target = 1;
  }

  /** A grid the map's lines support was found. It is shown where it is at least as well supported as the one shown. */
  fit(lattice: ScanLattice, support: number): void {
    if (this.phase !== 'looking' || support < this.shownSupport) return;
    this.pending = { lattice, support };
  }

  /** A grid the detection tries next. Trials follow each other faster than they can be shown: the latest waits its turn. */
  trial(lattice: ScanLattice): void {
    if (this.phase === 'looking') this.nextTrial = lattice;
  }

  /** The detection's answer: the grid as it will stand, in the world as it is drawn from now on. */
  lock(lattice: ScanLattice): void {
    if (this.phase === 'idle') this.begin();
    this.pending = null;
    this.nextTrial = null;
    this.trialSlot.alpha.target = 0;
    this.looking.target = 0;
    this.show(lattice, 1);
    this.locked = true;
    this.sinceLock = 0;
    this.enter('locking');
  }

  /** The detection found no grid. */
  miss(): void {
    if (this.phase !== 'looking') return;
    this.letGo();
    this.enter('leaving');
  }

  /** The GM moved on: whatever shows goes at once. */
  cancel(): void {
    if (this.phase === 'idle') return;
    // No lingering glow for an answer the GM has left behind.
    this.locked = false;
    this.letGo(CANCEL_SECONDS);
    this.enter('leaving');
  }

  step(milliseconds: number): ScanFrame {
    const seconds = milliseconds / 1000;
    this.elapsed += milliseconds;
    this.inPhase += milliseconds;
    this.sinceSwap += milliseconds;
    if (this.locked) this.sinceLock += milliseconds;

    if (this.pending && this.sinceSwap >= SWAP_MS) {
      this.show(this.pending.lattice, this.pending.support);
      this.pending = null;
    }
    if (this.phase === 'looking') {
      // The etching never stands still while the search goes on.
      const { alpha } = this.front;
      if (this.front.lattice) alpha.target += (GROWN_AT_MOST - alpha.target) * (1 - Math.exp(-seconds / CREEP_SECONDS));
      // One trial dissolves before the next takes its place.
      if (this.nextTrial) {
        this.trialSlot.alpha.target = 0;
        if (this.trialSlot.alpha.value <= TRIAL_GONE) {
          this.trialSlot.lattice = this.nextTrial;
          this.nextTrial = null;
          this.trialSlot.alpha.target = 1;
        }
      }
    }

    let revealed = false;
    if (this.phase === 'locking' && this.inPhase >= LOCK_MS) {
      revealed = true;
      this.enter('held');
    } else if (this.phase === 'held' && this.inPhase >= HOLD_MS) {
      this.letGo();
      this.enter('leaving');
    }

    const frame: ScanFrame = {
      time: this.elapsed / 1000,
      scrim: this.scrim.step(seconds),
      looking: this.looking.step(seconds),
      lock: this.lockWave(),
      front: this.front.look(seconds),
      back: this.back.look(seconds),
      trial: this.trialSlot.look(seconds),
      revealed,
      quiet: false,
      still: false,
    };
    const gone = frame.scrim === 0 && frame.looking === 0 && frame.front.alpha === 0 && frame.back.alpha === 0 && frame.trial.alpha === 0;
    // An answer's glow outlasts everything else the scan shows.
    const glowGone = !this.locked || this.inPhase >= LOCK_FADE_MS;
    if (this.phase === 'leaving' && gone && glowGone) this.phase = 'idle';
    frame.still = this.phase === 'idle';
    frame.quiet = frame.still || (this.phase === 'leaving' && gone && frame.lock.glow <= QUIET_GLOW);
    return frame;
  }

  private enter(phase: Phase): void {
    this.phase = phase;
    this.inPhase = 0;
  }

  /** Lets everything shown fade; within `seconds` where the usual pace would be in the GM's way. */
  private letGo(seconds?: number): void {
    this.pending = null;
    this.nextTrial = null;
    for (const spring of [this.front.alpha, this.back.alpha, this.trialSlot.alpha, this.scrim, this.looking]) {
      spring.target = 0;
      spring.duration = seconds ?? Math.min(spring.duration, FADE_SECONDS);
    }
  }

  /** Puts `lattice` in front; a grid other than the one shown takes over from it. */
  private show(lattice: ScanLattice, support: number): void {
    if (!sameLattice(this.front.lattice, lattice)) {
      [this.front, this.back] = [this.back, this.front];
      this.back.alpha.target = 0;
      this.back.alpha.duration = FADE_SECONDS;
      this.front.alpha.duration = GROW_SECONDS;
      this.front.lattice = lattice;
      this.front.alpha.jumpTo(0);
      this.front.soft.jumpTo(softnessOf(support));
      this.sinceSwap = 0;
    }
    // An answer stands whole; a grid found on the way is etched as far as the search has come.
    this.front.alpha.target = support >= 1 ? 1 : Math.max(this.front.alpha.target, GROWN_AT_ONCE);
    this.front.soft.target = softnessOf(support);
    this.shownSupport = support;
  }

  private lockWave(): ScanFrame['lock'] {
    if (!this.locked || this.phase === 'idle') return { radius: -this.reach, glow: 0 };
    // Past the map the front goes on at its pace, so what it lit last fades as everything before it did.
    const beyond = Math.max(0, this.sinceLock - LOCK_MS) / LOCK_MS;
    const radius = this.reach * (1.05 * travel(this.sinceLock / LOCK_MS) + 0.9 * beyond);
    // Quickly at first and then for a long while, as an ember does.
    const left = this.phase === 'leaving' ? 1 - unit(this.inPhase / LOCK_FADE_MS) : 1;
    return { radius, glow: left * left };
  }
}
