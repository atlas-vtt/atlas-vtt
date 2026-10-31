import { MessagesSquare } from 'lucide-react';
import { useId, type ReactElement } from 'react';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';

/** Counts above this read "99+". */
const MOST = 99;

/**
 * The tab a host shows while the log is closed and something in it is unread, with the count. On
 * the GM's map it stands directly below the scene tabs. A press opens the log.
 */
export function LogUnreadTab({ count, onOpen }: { readonly count: number; readonly onOpen: () => void }): ReactElement {
  const name = useId();
  return (
    <div className="atlas-vtt-plugin atlas-online-log-tab">
      <LabelTooltip label="Open the table log" side="right" describe>
        <button type="button" className="atlas-online-log-tab__button" aria-labelledby={name} onClick={onOpen}>
          <MessagesSquare />
          <span className="atlas-online-log-tab__count" aria-hidden="true">{count > MOST ? `${MOST}+` : count}</span>
          <span id={name} className="atlas-online-log__sr">{`Table log, ${count} new`}</span>
        </button>
      </LabelTooltip>
    </div>
  );
}
