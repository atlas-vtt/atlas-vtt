import { GM_AUTHOR, type RollEntry } from '../protocol/index.ts';
import { ChevronDown, CornerDownRight, EyeOff } from 'lucide-react';
import { memo, useId, useState, type ReactElement } from 'react';
import { TokenPortrait } from '../../packages/components/shared/TokenPortrait';
import { AuthorDisc } from './AuthorDisc.tsx';
import { classes } from './classes.ts';
import { reactionsFor, shownName } from './logAuthors.ts';
import type { ThreadStat } from './logThreads.ts';
import type { ShownEntry } from './LogState.ts';
import type { Portrait, RollFace, RowApi, RowFlags } from './panelTypes.ts';
import { ReactionChips } from './ReactionChips.tsx';
import { critClass, formulaLine, RollDice } from './rollDice.tsx';
import { ROLL_MODE_INFO } from './rollModes.ts';
import { RowShell } from './RowShell.tsx';
import { SpeakerFace } from './SpeakerFace.tsx';
import { ThreadPill } from './ThreadPill.tsx';

export interface RollRowProps extends Omit<RowFlags, 'editing'> {
  readonly entry: RollEntry & Pick<ShownEntry, 'hidden'>;
  /** The token the roll names, as the viewer may know it. */
  readonly face: RollFace | null;
  /** The speaking token's portrait, where the roll names a speaker and the host has it. */
  readonly portrait: Portrait | null;
  readonly time: string;
  /** Its thread's pill, where it has answers and the whole log shows. */
  readonly thread: ThreadStat | null;
  readonly api: RowApi;
}

/** Who rolled, the token first where the viewer knows its name: "Kara (Mira) rolled". */
function rolledBy(roller: string, token: string | null): string {
  return token === null || token === '' ? `${roller} rolled` : `${token} (${roller}) rolled`;
}

/** The roll's token, its speaker before the token a roll names. */
function RollAvatar({ entry, face, portrait }: Pick<RollRowProps, 'entry' | 'face' | 'portrait'>): ReactElement {
  const { speaker, who, name } = entry;
  if (speaker !== undefined) return <SpeakerFace name={speaker.name} portrait={portrait} who={who} ring={speaker.ring} size="roll" />;
  if (face?.portrait) return <TokenPortrait className="atlas-online-log__roll-portrait" src={face.portrait.src} alt="" showRing={face.portrait.showRing} ringColor={face.portrait.ringColor} />;
  return <AuthorDisc who={who} name={name} size="roll" />;
}

/**
 * A roll, in the look of an entry of Atlas's dice log: the token's portrait or the roller's disc,
 * who rolled and what for, the roll button it answers, who sees it, the formula and its total, and
 * the dice on demand.
 */
export const RollRow = memo(function RollRow({ entry, face, portrait, time, thread, api, ...flags }: RollRowProps): ReactElement {
  const { id, who, name, roll, flavor, request, mode } = entry;
  const [open, setOpen] = useState(false);
  const dice = useId();
  const reactions = reactionsFor(entry, api.self);
  const roller = shownName(who, name, api.self);
  const ability = roll.source?.abilityName;
  // A roll answering a button in a whisper among players goes to that whisper's people, not to the GM.
  const badge = mode === undefined ? null : mode === 'gm' && entry.to?.includes(GM_AUTHOR) === false ? 'Whisper' : ROLL_MODE_INFO[mode].badge;
  return (
    <RowShell id={id} className="atlas-online-log__row--roll" reactions={reactions} canEdit={false} canDelete={false} api={api} editing={false} {...flags}>
      <div className={classes('atlas-online-log__roll', critClass(roll, 'atlas-online-log__roll'), mode !== undefined && 'atlas-online-log__roll--private')}>
        <RollAvatar entry={entry} face={face} portrait={portrait} />
        <div className="atlas-online-log__roll-body">
          <div className="atlas-online-log__byline">
            <span className="atlas-online-log__roll-who">{rolledBy(roller, entry.speaker?.name ?? face?.name ?? null)}</span>
            {badge !== null && <span className="atlas-online-log__mode-badge">{badge}</span>}
            <span className="atlas-online-log__time">{time}</span>
          </div>
          {request !== undefined && (
            <button type="button" className="atlas-online-log__roll-request" onClick={() => api.jumpTo(request.id)}>
              <CornerDownRight />
              <span className="atlas-online-log__roll-request-text">{`for ${request.label}`}</span>
            </button>
          )}
          {ability !== undefined && ability !== '' && <span className="atlas-online-log__roll-ability atlas-dice-toast__ability">{ability}</span>}
          {flavor !== undefined && flavor !== request?.label && <span className="atlas-online-log__roll-flavor atlas-dice-toast__ability">{flavor}</span>}
          <div className="atlas-online-log__roll-summary">
            <span className="atlas-online-log__roll-formula">{formulaLine(roll)}</span>
            <span className="atlas-online-log__roll-equals" aria-hidden="true">=</span>
            <span className="atlas-online-log__roll-total">{roll.total}</span>
          </div>
          <button type="button" className="atlas-online-log__roll-toggle" aria-expanded={open} aria-controls={dice} onClick={() => setOpen(!open)}>
            <ChevronDown className={classes('atlas-online-log__roll-chevron', open && 'is-open')} />
            Dice
          </button>
          {open && <RollDice id={dice} roll={roll} />}
          {entry.hidden === true && <span className="atlas-online-log__roll-hidden"><EyeOff />Only you see this roll</span>}
        </div>
      </div>
      <ReactionChips id={id} reactions={reactions} api={api} />
      <ThreadPill stat={thread} onOpen={() => api.openThread(id)} />
    </RowShell>
  );
});
