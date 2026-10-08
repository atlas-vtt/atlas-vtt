import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../../utils/cn';
import { throwStyle } from '../dice3d/diceDisplay';
import { givenRollScene } from '../dice3d/givenThrows';
import { warmDiceSounds } from '../dice3d/audio/diceSamples';
import { canShowDice, warmStages } from '../dice3d/stagePool';
import { lookVariant } from '../dice3d/lookVariants';
import { canRunMapHotkeys } from '../keyboard/mapHotkeys';
import { DiceRollStack } from '../react/components/dice3d/DiceRollStack';
import { closeAllRolls, closeRoll, dismissRoll, pushRoll, type StackedRoll } from '../react/components/dice3d/rollStackState';
import { DiceToast } from '../react/components/dice/DiceToast';
import { useDiceAvatar } from '../react/components/dice/useDiceAvatar';
import { DICE_TOAST_KNOT_PATHS, DICE_TOAST_KNOT_SYMBOL_ID } from '../react/components/dice/diceToastOrnament';
import { useDiceToasts } from '../react/components/dice/useDiceToasts';
import { useDiceDisplay } from '../react/hooks/useDiceDisplay';
import { diceFontClass, useDiceLook } from '../react/hooks/useDiceLook';
import { useAtlasUI } from '../react/root/AtlasUIContext';
import { useAtlasStore } from '../react/ViewStoreContext';

/**
 * The remote view's own rolls: each roll its owner throws (`RemoteView.throwRoll`), as Atlas's
 * `DiceRollDisplay` shows the GM's, with the player's own dice settings (display, look) or as a
 * result card. Shared rolls go only to the dice log. Fed by `remoteView.ownRoll`, never by Atlas's
 * document dice event: the player's other maps listen to that one. A roll whose dice the result
 * does not all list shows as a card, since its throw would be missing dice, and so does every roll
 * where the document cannot show 3D dice (no WebGL, a lost context). A roll names no token here
 * (`sourcePresentation: null`): a remote view knows no roll's origin.
 */
export function RemoteOwnRolls(): React.ReactElement | null {
  const { app, view } = useAtlasUI();
  const ownRoll = useAtlasStore((state) => state.remoteView?.ownRoll ?? null);
  // The look of the scene's collection on the owner's side (`RemoteView.setDiceLook`); its art loads ahead.
  const diceLookId = useAtlasStore((state) => state.remoteView?.diceLookId ?? null);
  useEffect(() => { lookVariant(diceLookId); }, [diceLookId]);
  const display = useDiceDisplay(app ?? undefined);
  const look = useDiceLook(app ?? undefined);
  const { toasts, addToast, dismissToast, dismissAllToasts } = useDiceToasts();
  const [rolls, setRolls] = useState<readonly StackedRoll[]>([]);
  // Mounting with a roll already in the store (a view rebuilt) throws nothing: that roll was shown.
  const shown = useRef<string | null>(ownRoll?.id ?? null);
  /** Where the dice stages live: a canvas and its context belong to one document. */
  const stageDoc = view?.containerEl.doc ?? document;

  useEffect(() => {
    if (!ownRoll || ownRoll.id === shown.current) return;
    shown.current = ownRoll.id;
    const scene = givenRollScene(ownRoll, display);
    // Without WebGL a stage stays blank (white on some systems), so the roll shows as a card, as on the GM's map.
    if (!scene || !canShowDice(stageDoc)) {
      addToast({ result: ownRoll, sourcePresentation: null });
      return;
    }
    warmDiceSounds();
    const thrown = diceLookId === null ? scene : { ...scene, lookId: diceLookId };
    setRolls((prev) => pushRoll(prev, { result: ownRoll, sourcePresentation: null, scene: thrown, style: throwStyle(display) }));
  }, [ownRoll, display, addToast, stageDoc, diceLookId]);

  useEffect(() => {
    if (display !== 'card') warmStages(stageDoc);
  }, [display, stageDoc]);

  // Escape dismisses the rolls on screen, as on the GM's map.
  const showing = rolls.some((roll) => !roll.leaving) || toasts.some((toast) => toast.phase !== 'exiting');
  useEffect(() => {
    if (!showing) return;
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
  }, [showing, view, dismissAllToasts]);

  const close = useCallback((id: string): void => setRolls((prev) => closeRoll(prev, id)), []);
  const dismiss = useCallback((id: string): void => setRolls((prev) => dismissRoll(prev, id)), []);

  if (toasts.length === 0 && rolls.length === 0) return null;
  return (
    <div className={cn('atlas-dice-rolls atlas-vtt-plugin', diceFontClass(look))}>
      {toasts.length > 0 && (
        <svg className="atlas-dice-rolls__defs" aria-hidden="true">
          <defs>
            <g id={DICE_TOAST_KNOT_SYMBOL_ID} fill="none" stroke="currentColor" strokeWidth="10">
              {DICE_TOAST_KNOT_PATHS.map((d, i) => <path key={i} d={d} />)}
            </g>
          </defs>
        </svg>
      )}
      <DiceRollStack rolls={rolls} muted={false} onClose={close} onDone={dismiss} useAvatar={useDiceAvatar} />
      {toasts.map((toast) => (
        <DiceToast key={toast.id} result={toast.result} presentation={toast.sourcePresentation} phase={toast.phase} onDismiss={() => dismissToast(toast.id)} useAvatar={useDiceAvatar} />
      ))}
    </div>
  );
}
