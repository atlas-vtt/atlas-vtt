import React from 'react';
import { CopyPlus, Trash2, Type } from 'lucide-react';
import { t } from '../../../../i18n';
import { RadialFan, type FanButton } from '../fan/RadialFan';
import { colourName, notation, spokenDie } from './dieNames';
import type { LabDie } from './labDice';
import type { DieStep } from './DieStepPanel';
import { dieFanSpots } from './trayLayout';

interface DieFanProps {
  die: LabDie;
  /** The die's box in the tray: its centre and its size. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** The step whose panel is open under the die. */
  step: DieStep | null;
  focusFirst: boolean;
  /** Why the die cannot be copied (the set holds as many dice as it may), or null. */
  copyRefusal: string | null;
  /** Why the die cannot be removed (it is the set's last), or null. */
  removeRefusal: string | null;
  onStep: (step: DieStep) => void;
  /** Left out for a die that is never copied: the die advantage rolls. */
  onCopy?: (() => void) | undefined;
  onRemove: () => void;
  /** What removing does, where it is more than taking the die off (the die advantage rolls: the side rolls none). */
  removeLabel?: string | undefined;
  /** For screen readers: the die the fan belongs to. */
  label?: string | undefined;
}

/**
 * The round buttons that fan out over a die on the tray: its sides, name and
 * colour, each opening a step beside the die, then copy and remove. The sides
 * and colour buttons show what the die has.
 */
export function DieFan(props: DieFanProps): React.ReactElement {
  const { die, x, y, width, height, step, focusFirst, copyRefusal, removeRefusal, onStep, onCopy, onRemove, removeLabel, label } = props;
  const buttons: FanButton[] = [
    {
      label: t('diceLab.fanSides', { die: notation(die.sides) }),
      icon: <span className="atlas-dice-lab__fan-sides" aria-hidden="true">{notation(die.sides)}</span>,
      expanded: step === 'sides',
      onClick: () => onStep('sides'),
    },
    { label: t('diceLab.fanName'), icon: <Type />, expanded: step === 'name', onClick: () => onStep('name') },
    {
      label: t('diceLab.fanColour', { colour: colourName(die.colour) }),
      icon: (
        <span className={die.colour ? 'atlas-dice-lab__fan-colour' : 'atlas-dice-lab__fan-colour atlas-dice-lab__swatch-none'}
          style={die.colour ? { backgroundColor: die.colour } : undefined} aria-hidden="true" />
      ),
      expanded: step === 'colour',
      onClick: () => onStep('colour'),
    },
    ...(onCopy ? [{ label: copyRefusal ?? t('diceLab.fanCopy'), icon: <CopyPlus />, disabled: copyRefusal !== null, onClick: onCopy }] : []),
    { label: removeRefusal ?? removeLabel ?? t('diceLab.fanRemove'), icon: <Trash2 />, danger: true, disabled: removeRefusal !== null, onClick: onRemove },
  ];
  return <RadialFan buttons={buttons} spots={dieFanSpots(buttons.length, width, height)} x={x} y={y} label={label ?? spokenDie(die)} focusFirst={focusFirst} />;
}
