import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { templateBlock } from '../../../model/templateHeader';
import type { StatblockTemplate } from '../../../model/templateTypes';
import type { Placement } from '../blockActions';
import { labelTargetIn, type LabelPart } from '../labelTargets';
import type { BlockSelection } from '../selection';
import type { EditorSession } from '../sessionTypes';
import { t } from '../../../../i18n';

/** A new tile asking for its name, for the popover under it. */
export interface NamePrompt {
  blockId: string;
  /** Which of a Metric's labels: its one number's name. */
  part?: LabelPart | undefined;
  /** What the empty input says: "Name component". */
  placeholder: string;
  /** Enter or Tab: a name is committed as the label's first name is and focus goes back to the tile; no name lets the tile go. */
  onCommit: (text: string) => void;
  /** Escape or Undo (`refocus`: focus goes back to where it was before the tile was placed) or a press elsewhere: the tile goes. */
  onCancel: (refocus: boolean) => void;
}

/** Where the editor stood before a tile was placed: what letting the tile go gives back. */
export interface BeforePlacement {
  selection: BlockSelection;
  /** The element focus was in; the selection's tile takes it where that element is gone. */
  focus: HTMLElement | null;
}

export interface BlockNamingInput {
  session: EditorSession;
  template: StatblockTemplate;
  commit: (id: string, text: string, part: LabelPart | undefined) => void;
  select: (selection: BlockSelection, focus?: boolean) => void;
}

export interface BlockNaming {
  /** The tile whose name is asked for; null while none is. */
  naming: NamePrompt | null;
  /** Asks for the name of the tile just placed, where its first label names its property; the answer settles `placement`. */
  askName: (id: string, placement?: Placement, before?: BeforePlacement) => void;
}

/** What the input says before anything is typed, the same for every kind. */
export const NAME_PLACEHOLDER = t('templateEditor.namePlaceholder');

interface Asked {
  id: string;
  part?: LabelPart | undefined;
  placement: Placement | undefined;
  before: BeforePlacement | undefined;
}

function isUnnamed(template: StatblockTemplate, asked: Asked): boolean {
  return templateBlock(template, asked.id) !== null && labelTargetIn(template, asked.id, asked.part)?.kind === 'new-field';
}

/**
 * The name a tile asks for right after it was placed: the label it would take
 * when double-clicked, typed in a popover instead, and committed the same way
 * (`commitLabel`). A tile exists only once named: placing and naming it are one
 * step, and a tile left without a name (Escape, Undo, a press elsewhere, an
 * empty name, the popover going for any other reason) goes again and leaves no step.
 */
export function useBlockNaming({ session, template, commit, select }: BlockNamingInput): BlockNaming {
  const [asked, setAsked] = useState<Asked | null>(null);
  const latest = useRef({ commit, select, asked });
  latest.current = { commit, select, asked };

  const askName = useCallback((id: string, placement?: Placement, before?: BeforePlacement): void => {
    const snapshot = session.getSnapshot();
    const target = snapshot.readOnly ? null : labelTargetIn(snapshot.template, id);
    if (target?.kind === 'new-field') setAsked({ id, part: target.part, placement, before });
    else placement?.keep();
  }, [session]);

  const unnamed = asked !== null && isUnnamed(template, asked);

  const naming = useMemo((): NamePrompt | null => {
    if (!asked || !unnamed) return null;
    const { id, part, placement, before } = asked;
    const letGo = (refocus: boolean): void => {
      placement?.drop();
      setAsked(null);
      if (!refocus || !before) return;
      const { focus, selection } = before;
      if (focus?.isConnected) {
        latest.current.select(selection, false);
        focus.focus({ preventScroll: true });
      } else latest.current.select(selection, true);
    };
    return {
      blockId: id,
      part,
      placeholder: NAME_PLACEHOLDER,
      onCommit: (text) => {
        if (text.trim()) latest.current.commit(id, text, part);
        // No name, or one that named nothing: the tile goes.
        if (isUnnamed(session.getSnapshot().template, asked)) {
          letGo(true);
          return;
        }
        placement?.keep();
        setAsked(null);
        latest.current.select([id], true);
      },
      onCancel: letGo,
    };
  }, [asked, unnamed, session]);

  // The popover went another way: the tile was taken away, or named elsewhere. One still unnamed shows on the next render.
  useEffect(() => {
    if (!asked || naming) return;
    const now = session.getSnapshot().template;
    if (isUnnamed(now, asked)) return;
    if (templateBlock(now, asked.id)) asked.placement?.keep();
    else asked.placement?.drop();
    setAsked(null);
  }, [asked, naming, session, template]);

  // The editor closing while the name is asked for lets the tile go.
  useEffect(() => () => latest.current.asked?.placement?.drop(), []);

  return { naming, askName };
}
