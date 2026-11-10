import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../../../../utils/cn';
import { Skeleton } from '../../../../packages/components/primitives/Skeleton';
import { EASE_OUT_CONTROL_POINTS } from '../../../../utils/motion';
import type { AdvantageSide } from '../../../../types/diceSetTypes';
import { t } from '../../../../i18n';
import { dieTitle, notation, spokenDie } from './dieNames';
import { PlainDie } from './DieStill';
import type { LabDie } from './labDice';
import type { DieImageState } from './useDieImages';

interface TrayDieProps {
  die: LabDie;
  /** The height the die is drawn at. */
  size: number;
  image: DieImageState;
  /** Whether a click opens its fan: the set can be changed. */
  interactive: boolean;
  open: boolean;
  /** Another die's fan is open: this one steps back. */
  dimmed: boolean;
  /** Being dragged to another place. */
  lifted: boolean;
  /** A dragged die would land here. */
  dropTarget: boolean;
  onActivate: (fromKeyboard: boolean) => void;
  onPress: () => void;
  onEnter: () => void;
  /** Alt and an arrow key: the die moves one place along. */
  onShift: (step: -1 | 1) => void;
  /** The die advantage or disadvantage rolls, apart from the set's dice: marked + or −, named as such, never moved. */
  edge?: AdvantageSide | undefined;
}

/** What the tray calls the die a side rolls, for screen readers. */
export function edgeCaption(side: AdvantageSide): string {
  return side === 'advantage' ? t('diceLab.advantageDie') : t('diceLab.disadvantageDie');
}

/** The side a die is rolled for, under it: its name says it is no die of the set's. */
const sideCaption = (side: AdvantageSide): string => (side === 'advantage' ? t('diceLab.advantage') : t('diceLab.disadvantage'));

/** The least room the label under the die a side rolls takes: the side's name and its sides fit. */
const EDGE_LABEL_WIDTH = 132;

function spoken(die: LabDie, edge: AdvantageSide | undefined): string {
  if (!edge) return spokenDie(die);
  return edge === 'advantage' ? t('diceLab.spokenAdvantageDie', { die: spokenDie(die) }) : t('diceLab.spokenDisadvantageDie', { die: spokenDie(die) });
}

/** A die arrives dropped onto the tray and leaves sinking into it. */
export const DIE_MOTION = {
  initial: { opacity: 0, scale: 0.6, y: -10 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.28, ease: EASE_OUT_CONTROL_POINTS } },
  exit: { opacity: 0, scale: 0.7, transition: { duration: 0.14, ease: EASE_OUT_CONTROL_POINTS } },
} as const;

/**
 * One die on the tray as it will roll, with its name under it. A click opens
 * its fan; pressing it and moving onto another die moves it there.
 */
export function TrayDie(props: TrayDieProps): React.ReactElement {
  const { die, size, image, interactive, open, dimmed, lifted, dropTarget, onActivate, onPress, onEnter, onShift, edge } = props;
  // While a new colour is drawn the die keeps the image it had, so it never blinks.
  const [shown, setShown] = useState<DieImageState>(image);
  if (image !== undefined && image !== shown) setShown(image);
  const width = Math.round(size * (shown?.aspect ?? 1));
  const style = { '--atlas-die-colour': die.colour, width, height: size } as React.CSSProperties;
  const named = die.name.trim() !== '';

  const body = shown === undefined
    ? <Skeleton shape="circle" live className="atlas-dice-lab__die-skeleton" />
    : shown === null
      ? <PlainDie sides={die.sides} />
      : <motion.img key={shown.url} src={shown.url} alt="" draggable={false} className="atlas-dice-lab__die-image"
        initial={{ opacity: 0.4, scale: 0.94 }} animate={{ opacity: 1, scale: 1, transition: { duration: 0.22, ease: EASE_OUT_CONTROL_POINTS } }} />;

  return (
    <motion.div
      layout="position"
      className={cn('atlas-dice-lab__cell', edge && `atlas-dice-lab__cell--edge atlas-dice-lab__cell--${edge}`, dimmed && 'atlas-dimmed', lifted && 'atlas-lifted')}
      {...DIE_MOTION}
    >
      {interactive ? (
        <button
          type="button"
          data-die={die.id}
          className={cn('atlas-dice-lab__die', open && 'atlas-selected', dropTarget && 'atlas-drop-target')}
          style={style}
          aria-label={spoken(die, edge)}
          aria-expanded={open}
          aria-keyshortcuts={edge ? undefined : 'Alt+ArrowLeft Alt+ArrowRight'}
          onClick={(event) => onActivate(event.detail === 0)}
          // The primary button only; a right or middle press drags nothing
          onPointerDown={(event) => { if (!edge && !(event.button > 0)) onPress(); }}
          onPointerEnter={onEnter}
          onKeyDown={(event) => {
            if (edge || !event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
            event.preventDefault();
            onShift(event.key === 'ArrowLeft' ? -1 : 1);
          }}
        >
          {body}
          {edge && <span className="atlas-dice-lab__edge-mark" aria-hidden="true">{edge === 'advantage' ? '+' : '−'}</span>}
        </button>
      ) : (
        <span data-die={die.id} className="atlas-dice-lab__die" style={style} role="img" aria-label={spoken(die, edge)}>
          {body}
          {edge && <span className="atlas-dice-lab__edge-mark" aria-hidden="true">{edge === 'advantage' ? '+' : '−'}</span>}
        </span>
      )}
      <span className="atlas-dice-lab__die-label" aria-hidden="true" style={{ maxWidth: Math.max(width, edge ? EDGE_LABEL_WIDTH : 72) }}>
        <span className={cn('atlas-dice-lab__die-name', !named && !edge && 'atlas-faint')}>{named || !edge ? dieTitle(die) : sideCaption(edge)}</span>
        {(named || edge) && <span className="atlas-dice-lab__die-sides">{notation(die.sides)}</span>}
      </span>
    </motion.div>
  );
}
