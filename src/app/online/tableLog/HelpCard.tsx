import { X } from 'lucide-react';
import type { ReactElement } from 'react';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { COMMANDS } from './commandList.ts';

/** The dice notation, by example, as Foundry VTT writes it. */
const NOTATION: readonly (readonly [string, string])[] = [
  ['2d20kh1', 'Advantage: keep the highest'],
  ['4d6kh3', 'Keep the three highest'],
  ['r1, ro<2, rr1', 'Reroll a 1, anything below 2 once, 1s until none is left'],
  ['x, xo, x>=9', 'Roll again on the highest face, once only, on 9 or more'],
  ['!, !3, !i', 'Roll again once, up to three times, without end'],
  ['cs>=5, >=5', 'Count successes from 5'],
  ['cf<=1', 'Count failures up to 1'],
  ['d%, dF', 'Percentile and Fate dice'],
  ['2d6[fire]', 'Name a part of the roll'],
  ['+ - * / ( )', 'Arithmetic'],
  ['[[1d20+5]]', 'In a message: rolled as it is sent'],
  ['[[/r 1d20+2]]{Dex save}', 'In a message: a button anyone can roll'],
  ['/r 1d20 # Attack', 'Describe the roll after #'],
];

const spellings = (name: string, aliases: readonly string[]): string => [name, ...aliases].map((word) => `/${word}`).join(' ');

/** The commands and the dice notation, in the panel above the message field. */
export function HelpCard({ onClose }: { readonly onClose: () => void }): ReactElement {
  return (
    <div className="atlas-online-log__help" role="region" aria-label="Chat help">
      <div className="atlas-online-log__help-head">
        <span className="atlas-online-log__help-title">Commands</span>
        <LabelTooltip label="Close help">
          <button type="button" className="atlas-online-log__strip-clear" onClick={onClose}><X /></button>
        </LabelTooltip>
      </div>
      <dl className="atlas-online-log__help-list">
        {COMMANDS.map((command) => (
          <div key={command.name} className="atlas-online-log__help-row">
            <dt className="atlas-online-log__help-term">{spellings(command.name, command.aliases)}</dt>
            <dd className="atlas-online-log__help-text">{command.description}</dd>
          </div>
        ))}
      </dl>
      <span className="atlas-online-log__help-title">Dice</span>
      <dl className="atlas-online-log__help-list">
        {NOTATION.map(([term, text]) => (
          <div key={term} className="atlas-online-log__help-row">
            <dt className="atlas-online-log__help-term">{term}</dt>
            <dd className="atlas-online-log__help-text">{text}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
