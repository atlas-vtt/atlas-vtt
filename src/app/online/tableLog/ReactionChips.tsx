import type { ReactElement } from 'react';
import { classes } from './classes.ts';
import type { ShownReaction } from './logAuthors.ts';
import type { RowApi } from './panelTypes.ts';

/** The reactions an entry has, under its body: a click gives the viewer's or takes it back. The chip follows the log, never the click. */
export function ReactionChips({ id, reactions, api }: { readonly id: string; readonly reactions: readonly ShownReaction[]; readonly api: RowApi }): ReactElement | null {
  if (reactions.length === 0) return null;
  return (
    <div className="atlas-online-log__chips">
      {reactions.map(({ emoji, count, mine }) => (
        <button key={emoji} type="button" className={classes('atlas-online-log__chip', mine && 'is-mine')} aria-pressed={mine} onClick={() => api.react(id, emoji, !mine)}>
          <span className="atlas-online-log__emoji">{emoji}</span>
          <span className="atlas-online-log__chip-count">{count}</span>
        </button>
      ))}
    </div>
  );
}
