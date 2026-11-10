import type { SharedRoll } from '../protocol/index.ts';
import { Dices } from 'lucide-react';
import { useId, useState, type ReactElement, type ReactNode } from 'react';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { classes } from './classes.ts';
import { textSegments, type TextSegment } from './inlineSegments.ts';
import type { RowApi } from './panelTypes.ts';
import { critClass, RollDice } from './rollDice.tsx';
import { ROLL_MODE_INFO } from './rollModes.ts';

export interface InlineTextProps {
  readonly id: string;
  readonly text: string;
  readonly inline: readonly SharedRoll[] | undefined;
  readonly api: RowApi;
  /** What stands before the text on its first line (an emote's name). */
  readonly lead?: ReactNode;
  readonly className?: string;
  /** What follows the text on its last line ("(edited)"). */
  readonly children?: ReactNode;
}

/**
 * A message's text as text, with the rolls written into it: a roll it rolled shows its total (its
 * formula on hover, its dice on a click), a roll button rolls for whoever presses it.
 */
export function InlineText({ id, text, inline, api, lead, className, children }: InlineTextProps): ReactElement {
  const [open, setOpen] = useState<number | null>(null);
  const diceId = useId();
  const segments = textSegments(text, inline);
  const shown = open === null ? null : segments[open];

  const piece = (segment: TextSegment, at: number): ReactNode => {
    if (segment.kind === 'text') return segment.text;
    if (segment.kind === 'rolled') {
      const { roll } = segment;
      return (
        <LabelTooltip key={at} label={roll.formula} describe>
          <button
            type="button" className={classes('atlas-online-log__inline-roll', critClass(roll, 'atlas-online-log__inline-roll'))}
            aria-expanded={open === at} aria-controls={open === at ? diceId : undefined} onClick={() => setOpen(open === at ? null : at)}
          >
            {roll.total}
          </button>
        </LabelTooltip>
      );
    }
    const { mark, index } = segment;
    const badge = ROLL_MODE_INFO[mark.mode].badge;
    return (
      <button
        key={at} type="button" className="atlas-online-log__roll-button" disabled={!api.canSend}
        onClick={() => api.roll({ formula: mark.formula, mode: mark.mode, request: { id, index } })}
      >
        <Dices />
        <span className="atlas-online-log__roll-button-label">{mark.label ?? mark.formula}</span>
        {badge !== null && <span className="atlas-online-log__mode-badge">{badge}</span>}
      </button>
    );
  };

  return (
    <>
      <div className={classes('atlas-online-log__text', className)}>
        {lead}
        {segments.map(piece)}
        {children}
      </div>
      {shown?.kind === 'rolled' && <RollDice id={diceId} roll={shown.roll} />}
    </>
  );
}
