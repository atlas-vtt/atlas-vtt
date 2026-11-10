import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { cn } from '../../../../../utils/cn';
import { handledByAnotherControl } from '../../../../keyboard/tooltipEscape';
import { MAX_SET_DICE, MAX_SET_GROUPS } from '../../../../gameSystems/diceSets';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';
import { EASE_OUT_CONTROL_POINTS } from '../../../../utils/motion';
import { t } from '../../../../i18n';
import { DieFan } from './DieFan';
import { DieStepPanel, type DieStep } from './DieStepPanel';
import type { AdvantageSide } from '../../../../types/diceSetTypes';
import { diceLimit, nextDie, withChange, withCopy, withMove, without, type DiceLimit, type DieChange, type EdgeDie, type LabDie } from './labDice';
import { dieSize } from './trayLayout';
import { DIE_MOTION, edgeCaption, TrayDie } from './TrayDie';
import { useDieDrag } from './useDieDrag';
import { useDieImages } from './useDieImages';
import { useTrayPlaces } from './useTrayPlaces';
import type { EditPace } from './useLabSet';

interface DiceTrayProps {
  dice: readonly LabDie[];
  /** Whether the dice can be changed; a built-in set only shows them. */
  editable: boolean;
  /** The set's name, for screen readers. */
  setName: string;
  onDice: (dice: LabDie[], pace: EditPace) => void;
  /** The dice advantage and disadvantage roll, lying apart from the set's dice. */
  edgeDice?: readonly EdgeDie[] | undefined;
  /** A side's die changed, or was taken off (null): the side then rolls no die. */
  onEdgeDie?: ((side: AdvantageSide, change: DieChange | null, pace: EditPace) => void) | undefined;
}

const NO_EDGE_DICE: readonly EdgeDie[] = [];

const PANEL_MOTION = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.2, ease: EASE_OUT_CONTROL_POINTS } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.1, ease: EASE_OUT_CONTROL_POINTS } },
} as const;

/** Why dice past a limit cannot be had. */
const limitText = (limit: DiceLimit): string =>
  (limit === 'dice' ? t('diceLab.tooManyDice', { most: MAX_SET_DICE }) : t('diceLab.tooManyGroups', { most: MAX_SET_GROUPS }));

/**
 * The set's dice lying on a tray, drawn by the dice the map throws, each with
 * its name under it, and a + to add another. A click on a die fans its buttons
 * out over it (sides, name, colour, copy, remove); sides, name and colour open
 * a step beside the die. Dice can be dragged, or moved with Alt and the arrow
 * keys, to another place. Escape closes the step, then the fan. The dice
 * advantage and disadvantage roll lie in a row of their own under the set's,
 * marked + and −; their fan sets sides, name and colour, or takes them off.
 */
export function DiceTray({ dice, editable, setName, onDice, edgeDice = NO_EDGE_DICE, onEdgeDie }: DiceTrayProps): React.ReactElement {
  const tray = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const [doc, setDoc] = useState<Document | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [step, setStep] = useState<DieStep | null>(null);
  /** Opened from the keyboard: the fan's first button, or the step's current choice, takes focus. */
  const [keyboard, setKeyboard] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  /** A die that moved under the keyboard keeps its focus. */
  const [refocus, setRefocus] = useState<string | null>(null);
  const image = useDieImages([...dice, ...edgeDice.map((edge) => edge.die)], doc);
  const setField = useCallback((element: HTMLDivElement | null): void => {
    field.current = element;
    setDoc(element?.ownerDocument ?? null);
  }, []);
  const openEdge = edgeDice.find((edge) => edge.die.id === openId) ?? null;
  const open = dice.find((die) => die.id === openId) ?? openEdge?.die ?? null;
  const size = dieSize(dice.length + edgeDice.length + (editable ? 1 : 0));
  const layoutKey = [...dice, ...edgeDice.map((edge) => edge.die)].map((die) => `${die.id}:${die.sides}`).join();
  const places = useTrayPlaces(tray, field, panel, open ? open.id : null, `${layoutKey}|${step ?? ''}|${size}`);
  // Kept while the panel of another step leaves, so the one that opens is measured
  const setPanel = useCallback((element: HTMLDivElement | null): void => {
    if (element) panel.current = element;
  }, []);
  const addLimit = diceLimit([...dice, nextDie(dice)]);

  const focusDie = (id: string | null): void => {
    const target = id === null ? null : field.current?.querySelector<HTMLElement>(`[data-die="${id}"]`);
    (target ?? field.current?.querySelector<HTMLElement>('.atlas-dice-lab__add'))?.focus({ preventScroll: true });
  };

  // A panel opened over the die takes the place of its fan: focus in the leaving fan moves into the
  // panel, so Escape still reaches the tray and steps back.
  const panelSide = open && step ? places.panel?.side : undefined;
  useEffect(() => {
    const doc = field.current?.ownerDocument;
    const active = doc?.activeElement;
    if (panelSide !== 'above' || !doc || (active !== doc.body && !active?.closest('.atlas-csm-fan'))) return;
    panel.current?.focus({ preventScroll: true });
  }, [panelSide]);

  useEffect(() => {
    if (refocus === null) return;
    focusDie(refocus);
    setRefocus(null);
  }, [refocus]);

  /** Makes `next` the dice, unless it breaks a limit of the set; then says why under the die. */
  const change = (next: LabDie[], pace: EditPace): boolean => {
    const limit = diceLimit(next);
    setRefusal(limit && limitText(limit));
    if (limit) return false;
    onDice(next, pace);
    return true;
  };

  const close = (): void => {
    setOpenId(null);
    setStep(null);
    setRefusal(null);
  };

  const activate = (id: string, fromKeyboard: boolean): void => {
    if (id === openId) {
      close();
      return;
    }
    setOpenId(id);
    setStep(null);
    setRefusal(null);
    setKeyboard(fromKeyboard);
  };

  const drag = useDieDrag(doc, (id, onto) => {
    close();
    change(withMove(dice, id, dice.findIndex((die) => die.id === onto)), 'now');
  });

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key !== 'Escape' || openId === null || handledByAnotherControl(event.nativeEvent)) return;
    // Escape steps back one level, and the dialog stays open
    event.preventDefault();
    event.stopPropagation();
    if (step !== null) {
      const fanButton = field.current?.querySelector<HTMLElement>(`.atlas-csm-fan [aria-expanded="true"]`);
      setStep(null);
      setRefusal(null);
      fanButton?.focus({ preventScroll: true });
      return;
    }
    const id = openId;
    close();
    focusDie(id);
  };

  /** Changes the open die: one of the set's, or the die a side of advantage rolls. */
  const changeOpen = (next: DieChange, pace: EditPace): boolean => {
    if (!open) return false;
    if (!openEdge) return change(withChange(dice, open.id, next), pace);
    onEdgeDie?.(openEdge.side, next, pace);
    return true;
  };

  const copyRefusal = dice.length >= MAX_SET_DICE ? limitText('dice') : null;
  const removeRefusal = dice.length <= 1 ? t('diceLab.lastDie') : null;

  return (
    // The step panel lies beside the field, not in it: the field scrolls and would cut it. The group is the
    // tray, so the panel stays part of the dice it changes.
    <div ref={tray} className="atlas-dice-lab__tray" role="group" aria-label={t('diceLab.trayOf', { name: setName })} onKeyDown={onKeyDown}>
      <div
        ref={setField}
        className={cn('atlas-dice-lab__field', open && 'atlas-focused', drag.lifted && 'atlas-dragging')}
        onClick={(event) => { if (event.target === event.currentTarget) close(); }}
      >
        <AnimatePresence initial={false}>
          {dice.map((die, index) => (
            <TrayDie
              key={die.id}
              die={die}
              size={size}
              image={image(die)}
              interactive={editable}
              open={die.id === openId}
              dimmed={open !== null && die.id !== openId}
              lifted={drag.lifted === die.id}
              dropTarget={drag.target === die.id}
              onActivate={(fromKeyboard) => activate(die.id, fromKeyboard)}
              onPress={() => drag.press(die.id)}
              onEnter={() => drag.enter(die.id)}
              onShift={(by) => {
                if (change(withMove(dice, die.id, index + by), 'now')) setRefocus(die.id);
              }}
            />
          ))}
          {editable && (
            <motion.div key="add" layout="position" className={cn('atlas-dice-lab__cell', open && 'atlas-dimmed')} {...DIE_MOTION}>
              <LabelTooltip label={addLimit ? limitText(addLimit) : t('diceLab.addDie')}>
                <button
                  type="button"
                  className="atlas-dice-lab__add"
                  style={{ width: size, height: size }}
                  aria-disabled={addLimit ? true : undefined}
                  onClick={() => {
                    if (addLimit) return;
                    close();
                    change([...dice, nextDie(dice)], 'now');
                  }}
                >
                  <Plus aria-hidden="true" />
                </button>
              </LabelTooltip>
              <span className="atlas-dice-lab__die-label" aria-hidden="true">
                {dice.length === 0 && <span className="atlas-dice-lab__die-name atlas-faint">{t('diceLab.firstDie')}</span>}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {edgeDice.length > 0 && (
          <div className="atlas-dice-lab__edge-row">
            <AnimatePresence initial={false}>
              {edgeDice.map(({ side, die }) => (
                <TrayDie
                  key={die.id}
                  die={die}
                  size={size}
                  image={image(die)}
                  interactive={editable}
                  open={die.id === openId}
                  dimmed={open !== null && die.id !== openId}
                  lifted={false}
                  dropTarget={false}
                  edge={side}
                  onActivate={(fromKeyboard) => activate(die.id, fromKeyboard)}
                  onPress={() => undefined}
                  onEnter={() => undefined}
                  onShift={() => undefined}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        <AnimatePresence>
          {open && places.die && places.panel?.side !== 'above' && (
            <DieFan
              key={open.id}
              die={open}
              x={places.die.x}
              y={places.die.y}
              width={places.die.width}
              height={places.die.height}
              step={step}
              focusFirst={keyboard}
              copyRefusal={copyRefusal}
              removeRefusal={openEdge ? null : removeRefusal}
              onStep={(next) => { setStep(next === step ? null : next); setRefusal(null); }}
              onCopy={openEdge ? undefined : () => { if (change(withCopy(dice, open.id), 'now')) setRefusal(null); }}
              {...(openEdge && {
                label: `${edgeCaption(openEdge.side)}, ${open.name.trim() || `d${open.sides}`}`,
                removeLabel: openEdge.side === 'advantage' ? t('diceLab.fanRemoveEdge') : t('diceLab.fanRemoveDisadvantageEdge'),
              })}
              onRemove={() => {
                close();
                if (openEdge) {
                  onEdgeDie?.(openEdge.side, null, 'now');
                  setRefocus('');
                  return;
                }
                const at = dice.findIndex((die) => die.id === open.id);
                if (change(without(dice, open.id), 'now')) setRefocus(dice[at + 1]?.id ?? dice[at - 1]?.id ?? '');
              }}
            />
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {open && step && (
          <motion.div
            key={`${open.id}-${step}`}
            ref={setPanel}
            className="atlas-dice-lab__step-panel"
            tabIndex={-1}
            data-side={places.panel?.side}
            style={places.panel
              ? { left: places.panel.left, top: places.panel.top, maxHeight: places.panel.maxHeight ?? undefined }
              : { left: 0, top: 0, visibility: 'hidden' }}
            {...PANEL_MOTION}
          >
            <DieStepPanel
              step={step}
              die={open}
              focusChoice={keyboard}
              refusal={refusal}
              onChange={changeOpen}
              onDone={() => setStep(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
