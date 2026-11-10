import { LOG_REACTIONS, type LogReactionEmoji } from '../protocol/index.ts';
import { Pencil, Plus, Reply, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent, type ReactElement, type ReactNode, type Ref } from 'react';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { classes } from './classes.ts';
import type { ShownReaction } from './logAuthors.ts';
import type { RowApi } from './panelTypes.ts';

/** How many reactions the tools offer at once; the others unfold behind "+". */
const QUICK_REACTIONS = 3;

const REACTION_NAMES: Readonly<Record<LogReactionEmoji, { readonly give: string; readonly take: string }>> = {
  '👍': { give: 'Thumbs up', take: 'Remove thumbs up' },
  '❤️': { give: 'Heart', take: 'Remove heart' },
  '😂': { give: 'Laugh', take: 'Remove laugh' },
  '😮': { give: 'Wow', take: 'Remove wow' },
  '😢': { give: 'Sad', take: 'Remove sad' },
  '👎': { give: 'Thumbs down', take: 'Remove thumbs down' },
};

interface ToolProps {
  readonly label: string;
  readonly onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  readonly className?: string;
  readonly pressed?: boolean;
  readonly expanded?: boolean;
  readonly buttonRef?: Ref<HTMLButtonElement>;
  readonly children: ReactNode;
}

/** One control of the tools: a button named by its tooltip. */
function Tool({ label, onClick, className, pressed, expanded, buttonRef, children }: ToolProps): ReactElement {
  return (
    <LabelTooltip label={label}>
      <button ref={buttonRef} type="button" className={classes('atlas-online-log__tool', className)} aria-pressed={pressed} aria-expanded={expanded} onClick={onClick}>
        {children}
      </button>
    </LabelTooltip>
  );
}

export interface RowToolsProps {
  readonly id: string;
  readonly reactions: readonly ShownReaction[];
  readonly canEdit: boolean;
  readonly canDelete: boolean;
  /** The tools ask whether to delete instead of offering themselves. */
  readonly asking: boolean;
  readonly api: RowApi;
}

/**
 * A row's tools, on its top edge: three reactions, "+" for the other three, Reply, and for a chat
 * message of the viewer's own (the GM: any) Edit and Delete. Delete turns the tools into a question;
 * with Shift it deletes at once.
 */
export function RowTools({ id, reactions, canEdit, canDelete, asking, api }: RowToolsProps): ReactElement {
  const [more, setMore] = useState(false);
  const pill = useRef<HTMLDivElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const remove = useRef<HTMLButtonElement>(null);
  const asked = useRef(asking);

  // The question takes the focus, on the answer that changes nothing, and gives it back to Delete.
  useEffect(() => {
    if (asking === asked.current) return;
    asked.current = asking;
    if (asking) keep.current?.focus({ preventScroll: true });
    else if (pill.current?.contains(pill.current.ownerDocument.activeElement) === true) remove.current?.focus({ preventScroll: true });
  }, [asking]);

  const reaction = (emoji: LogReactionEmoji): ReactElement => {
    const mine = reactions.some((given) => given.emoji === emoji && given.mine);
    const react = (): void => {
      api.react(id, emoji, !mine);
      setMore(false);
    };
    return (
      <Tool key={emoji} label={mine ? REACTION_NAMES[emoji].take : REACTION_NAMES[emoji].give} className={classes('atlas-online-log__tool--emoji', mine && 'is-mine')} pressed={mine} onClick={react}>
        <span className="atlas-online-log__emoji">{emoji}</span>
      </Tool>
    );
  };

  const onDelete = (event: MouseEvent<HTMLButtonElement>): void => {
    if (event.shiftKey) return api.remove(id);
    setMore(false);
    api.askDelete(id);
  };

  return (
    <div className="atlas-online-log__tools-anchor">
      <div ref={pill} className="atlas-online-log__tools" role="toolbar">
        <div className={classes('atlas-online-log__tools-layer', asking && 'is-out')} inert={asking}>
          <div className="atlas-online-log__tools-inner">
            {LOG_REACTIONS.slice(0, QUICK_REACTIONS).map(reaction)}
            <div className={classes('atlas-online-log__tools-more', more && 'is-open')} inert={!more}>
              <div className="atlas-online-log__tools-inner">{LOG_REACTIONS.slice(QUICK_REACTIONS).map(reaction)}</div>
            </div>
            <Tool label={more ? 'Fewer reactions' : 'More reactions'} className={classes('atlas-online-log__tool--more', more && 'is-open')} expanded={more} onClick={() => setMore(!more)}>
              <Plus />
            </Tool>
            <span className="atlas-online-log__tools-divider" aria-hidden="true" />
            <Tool label="Reply" onClick={() => api.reply(id)}><Reply /></Tool>
            {canEdit && <Tool label="Edit" onClick={() => api.edit(id)}><Pencil /></Tool>}
            {canDelete && <Tool label="Delete" className="atlas-online-log__tool--danger" buttonRef={remove} onClick={onDelete}><Trash2 /></Tool>}
          </div>
        </div>
        {canDelete && (
          <div className={classes('atlas-online-log__tools-layer', !asking && 'is-out')} inert={!asking}>
            <div className="atlas-online-log__tools-inner">
              <span className="atlas-online-log__tools-question">Delete this message?</span>
              <button type="button" className="atlas-online-log__tool atlas-online-log__tool--text atlas-online-log__tool--danger" onClick={() => api.remove(id)}>Delete</button>
              <button ref={keep} type="button" className="atlas-online-log__tool atlas-online-log__tool--text" onClick={() => api.askDelete(null)}>Keep</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
