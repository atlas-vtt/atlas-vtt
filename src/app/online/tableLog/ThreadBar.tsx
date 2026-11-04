import { ChevronLeft } from 'lucide-react';
import { useRef, type ReactElement } from 'react';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { repliesLabel } from './logThreads.ts';
import { toList, useKeepFocus } from './useKeepFocus.ts';

export interface ThreadBarProps {
  /** The answers in the thread the viewer holds. */
  readonly replies: number;
  /** What arrived in the rest of the log since the thread was opened. */
  readonly unseen: number;
  readonly onBack: () => void;
}

/** Over a thread: the way back to the whole log (also Escape), with what arrived there meanwhile, and how many answers the thread holds. */
export function ThreadBar({ replies, unseen, onBack }: ThreadBarProps): ReactElement {
  const bar = useRef<HTMLDivElement>(null);
  useKeepFocus(bar, toList);
  return (
    <div ref={bar} className="atlas-online-log__thread-bar">
      <LabelTooltip label={unseen > 0 ? `Back to the log, ${unseen} new` : 'Back to the log'}>
        <button type="button" className="atlas-online-log__thread-back" onClick={onBack}>
          <ChevronLeft />
          <span className="atlas-online-log__thread-title">Thread</span>
          {unseen > 0 && <span className="atlas-online-log__thread-unseen" aria-hidden="true">{unseen > 99 ? '99+' : unseen}</span>}
        </button>
      </LabelTooltip>
      <span className="atlas-online-log__thread-replies">{repliesLabel(replies)}</span>
    </div>
  );
}
