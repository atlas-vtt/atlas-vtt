import { POOLS, audio, jitter, masterGain, masterLevel, voice, whenReady } from './diceSamples';

/**
 * The teeth of the running wheel, scheduled ahead. A second roll overtaking a
 * first must be able to clear them, or two wheels run over each other.
 */
let wheel: AudioBufferSourceNode[] = [];
/** Serial number of the roll; it discards what belongs to an old one. */
let rollSerial = 0;

/**
 * The wheel.
 *
 * While the die flies a wheel runs: fast at first, audibly slower towards the
 * end, like a wheel of fortune looking for its stop.
 *
 * The teeth sit on the die's own easing curve, not on one of their own. The
 * die spins by `1 - (1 - s)^ease`; a wheel clicks once per tooth, once per
 * equal share of rotation. Solved for time, that says when the k-th tooth
 * passes, so the wheel slows exactly when the die does. An invented spread
 * used to run beside the picture instead.
 *
 * Each tooth is two voices at the same instant: the dull strike below, a
 * brighter, shorter one above. The dull one alone sounded heard through a door;
 * a click's bite sits up high. Layered, not replaced: the wood gets an edge.
 *
 * Scheduled ahead, not ticked: `setInterval` runs on the frame clock and wobbles
 * with load, the audio clock does not. An audibly wobbling wheel is worse than
 * none.
 */
const WHEEL_TEETH = 30;
/**
 * The wheel's run-out.
 *
 * It was once 2, the die's own, and the sound stopped while the picture still
 * moved: the gap between teeth grows grotesque at the end, with 22 teeth the
 * last fell at 79 % of the journey and the die spun silently for a good quarter
 * second. A wheel that stops before it stands sounds broken. Flatter and with
 * more teeth it runs out instead of breaking off: the last tooth now falls at
 * 92 %, just before the rattle, and the start clicks nearly as densely.
 */
const WHEEL_EASE = 1.35;
/** From here the fall takes over; a later tooth would land behind the result. */
const WHEEL_UNTIL = 0.96;
/**
 * How loud the bright snap stands over the dull tooth: 24 dB below, at the
 * edge of hearing. At 0.45 (7 dB) and then 0.16 (16 dB) it was heard as a
 * second sound, not as the first one's edge. A share you can name is no longer
 * a blend; it may stand only so high that its absence would be noticed.
 */
const WHEEL_SNAP = 0.06;
/** How far above the tooth the snap sits. A ratio, so it rises and falls with the tooth. */
const WHEEL_SNAP_RATIO = 1.3;

/** Starts the wheel for a roll and returns that roll's number, which `rollEnd` takes to stop it. */
export function rollStart(expectedSeconds = 1.75): number {
  rollEnd();
  const serial = ++rollSerial;
  const c = audio();
  const master = masterGain();
  if (c === null || master === null) return serial;
  const now = c.currentTime;

  // Faded in, not switched on: without the fade the roll starts on the edge of
  // the first sample, a click no die makes.
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(0.0001, now);
  // An exponential ramp cannot reach 0; at volume 0 the dice are muted before this anyway
  master.gain.exponentialRampToValueAtTime(Math.max(masterLevel(), 0.0001), now + 0.06);

  // Pitch and strength are drawn once per tooth and shared by both layers.
  // Drawn per layer, their ratio wobbled by a quarter from tooth to tooth, and
  // the ear follows a share that moves on its own as a separate source: the two
  // sounded side by side instead of layered because they did not share a fate.
  const teeth: Array<{ at: number; rate: number; strength: number }> = [];
  for (let k = 1; k <= WHEEL_TEETH; k++) {
    const s = 1 - Math.pow(1 - k / WHEEL_TEETH, 1 / WHEEL_EASE);
    if (s > WHEEL_UNTIL) break;
    teeth.push({
      at: now + s * expectedSeconds,
      rate: (2.9 + Math.random() * 0.5) * jitter(0.06),
      // A wheel running out clicks not only less often but also duller.
      strength: (0.3 - 0.16 * (k / WHEEL_TEETH)) * jitter(0.22),
    });
  }

  const schedule = (): void => {
    // A wheel that belongs to a past roll stays unscheduled.
    if (serial !== rollSerial) return;
    for (const { at, rate, strength } of teeth) {
      // A tooth whose time has passed is dropped: a late click is worse than a
      // missing one.
      if (at <= c.currentTime) continue;

      // Below, the tooth: the dull piece, pitched up and trimmed; the wood the
      // pawl lifts.
      const tooth = voice({
        urls: POOLS.soft,
        rate,
        gain: strength,
        when: at,
        lowpass: 2600,
        body: [900, 4],
        decay: 0.028,
      });
      if (tooth !== null) wheel.push(tooth);

      // Above, the snap: not a second strike but the gloss on the first, same
      // pitch and strength as the tooth, set a little higher and turned far
      // down. Its highpass sits exactly where the tooth's lowpass ends: a
      // kilohertz once gaped between them (2600 to 3600), and what a gap
      // separates is heard as two things.
      const snap = voice({
        urls: POOLS.glass,
        rate: rate * WHEEL_SNAP_RATIO,
        gain: strength * WHEEL_SNAP,
        when: at,
        highpass: 2600,
        // Shorter than the tooth, in proportion to its own tail: the envelope
        // shares the fate too.
        decay: 0.011,
      });
      if (snap !== null) wheel.push(snap);
    }
  };

  // Scheduled as soon as possible, not only when convenient: all teeth are made
  // in one instant, and in the first instant of a session no sample was decoded
  // yet, so the first roll ran silent. The timetable stands at once and is
  // scheduled after decoding; what has passed by then is missing, the rest runs
  // as planned.
  if (whenReady(schedule)) schedule();
  return serial;
}

/**
 * Roll end: clear the wheel. A regular end and an abort do the same here: teeth
 * still in the future belong to a roll that is over.
 *
 * Several rolls stand side by side and there is one wheel, the latest roll's.
 * A roll that names itself stops only its own: an earlier roll that settles or
 * whose panel closes must not silence the one still flying.
 */
export function rollEnd(roll?: number): void {
  if (roll !== undefined && roll !== rollSerial) return;
  // Also what is not scheduled yet: a wheel waiting for the samples to decode
  // must not start afterwards.
  rollSerial += 1;
  for (const tooth of wheel) {
    try {
      tooth.stop();
    } catch {
      // Already played or never started; both are fine.
    }
  }
  wheel = [];
}
