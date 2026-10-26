import type { EventEmitter } from 'events';
import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useDiceDisplay } from '../../hooks/useDiceDisplay';
import { diceFontClass, useDiceLook } from '../../hooks/useDiceLook';
import { cn } from '../../../../utils/cn';
import { throwStyle } from '../../../dice3d/diceDisplay';
import { diceSceneToShow } from '../../../dice3d/rollPresentation';
import { warmDiceSounds } from '../../../dice3d/audio/diceSamples';
import { playDiceReveal } from '../../../audio/diceRevealSound';
import { canShowDice, warmStages } from '../../../dice3d/stagePool';
import type { DiceRollResult } from '../../../types/diceTypes';
import type { DiceRollOrigin } from '../../../types/diceRollOrigin';
import type { PreparedDiceRoll } from './diceSourcePresentation';
import { DiceRollStack } from '../dice3d/DiceRollStack';
import { closeAllRolls, closeRoll, dismissRoll, pushRoll, type StackedRoll } from '../dice3d/rollStackState';
import { canRunMapHotkeys } from '../../../keyboard/mapHotkeys';
import { DiceToast } from './DiceToast';
import { DICE_TOAST_KNOT_PATHS, DICE_TOAST_KNOT_SYMBOL_ID } from './diceToastOrnament';
import { useDiceToasts } from './useDiceToasts';
import { useDiceAvatar } from './useDiceAvatar';
import { useViewWindow } from '../../useViewWindow';

/** What comes with a roll to show: `muted` where another display plays its sounds, `origin` the token and scene it was made for. */
export interface RollOptions {
  muted: boolean;
  origin?: DiceRollOrigin | undefined;
}

/** Hands each roll to show to `onRoll`; returns what stops it. */
export type DiceRollSubscription = (onRoll: (result: DiceRollResult, options: RollOptions) => void) => () => void;

/** The rolls of one map view's dice tool, as its event bus announces them; none without a bus. */
function busRolls(bus: EventEmitter | undefined): DiceRollSubscription {
  return (onRoll) => {
    if (!bus) return () => undefined;
    const handler = (result: DiceRollResult, origin?: DiceRollOrigin): void => onRoll(result, { muted: false, origin });
    bus.on('dice-rolled', handler);
    return (): void => { bus.off('dice-rolled', handler); };
  };
}

interface DiceRollDisplayProps {
  /** Explicit source for a display outside its owning Atlas view. */
  eventBus?: EventEmitter;
  /** Element the rolls render into, e.g. in the player window. Defaults to where the component is mounted. */
  container?: HTMLElement;
  /**
   * Decides, when each roll arrives, what of it is shown and who it names, e.g. to leave
   * out who rolled it. `origin` is the token and scene the roll was made for, when known.
   */
  prepare?: (result: DiceRollResult, origin: DiceRollOrigin | undefined) => PreparedDiceRoll;
  /** Throws without sound, where another window already plays it. */
  muted?: boolean;
  /** The rolls to show; by default those of the owning view's dice tool (`eventBus`). */
  subscribe?: DiceRollSubscription;
  /**
   * Plays the result sound of a roll shown as a card. A map's own display
   * leaves that to its `DiceToastObserver`; a display outside a map has none.
   */
  cardSounds?: boolean;
}

const CARD_VOLUME = 0.7;

/**
 * Every dice roll, at the top centre of the map: thrown as 3D dice, or as a
 * result card when 3D dice are off or the roll holds dice no real body shows.
 */
export function DiceRollDisplay({ container, prepare, muted = false, eventBus: suppliedBus, subscribe, cardSounds = false }: DiceRollDisplayProps): React.ReactElement | null {
  const { app, view } = useAtlasUI();
  const eventBus = suppliedBus ?? view?.serviceManager?.getEventBus();
  const display = useDiceDisplay(app ?? undefined);
  const look = useDiceLook(app ?? undefined);
  const { toasts, addToast, dismissToast, dismissAllToasts } = useDiceToasts();
  const [rolls, setRolls] = useState<readonly StackedRoll[]>([]);
  /** Where the dice stages live: a canvas and its context belong to one document. */
  const stageDoc = container?.ownerDocument ?? view?.containerEl.doc ?? document;

  useEffect(() => {
    const show = (raw: DiceRollResult, options: RollOptions): void => {
      const prepared: PreparedDiceRoll = prepare ? prepare(raw, options.origin) : { result: raw };
      const scene = diceSceneToShow(prepared.result, display);
      // Without WebGL a stage stays blank (white on some systems), so the roll shows as a card
      if (!scene || !canShowDice(stageDoc)) {
        addToast(prepared);
        if (cardSounds && !muted && !options.muted) void playDiceReveal(prepared.result.crit ?? null, CARD_VOLUME).catch(() => undefined);
        return;
      }
      if (!muted && !options.muted) warmDiceSounds();
      setRolls((prev) => pushRoll(prev, { ...prepared, scene, style: throwStyle(display), ...(options.muted && { muted: true as const }) }));
    };
    return (subscribe ?? busRolls(eventBus))(show);
  }, [subscribe, eventBus, addToast, prepare, display, muted, cardSounds, stageDoc]);

  // Dice stages are built while nothing rolls, so that the first roll does not wait for one.
  useEffect(() => {
    if (display !== 'card') warmStages(stageDoc);
  }, [display, stageDoc]);

  // Escape dismisses every roll on screen, unless something in front of the map
  // takes it (a modal, the palette, the dashboard) or someone is typing. The
  // player window takes no keyboard input, so only the map view listens.
  const showing = rolls.some((roll) => !roll.leaving) || toasts.some((toast) => toast.phase !== 'exiting');
  const win = useViewWindow(view?.containerEl);
  useEffect(() => {
    if (container || !showing) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || !canRunMapHotkeys(e, view?.viewId)) return;
      e.preventDefault();
      e.stopPropagation();
      setRolls(closeAllRolls);
      dismissAllToasts();
    };
    win.addEventListener('keydown', handler, true);
    return (): void => win.removeEventListener('keydown', handler, true);
  }, [container, showing, view, win, dismissAllToasts]);

  const close = useCallback((id: string): void => setRolls((prev) => closeRoll(prev, id)), []);
  const dismiss = useCallback((id: string): void => setRolls((prev) => dismissRoll(prev, id)), []);

  if (toasts.length === 0 && rolls.length === 0) return null;

  const content = (
    // Carries the plugin class itself: in the player window no ancestor does.
    <div className={cn('atlas-dice-rolls atlas-vtt-plugin', diceFontClass(look))}>
      {toasts.length > 0 && (
        // Knotwork defined once; every toast corner draws it with <use>.
        <svg className="atlas-dice-rolls__defs" aria-hidden="true">
          <defs>
            <g id={DICE_TOAST_KNOT_SYMBOL_ID} fill="none" stroke="currentColor" strokeWidth="10">
              {DICE_TOAST_KNOT_PATHS.map((d, i) => <path key={i} d={d} />)}
            </g>
          </defs>
        </svg>
      )}
      <DiceRollStack rolls={rolls} muted={muted} onClose={close} onDone={dismiss} useAvatar={useDiceAvatar} />
      {toasts.map((toast) => (
        <DiceToast key={toast.id} result={toast.result} presentation={toast.sourcePresentation} phase={toast.phase} onDismiss={() => dismissToast(toast.id)} useAvatar={useDiceAvatar} />
      ))}
    </div>
  );
  return container ? createPortal(content, container) : content;
}
