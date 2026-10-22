import type { FoundEntry, ImageEntry, LogSpeaker, RollEntry, TablePerson } from '../protocol/index.ts';
import { ArrowDown, MessagesSquare } from 'lucide-react';
import { useEffect, useState, type FocusEvent, type KeyboardEvent, type ReactElement } from 'react';
import { audienceNames } from './audience.ts';
import { ChatRow } from './ChatRow.tsx';
import { FoundRow } from './FoundRow.tsx';
import { classes } from './classes.ts';
import { continuesPrevious, shownName } from './logAuthors.ts';
import type { ShownEntry } from './LogState.ts';
import type { ThreadStat } from './logThreads.ts';
import { dayLabel, relativeTime, sameDay } from './logTime.ts';
import type { Portrait, RollFace, RowApi } from './panelTypes.ts';
import { RestRow } from './RestRow.tsx';
import { RollRow } from './RollRow.tsx';
import { SecretRow } from './SecretRow.tsx';
import { ImageRow, LootRow } from './ShownRows.tsx';
import type { LogScroll } from './useLogScroll.ts';
import type { LogUi } from './useLogUi.ts';

/** How often the rows' "5m ago" is read again. */
const CLOCK_MS = 30_000;

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export interface LogListProps {
  /** What the list shows: the whole log, or a thread with its root first (`api.thread`). */
  readonly entries: readonly ShownEntry[];
  /** The pills of the whole log's threads, by their roots. */
  readonly stats: ReadonlyMap<string, ThreadStat>;
  /** The answer the message field is set to, in a thread. */
  readonly selected: string | null;
  readonly ui: LogUi;
  readonly api: RowApi;
  readonly scroll: LogScroll;
  readonly rollFace: ((entry: RollEntry) => RollFace | null) | undefined;
  readonly speakerPortrait: ((speaker: LogSpeaker) => Portrait | null) | undefined;
  readonly people: readonly TablePerson[];
  readonly imageSrc: ((entry: ImageEntry) => string | null) | undefined;
  readonly openImage: ((entry: ImageEntry) => void) | undefined;
  readonly openFound: ((entry: FoundEntry) => void) | undefined;
  readonly onTabStop: (id: string) => void;
}

const hasTools = (entry: ShownEntry): boolean => entry.kind === 'chat' || entry.kind === 'roll' || entry.kind === 'image' || entry.kind === 'loot' || entry.kind === 'found' || entry.kind === 'rest';

/** The way down, over the list's lower edge: what arrived below, or just the way where nothing did. */
function JumpPill({ scroll }: { readonly scroll: LogScroll }): ReactElement {
  const label = scroll.pending === 0 ? 'Jump to latest' : scroll.pending === 1 ? '1 new message' : `${scroll.pending} new messages`;
  return (
    <button type="button" className={classes('atlas-online-log__jump', scroll.away && 'is-visible')} inert={!scroll.away} onClick={scroll.jump}>
      {label}
      <ArrowDown />
    </button>
  );
}

/**
 * The log, oldest at the top: chat messages (those of one author close together as one block),
 * rolls, private rolls the viewer is not shown, rests, lines about who came and left, and a line between
 * two days. The Tab key reaches one row; the arrow keys move between rows. A thread stands under
 * its root, which is ruled off from the answers.
 */
export function LogList({ entries, stats, selected, ui, api, scroll, rollFace, speakerPortrait, people, imageSrc, openImage, openFound, onTabStop }: LogListProps): ReactElement {
  const now = useNow();
  const inThread = api.thread !== null;
  const portraitOf = (speaker: LogSpeaker | undefined): Portrait | null => (speaker === undefined ? null : speakerPortrait?.(speaker) ?? null);
  const rows = entries.filter(hasTools);
  const tabStop = rows.find((entry) => entry.id === ui.tabStop)?.id ?? rows.at(-1)?.id ?? null;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const row = event.target as HTMLElement;
    if ((event.key !== 'ArrowUp' && event.key !== 'ArrowDown') || row.dataset.entry === undefined) return;
    const all = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-entry]'));
    const next = all[all.indexOf(row) + (event.key === 'ArrowUp' ? -1 : 1)];
    if (next === undefined) return;
    event.preventDefault();
    next.focus();
  };
  const onFocus = (event: FocusEvent<HTMLDivElement>): void => {
    const id = (event.target as HTMLElement).closest<HTMLElement>('[data-entry]')?.dataset.entry;
    if (id !== undefined) onTabStop(id);
  };

  return (
    <div className="atlas-online-log__body">
      <div ref={scroll.listRef} className="atlas-online-log__list" tabIndex={-1} onScroll={scroll.onScroll}>
        {entries.length === 0 && (
          <div className="atlas-online-log__empty">
            <MessagesSquare />
            <span>Nothing yet. Say hello, or roll some dice.</span>
          </div>
        )}
        <div ref={scroll.rowsRef} className={classes('atlas-online-log__rows', inThread && 'atlas-online-log__rows--thread')} role="log" onKeyDown={onKeyDown} onFocus={onFocus}>
          {entries.map((entry, index) => {
            const before = entries[index - 1];
            const newDay = before === undefined || !sameDay(before.at, entry.at);
            const time = relativeTime(entry.at, now);
            const flags = { asking: ui.asking === entry.id, tapped: ui.tapped === entry.id, highlighted: ui.highlighted === entry.id, selected: selected === entry.id, tabStop: tabStop === entry.id };
            const thread = stats.get(entry.id) ?? null;
            return (
              <div key={entry.id} className={classes('atlas-online-log__item', entry.id === api.thread && 'atlas-online-log__item--root')}>
                {newDay && <div className="atlas-online-log__day" role="separator"><span>{dayLabel(entry.at, now)}</span></div>}
                {entry.kind === 'chat' && (
                  <ChatRow
                    entry={entry} continued={!newDay && continuesPrevious(before, entry)} time={time} thread={thread} api={api} editing={ui.editing === entry.id} {...flags}
                    portrait={entry.style === 'ic' ? portraitOf(entry.speaker) : null}
                    whisper={entry.to === undefined ? null : `Whisper to ${audienceNames(entry.to, people, api.self)}`}
                  />
                )}
                {entry.kind === 'roll' && <RollRow entry={entry} face={rollFace?.(entry) ?? null} portrait={portraitOf(entry.speaker)} time={time} thread={thread} api={api} {...flags} />}
                {entry.kind === 'secret' && <SecretRow entry={entry} self={api.self} time={time} />}
                {entry.kind === 'image' && <ImageRow entry={entry} src={imageSrc?.(entry) ?? null} onOpen={openImage === undefined ? undefined : () => openImage(entry)} time={time} thread={thread} api={api} {...flags} />}
                {entry.kind === 'loot' && <LootRow entry={entry} time={time} thread={thread} api={api} {...flags} />}
                {entry.kind === 'rest' && <RestRow entry={entry} time={time} thread={thread} api={api} {...flags} />}
                {entry.kind === 'found' && <FoundRow entry={entry} onOpen={openFound === undefined ? undefined : () => openFound(entry)} time={time} thread={thread} api={api} {...flags} />}
                {(entry.kind === 'joined' || entry.kind === 'left') && (
                  <div className="atlas-online-log__presence">
                    {entry.kind === 'joined' ? `${shownName(entry.who, entry.name, api.self)} joined the table` : `${shownName(entry.who, entry.name, api.self)} left the table`}
                    <span className="atlas-online-log__time">{time}</span>
                  </div>
                )}
              </div>
            );
          })}
          {inThread && entries.length === 1 && <div className="atlas-online-log__thread-empty">No replies yet. Start the thread.</div>}
        </div>
      </div>
      <JumpPill scroll={scroll} />
    </div>
  );
}
