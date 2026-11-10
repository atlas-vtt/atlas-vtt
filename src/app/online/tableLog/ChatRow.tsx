import type { ChatEntry } from '../protocol/index.ts';
import { Lock } from 'lucide-react';
import { memo, type ReactElement } from 'react';
import { AuthorDisc, toneClass } from './AuthorDisc.tsx';
import { classes } from './classes.ts';
import { EditField } from './EditField.tsx';
import { InlineText } from './InlineText.tsx';
import { reactionsFor, shownName } from './logAuthors.ts';
import type { ThreadStat } from './logThreads.ts';
import type { Portrait, RowApi, RowFlags } from './panelTypes.ts';
import { ReactionChips } from './ReactionChips.tsx';
import { ReplyQuote } from './ReplyQuote.tsx';
import { RowShell } from './RowShell.tsx';
import { SpeakerFace } from './SpeakerFace.tsx';
import { ThreadPill } from './ThreadPill.tsx';

export interface ChatRowProps extends RowFlags {
  readonly entry: ChatEntry;
  /** Continues the row above: no avatar, no byline. */
  readonly continued: boolean;
  /** How long ago it was said, in words. */
  readonly time: string;
  /** The speaking token's portrait, where it speaks in character and the host has it. */
  readonly portrait: Portrait | null;
  /** "Whisper to Kara and GM" for a whisper; null for a message everyone sees. */
  readonly whisper: string | null;
  /** Its thread's pill, where it has answers and the whole log shows. */
  readonly thread: ThreadStat | null;
  readonly api: RowApi;
}

/** An author as an emote names them: by name, never "You", which reads wrong before a verb. */
const actorName = (entry: ChatEntry): string => entry.speaker?.name ?? shownName(entry.who, entry.name, null);

/**
 * A chat message: who said it and when, what it answers, its text with the rolls written into it,
 * and its reactions. In character it shows the token and its name, the author small beside it; an
 * emote is one line, "Kara draws her sword"; a whisper is set apart and says who it is for.
 */
export const ChatRow = memo(function ChatRow({ entry, continued, time, portrait, whisper, thread, api, ...flags }: ChatRowProps): ReactElement {
  const { id, who, name, text, reply, speaker } = entry;
  const own = api.self !== null && who === api.self;
  const reactions = reactionsFor(entry, api.self);
  const author = shownName(who, name, api.self);
  const inCharacter = entry.style === 'ic' && speaker !== undefined;
  const emote = entry.style === 'emote';
  const edited = entry.edited !== undefined && <span className="atlas-online-log__edited"> (edited)</span>;

  const body = flags.editing ? (
    <EditField text={text} onSave={(next) => api.saveEdit(id, next)} onCancel={api.cancelEdit} />
  ) : emote ? (
    <InlineText
      id={id} text={text} inline={entry.inline} api={api} className="atlas-online-log__emote"
      lead={<><span className={classes('atlas-online-log__emote-name', speaker === undefined && toneClass(who))}>{actorName(entry)}</span>{' '}</>}
    >
      {edited}
      <span className="atlas-online-log__time"> {time}</span>
    </InlineText>
  ) : (
    <InlineText id={id} text={text} inline={entry.inline} api={api}>{edited}</InlineText>
  );

  const avatar = continued || emote ? <span className="atlas-online-log__gutter" aria-hidden="true" />
    : inCharacter ? <SpeakerFace name={speaker.name} portrait={portrait} who={who} ring={speaker.ring} size="row" />
    : <AuthorDisc who={who} name={name} size="row" />;

  return (
    <RowShell
      id={id} reactions={reactions} canEdit={own} canDelete={own || api.moderator} api={api} {...flags}
      className={classes(continued ? 'atlas-online-log__row--continued' : 'atlas-online-log__row--chat', whisper !== null && 'atlas-online-log__row--whisper', emote && 'atlas-online-log__row--emote')}
    >
      {/* In a thread its root heads the list, so an answer to the root quotes nothing. */}
      {reply !== undefined && reply.id !== api.thread && <ReplyQuote reply={reply} self={api.self} onOpen={() => (api.thread === null ? api.openThread(id) : api.jumpTo(reply.id))} />}
      {whisper !== null && !continued && <div className="atlas-online-log__whisper-line"><Lock />{whisper}</div>}
      <div className="atlas-online-log__message">
        {avatar}
        <div className="atlas-online-log__content">
          {!continued && !emote && (
            <div className="atlas-online-log__byline">
              {inCharacter ? (
                <>
                  <span className="atlas-online-log__speaker">{speaker.name}</span>
                  <span className={`atlas-online-log__author ${toneClass(who)}`}>{own ? 'you' : author}</span>
                </>
              ) : (
                <span className={`atlas-online-log__name ${toneClass(who)}`}>{author}</span>
              )}
              <span className="atlas-online-log__time">{time}</span>
            </div>
          )}
          {body}
          <ReactionChips id={id} reactions={reactions} api={api} />
          <ThreadPill stat={thread} onOpen={() => api.openThread(id)} />
        </div>
      </div>
    </RowShell>
  );
});
