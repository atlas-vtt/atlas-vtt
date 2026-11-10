import { useRef, type ReactElement } from 'react';
import { AuthorDisc } from './AuthorDisc.tsx';
import { repliesLabel, type ThreadStat } from './logThreads.ts';
import { toRow, useKeepFocus } from './useKeepFocus.ts';

/** Under a message with answers: the faces of the first three who answered and how many answers there are. A click opens the thread. */
export function ThreadPill({ stat, onOpen }: { readonly stat: ThreadStat | null; readonly onOpen: () => void }): ReactElement | null {
  return stat === null ? null : <Pill stat={stat} onOpen={onOpen} />;
}

/** The pill itself: it goes once its thread opens, and leaves the focus on its row, the thread's root. */
function Pill({ stat, onOpen }: { readonly stat: ThreadStat; readonly onOpen: () => void }): ReactElement {
  const pill = useRef<HTMLButtonElement>(null);
  useKeepFocus(pill, toRow);
  return (
    <button ref={pill} type="button" className="atlas-online-log__thread-pill" onClick={onOpen}>
      <span className="atlas-online-log__thread-faces" aria-hidden="true">
        {stat.repliers.map((replier) => <AuthorDisc key={replier.who} who={replier.who} name={replier.name} size="quote" />)}
      </span>
      <span className="atlas-online-log__thread-count">{repliesLabel(stat.count)}</span>
    </button>
  );
}
