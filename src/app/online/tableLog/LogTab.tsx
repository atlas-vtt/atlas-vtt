import { MessagesSquare } from 'lucide-react';
import { useId, type ReactElement } from 'react';
import { t } from '../../i18n';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';

/** Counts above this read "99+". */
const MOST = 99;

/**
 * The tab a host shows while the log is closed, with the count of what came in meanwhile when
 * anything did. On the GM's map it stands directly below the scene tabs. A press opens the log.
 */
export function LogTab({ count, onOpen }: { readonly count: number; readonly onOpen: () => void }): ReactElement {
  const name = useId();
  return (
    <div className="atlas-vtt-plugin atlas-online-log-tab">
      <LabelTooltip label={t('online.log.open')} side="right" describe>
        <button type="button" className="atlas-online-log-tab__button" aria-labelledby={name} onClick={onOpen}>
          <MessagesSquare />
          {count > 0 && <span className="atlas-online-log-tab__count" aria-hidden="true">{count > MOST ? `${MOST}+` : count}</span>}
          <span id={name} className="atlas-online-log__sr">{count > 0 ? t('online.log.tabUnread', { count }) : t('online.log.tab')}</span>
        </button>
      </LabelTooltip>
    </div>
  );
}
