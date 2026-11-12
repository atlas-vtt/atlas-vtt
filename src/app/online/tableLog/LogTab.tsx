import { MessagesSquare } from 'lucide-react';
import { useId, type ReactElement } from 'react';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';

/** Counts above this read "99+". */
const MOST = 99;

/**
 * The tab a host shows while the log is closed: a press opens the log, and it counts what came in
 * unread meanwhile (no count while nothing did). On the GM's map it stands directly below the scene tabs.
 */
export function LogTab({ count, onOpen }: { readonly count: number; readonly onOpen: () => void }): ReactElement {
  const name = useId();
  return (
    <div className="atlas-vtt-plugin atlas-online-log-tab">
      <LabelTooltip label="Open the table log" side="right" describe>
        <button type="button" className="atlas-online-log-tab__button" aria-labelledby={name} onClick={onOpen}>
          <MessagesSquare />
          {count > 0 && <span className="atlas-online-log-tab__count" aria-hidden="true">{count > MOST ? `${MOST}+` : count}</span>}
          <span id={name} className="atlas-online-log__sr">{count > 0 ? `Table log, ${count} new` : 'Table log'}</span>
        </button>
      </LabelTooltip>
    </div>
  );
}
