import type { FoundEntry } from '../protocol/index.ts';
import { BookOpen } from 'lucide-react';
import { memo, type ReactElement } from 'react';
import { AuthorDisc } from './AuthorDisc.tsx';
import { foundExcerpt } from './foundExcerpt.ts';
import { reactionsFor } from './logAuthors.ts';
import type { ThreadStat } from './logThreads.ts';
import type { RowApi, RowFlags } from './panelTypes.ts';
import { ReactionChips } from './ReactionChips.tsx';
import { RowShell } from './RowShell.tsx';
import { ThreadPill } from './ThreadPill.tsx';

export interface FoundRowProps extends Omit<RowFlags, 'editing'> {
  readonly entry: FoundEntry;
  readonly time: string;
  readonly thread: ThreadStat | null;
  readonly api: RowApi;
  /** Opens the note to read it whole; without it the card shows its opening only. */
  readonly onOpen: (() => void) | undefined;
}

/** A note a readable pin let the players read: its card names it and who found it, and opens it to read. */
export const FoundRow = memo(function FoundRow({ entry, onOpen, time, thread, api, ...flags }: FoundRowProps): ReactElement {
  const reactions = reactionsFor(entry, api.self);
  const finder = entry.who === api.self ? 'you' : entry.name;
  const excerpt = foundExcerpt(entry.body);
  const card = (
    <>
      <span className="atlas-online-log__found-title">{entry.title}</span>
      {excerpt !== '' && <span className="atlas-online-log__found-excerpt">{excerpt}</span>}
      {onOpen !== undefined && (
        <span className="atlas-online-log__found-read">
          <BookOpen aria-hidden="true" />
          Read
        </span>
      )}
    </>
  );
  return (
    <RowShell id={entry.id} className="atlas-online-log__row--shown atlas-online-log__row--found" reactions={reactions} canEdit={false} canDelete={api.moderator} api={api} editing={false} {...flags}>
      <div className="atlas-online-log__message">
        <AuthorDisc who={entry.who} name={entry.name} size="row" />
        <div className="atlas-online-log__content">
          <div className="atlas-online-log__byline">
            <span className="atlas-online-log__name">{`Found by ${finder}`}</span>
            <span className="atlas-online-log__time">{time}</span>
          </div>
          {onOpen === undefined
            ? <div className="atlas-online-log__found">{card}</div>
            : <button type="button" className="atlas-online-log__found atlas-online-log__found--open" aria-label={`Read ${entry.title}`} onClick={onOpen}>{card}</button>}
          <ReactionChips id={entry.id} reactions={reactions} api={api} />
          <ThreadPill stat={thread} onOpen={() => api.openThread(entry.id)} />
        </div>
      </div>
    </RowShell>
  );
});
