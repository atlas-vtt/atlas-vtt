import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '../../../../utils/cn';
import { CloseButton } from '../../../packages/components/primitives/CloseButton';
import { chainDepth, layoutDice, restingFrame, type DiceScene } from '../../../dice3d/diceScene';
import type { ThrowStyle } from '../../../dice3d/diceDisplay';
import { ratchet, reveal } from '../../../dice3d/audio/diceSounds';
import type { DiceRollResult } from '../../../types/diceTypes';
import type { RollAudience, RollSourcePresentation, UseDiceAvatar } from '../dice/diceSourcePresentation';
import { DiceStage, type DiceStageHandle } from './DiceStage';
import { DiceRollHeader } from './DiceRollHeader';
import { DiceRollEngraving } from './DiceRollEngraving';
import { critText, hasBreakdown, rollBreakdown, rollFormula, rollLabel, shownFormula, titledByFormula, withSide } from './diceRollText';
import { RollDigits } from './RollDigits';
import { ROLL_LINGER_MS, useLingerTimer } from './useLingerTimer';
import { useTotalCarry } from './useTotalCarry';
import { listsDice, RolledDiceLine } from '../dice/RolledDiceLine';
import { modifierSteps } from '../../../tools/namedModifiers';
import { t } from '../../../i18n';
import { useElementHeight } from '../../hooks/useElementHeight';

interface DiceRollPanelProps {
  result: DiceRollResult;
  /** Who the roll names; unset looks it up as the GM's window does. */
  presentation?: RollSourcePresentation | null | undefined;
  /** Whom the GM's roll was shown to; unset shows no mark. */
  audience: RollAudience | undefined;
  scene: DiceScene;
  /** A newer roll took the large place: carry on as a row. */
  compact: boolean;
  /** Fading out; removed after `LEAVE_MS`. */
  leaving: boolean;
  /** No sound, e.g. in the player window while the DM's window plays it. */
  muted: boolean;
  /** Speed and wall hits of the throw; the counter keeps pace, the linger stays. */
  style: ThrowStyle;
  onClose: () => void;
  onDone: () => void;
  /** Its dice lie still (landed, laid down as a row, or the panel is leaving or gone); called once or more. */
  onLanded?: (() => void) | undefined;
  /** Finds the roller's portrait for the header. */
  useAvatar: UseDiceAvatar;
}

/**
 * The ripcord: the panel leaves even if the dice never land, e.g. when the
 * frame loop sleeps in a hidden window. The longest real flight is about two
 * seconds, so the limit rescues and never cuts short.
 */
const LINGER_STUCK_MS = 9000;
/**
 * First the pips stand alone for a beat, then the counter clicks forward once
 * per modifier, visibly and audibly (`ratchet`). Adding at once would show a
 * number nobody can match to the dice.
 */
const TICK_DELAY_MS = 420;
const TICK_EVERY_MS = 260;
/** The fade out (`atlas-dice-roll-out` in dice-roll.scss, a little shorter) and then the panel goes. */
const LEAVE_MS = 430;
const LEAVE_REDUCED_MS = 130;
/**
 * The morph between large and row, and the column's places: a spring, not a curtain. The
 * panel's real height is animated, never a scale: a scaled panel stretches its corners, its
 * border, its shadow and the dice on it. Under reduced motion both change at once. Entering,
 * leaving and the total's own motion are CSS animations of opacity, translate and scale
 * (dice-roll.scss), which run off the main thread and hold their end state themselves.
 */
const MORPH = { type: 'spring', duration: 0.42, bounce: 0.16 } as const;

/**
 * How long the panel stays before it leaves on its own. `throws` is how many
 * throws follow one another: one, and one more for every die of the longest
 * chain of explosions, each of which the ripcord has to wait out.
 */
function lingerMs(landed: boolean, throws: number): number {
  return landed ? ROLL_LINGER_MS : LINGER_STUCK_MS * throws;
}

/**
 * A roll as a call across the table, not a dialog: no backdrop, no focus trap,
 * and no surface that takes a click; its one control is the close button
 * (Escape dismisses every roll). The throw starts on its own, shows the number
 * and leaves.
 */
export function DiceRollPanel({ result, presentation, audience, scene, compact: compactNow, leaving, muted, style, onClose, onDone, onLanded, useAvatar }: DiceRollPanelProps): React.ReactElement {
  // A panel leaves at the size it had: a row displaced by a newer roll would
  // otherwise open up to full size while disappearing.
  const [leavingSize, setLeavingSize] = useState<boolean | null>(null);
  if (leaving && leavingSize === null) setLeavingSize(compactNow);
  const compact = leavingSize ?? compactNow;

  const [landed, setLanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  /** How many modifier steps have clicked in. */
  const [applied, setApplied] = useState(0);
  const reduced = useReducedMotion() === true;
  const stageRef = useRef<DiceStageHandle>(null);
  const [contentRef, contentHeight] = useElementHeight<HTMLDivElement>();
  const closeCb = useRef(onClose);
  const doneCb = useRef(onDone);
  useEffect(() => {
    closeCb.current = onClose;
    doneCb.current = onDone;
  });
  const close = useCallback((): void => closeCb.current(), []);

  // The plain modifier clicks in as one step, then each labelled one on its own.
  const steps = useMemo(() => modifierSteps(result, t('dice.modifier')), [result]);
  const stepCount = steps.length;

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => doneCb.current(), reduced ? LEAVE_REDUCED_MS : LEAVE_MS);
    return (): void => window.clearTimeout(timer);
  }, [leaving, reduced]);

  // Displaced means done: the dice lie down at once and nothing more sounds.
  const displaced = useRef(false);
  useEffect(() => {
    if (!compact && !leaving) return;
    displaced.current = true;
    stageRef.current?.skip();
  }, [compact, leaving]);

  // The logs may tell the number once the dice lie still here, and at the latest when the panel goes.
  useEffect(() => {
    if (landed || compact || leaving) onLanded?.();
  }, [landed, compact, leaving, onLanded]);
  useEffect(() => (): void => onLanded?.(), [onLanded]);

  // Reduced motion shows the full number at once. A row counts on from where its total stood (`useTotalCarry`).
  const appliedSteps = reduced ? stepCount : applied;

  useEffect(() => {
    if (!landed || reduced || stepCount === 0) return;
    const timers = Array.from({ length: stepCount }, (_, i) => window.setTimeout(() => {
      setApplied(i + 1);
      if (!muted && !displaced.current) ratchet(i);
    }, (TICK_DELAY_MS + i * TICK_EVERY_MS) / style.speed));
    return (): void => timers.forEach((timer) => window.clearTimeout(timer));
  }, [landed, reduced, stepCount, muted, style.speed]);

  const counted = steps.slice(appliedSteps).reduce((sum, step) => sum - step.value, result.total);
  const shown = landed ? counted : null;

  // The clock runs from the start: if the dice never land, the ripcord pulls. Landing starts it afresh,
  // and a pointer over the panel holds it.
  useLingerTimer(leaving ? null : lingerMs(landed, 1 + chainDepth(scene.plan)), close, hovered);

  const crit = landed ? result.crit ?? null : null;
  const label = withSide(rollLabel(result), result);
  const formulaTitle = titledByFormula(result);
  // The resting dice's field in a shrunk row, shaped like their layout.
  const field = useMemo(() => {
    const { offsets, radius } = layoutDice(scene.plan.length);
    return restingFrame(offsets, radius);
  }, [scene]);
  const breakdown = rollBreakdown(result, scene);
  // While the dice fly the slot says what the title does not: the formula, where an action's name is the title.
  const flying = formulaTitle ? '' : rollFormula(result);
  // The caption that names a crit in words, never by its tint alone; its line is held from the start.
  const critCaption = critText(result.crit);
  const slotRem = 3.2 + (hasBreakdown(result, scene) ? 1.05 : 0) + (critCaption ? 1.05 : 0);
  // A newer roll shrinks this one to a row: its total travels into the row's place (the count
  // finishes there) instead of being swapped. Reduced motion lets it change at once.
  const carry = useTotalCarry(compact, reduced);
  const header = <DiceRollHeader result={result} presentation={presentation} label={label} formula={formulaTitle} audience={audience} useAvatar={useAvatar} />;

  return (
    <motion.div
      layout={reduced ? false : 'position'}
      transition={MORPH}
      className={cn(
        'atlas-dice-roll',
        compact && 'atlas-dice-roll--compact',
        leaving && 'atlas-dice-roll--leaving',
        crit === 'high' && 'atlas-dice-roll--crit-success',
        crit === 'low' && 'atlas-dice-roll--crit-fail',
      )}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <div
        ref={carry.sheet}
        className="atlas-dice-roll__sheet"
        style={{ '--atlas-dice-field-aspect': field.aspect, '--atlas-dice-tick-ms': `${Math.round(TICK_EVERY_MS / style.speed)}ms` } as React.CSSProperties}
      >
        {!compact && <DiceRollEngraving />}
        {/* The dish lies over the engraving: it is the shape of the surface, and a
            shadow falls on what is printed on it too. */}
        {!compact && <div className="atlas-dice-roll__dish" aria-hidden="true" />}

        {crit !== null && (
          <div aria-hidden="true" className="atlas-dice-roll__glow" />
        )}

        {!compact && (
          <CloseButton
            className="atlas-dice-roll__close"
            aria-label={t('diceRoll.dismiss')}
            onClick={close}
          />
        )}

        {/* The sheet is as tall as this clip, which follows its content's height through a CSS
            transition (`atlas-dice-roll__clip`: the browser animates it, no script runs per
            frame, and reduced motion changes it at once). The clip gets no height before its
            content was measured; from `auto` nothing transitions, so the first height is set and
            only later ones are animated to. */}
        <div className="atlas-dice-roll__clip" style={contentHeight === null ? undefined : { height: contentHeight }}>
          <div ref={contentRef} className="atlas-dice-roll__content">
            {compact ? (
              <div className="atlas-dice-roll__row">
                {header}
                <span ref={carry.row} className="atlas-dice-roll__total atlas-dice-roll__total--row">
                  {shown !== null && <RollDigits value={shown} />}
                </span>
              </div>
            ) : (
              <>
                <div className="atlas-dice-roll__header">{header}</div>
                {/* Holds the height where the dice come to rest; they roll over the whole panel. */}
                <div className="atlas-dice-roll__floor" />
                <div className="atlas-dice-roll__slot" style={{ height: `${slotRem}rem` }}>
                  {shown !== null ? (
                    <>
                      <span ref={carry.large} className="atlas-dice-roll__total">
                        {/* Every step its own key: the counter jumps once per step (a bump shorter
                            than a step, so the next never cuts one off), it does not cross-fade. */}
                        <span key={shown} className={cn('atlas-dice-roll__count', appliedSteps > 0 && 'atlas-dice-roll__count--bump')}>
                          <RollDigits value={shown} />
                        </span>
                      </span>
                      {/* With advantage the kept die and the one dropped, in brackets, as the card writes them. */}
                      {listsDice(result)
                        ? <RolledDiceLine result={result} className="atlas-dice-roll__breakdown atlas-dice-roll__dice" />
                        : breakdown !== null && <span className="atlas-dice-roll__breakdown">{breakdown}</span>}
                      {crit !== null && critCaption && (
                        <span className={cn('atlas-roll-crit', `atlas-roll-crit--${crit}`, 'atlas-dice-roll__crit')}>{critCaption}</span>
                      )}
                    </>
                  ) : flying !== '' && (
                    <span className="atlas-dice-roll__formula">{flying}</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <DiceStage
          ref={stageRef}
          scene={scene}
          crit={result.crit ?? null}
          muted={muted}
          style={style}
          seed={result.id}
          frame={compact ? field : null}
          onSettled={() => {
            setLanded(true);
            // The verdict belongs to the roll being watched; a displaced one reports silently.
            if (!muted && !displaced.current) reveal(result.crit ?? null);
          }}
          label={shown === null ? t('diceRoll.rolling', { formula: shownFormula(result.formula) }) : t('diceRoll.rolled', { label, total: String(shown) })}
          className="atlas-dice-roll__stage"
        />
      </div>
    </motion.div>
  );
}
