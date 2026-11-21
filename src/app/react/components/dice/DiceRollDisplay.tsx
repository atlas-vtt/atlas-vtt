import type { EventEmitter } from '../../../utils/typedEmitter';
import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useDiceDisplay, useDiceVolume } from '../../hooks/useDiceDisplay';
import { diceFontClass, useDiceLook } from '../../hooks/useDiceLook';
import { cn } from '../../../../utils/cn';
import { throwStyle } from '../../../dice3d/diceDisplay';
import { diceSceneToShow } from '../../../dice3d/rollPresentation';
import { setDiceVolume, warmDiceSounds } from '../../../dice3d/audio/diceSamples';
import { playDiceReveal } from '../../../audio/diceRevealSound';
import { canShowDice, warmStages } from '../../../dice3d/stagePool';
import { holdRoll } from '../../../dice3d/rollsInFlight';
import { deviceProfile } from '../../../platform/deviceProfile';
import type { DiceRollResult } from '../../../types/diceTypes';
import type { DiceRollOrigin } from '../../../types/diceRollOrigin';
import type { PreparedDiceRoll } from './diceSourcePresentation';
import { DiceRollStack } from '../dice3d/DiceRollStack';
import { closeAllRolls, closeRoll, dismissRoll, pushRoll, type StackedRoll } from '../dice3d/rollStackState';
import { canRunMapHotkeys } from '../../../keyboard/mapHotkeys';
import { DiceToast } from './DiceToast';
import { rollAnnouncement } from '../dice3d/diceRollText';
import { useDiceToasts } from './useDiceToasts';
import { useDiceAvatar } from './useDiceAvatar';
import { useMapRollLayer } from './useMapRollLayer';
import { portalHost } from '../../../host/portalHost';
import { SettingsService } from '../../../services/SettingsService';

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
 * Every dice roll: a map's at the top right of its view and in front of every
 * other Atlas surface (`useMapRollLayer`), otherwise in `container`. Thrown as
 * 3D dice, or as a result card when 3D dice are off or the roll holds dice no
 * real body shows.
 */
export function DiceRollDisplay({ container, prepare, muted: windowMuted = false, eventBus: suppliedBus, subscribe, cardSounds = false }: DiceRollDisplayProps): React.ReactElement | null {
  const { app, view } = useAtlasUI();
  const eventBus = suppliedBus ?? view?.serviceManager?.getEventBus();
  const display = useDiceDisplay(app ?? undefined);
  const volume = useDiceVolume(app ?? undefined);
  // At volume 0 the dice stay silent; nothing is decoded or scheduled for them. A roll keeps the
  // silence it was thrown with: the stage throws again when its `muted` changes, and the master
  // gain (`setDiceVolume`) quiets a roll in flight.
  const muted = windowMuted || volume === 0;
  const look = useDiceLook(app ?? undefined);
  const { toasts, addToast, dismissToast, dismissAllToasts } = useDiceToasts();
  const [rolls, setRolls] = useState<readonly StackedRoll[]>([]);
  /** The latest roll as a screen reader hears it; a new id is a new announcement, even of the same words. */
  const [announcement, setAnnouncement] = useState<{ id: string; text: string } | null>(null);
  /** Where the dice stages live: a canvas and its context belong to one document. */
  const stageDoc = container?.ownerDocument ?? view?.containerEl.doc ?? document;
  const layer = useMapRollLayer();

  useEffect(() => {
    const settings = container ? undefined : SettingsService.forApp(app ?? undefined);
    const show = (raw: DiceRollResult, options: RollOptions): void => {
      const base: PreparedDiceRoll = prepare ? prepare(raw, options.origin) : { result: raw };
      // The GM's own display marks whom each roll was shown to, as the switch stood when it came.
      const prepared: PreparedDiceRoll = settings
        ? { ...base, audience: settings.getLocalPlayerViewSettings().showDiceRolls ? 'players' : 'gm' }
        : base;
      setAnnouncement({ id: prepared.result.id, text: rollAnnouncement(prepared.result, prepared.audience) });
      const scene = diceSceneToShow(prepared.result, display);
      // Without WebGL a stage stays blank (white on some systems), so the roll shows as a card
      if (!scene || !canShowDice(stageDoc)) {
        addToast(prepared);
        if (cardSounds && !muted && !options.muted) void playDiceReveal(prepared.result.crit ?? null, CARD_VOLUME * volume).catch(() => undefined);
        return;
      }
      if (!muted && !options.muted) warmDiceSounds();
      // Held now, in the task that announced the roll, so no log draws its number before the dice land.
      const release = holdRoll(raw.id);
      setRolls((prev) => pushRoll(prev, { ...prepared, scene, style: throwStyle(display), release, ...((options.muted || volume === 0) && { muted: true as const }) }));
    };
    return (subscribe ?? busRolls(eventBus))(show);
  }, [subscribe, eventBus, addToast, prepare, display, muted, volume, cardSounds, stageDoc, container, app]);

  // One audio context plays every window's dice; only the window that sounds sets its volume
  useEffect(() => {
    if (!windowMuted) setDiceVolume(volume);
  }, [volume, windowMuted]);

  // Dice stages are built while nothing rolls, so that the first roll does not wait for one.
  useEffect(() => {
    if (display !== 'card') warmStages(stageDoc, undefined, deviceProfile().budgets.diceWarmStages);
  }, [display, stageDoc]);

  // Escape dismisses every roll on screen, unless something in front of the map
  // takes it (a modal, the palette, the dashboard) or someone is typing. The
  // player window takes no keyboard input, so only the map view listens.
  const showing = rolls.some((roll) => !roll.leaving) || toasts.some((toast) => toast.phase !== 'exiting');
  useEffect(() => {
    if (container || !showing) return;
    const win = view?.containerEl.win ?? window;
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || !canRunMapHotkeys(e, view?.viewId)) return;
      e.preventDefault();
      e.stopPropagation();
      setRolls(closeAllRolls);
      dismissAllToasts();
    };
    win.addEventListener('keydown', handler, true);
    return (): void => win.removeEventListener('keydown', handler, true);
  }, [container, showing, view, dismissAllToasts]);

  const close = useCallback((id: string): void => setRolls((prev) => closeRoll(prev, id)), []);
  const dismiss = useCallback((id: string): void => setRolls((prev) => dismissRoll(prev, id)), []);

  const empty = toasts.length === 0 && rolls.length === 0;
  // Stands before any roll does, so that a screen reader hears each roll once, politely, as it arrives.
  const status = (
    <div className="atlas-dice-status atlas-vtt-plugin" role="status" aria-live="polite">
      {announcement && <span key={announcement.id}>{announcement.text}</span>}
    </div>
  );

  const content = !empty && (
    // Carries the plugin class itself: in the player window and the portal host no ancestor does.
    <div
      className={cn('atlas-dice-rolls atlas-vtt-plugin', !container && 'atlas-dice-rolls--front', !container && !layer.shown && 'atlas-dice-rolls--away', diceFontClass(look))}
      style={container ? undefined : layer.style}
    >
      <DiceRollStack rolls={rolls} muted={windowMuted} onClose={close} onDone={dismiss} useAvatar={useDiceAvatar} />
      {toasts.map((toast) => (
        <DiceToast key={toast.id} result={toast.result} presentation={toast.sourcePresentation} audience={toast.audience} phase={toast.phase} onDismiss={() => dismissToast(toast.id)} useAvatar={useDiceAvatar} />
      ))}
    </div>
  );
  const shown = <>{status}{content}</>;
  if (container) return createPortal(shown, container);
  return (
    <>
      {layer.anchor}
      {createPortal(shown, portalHost(stageDoc))}
    </>
  );
}
