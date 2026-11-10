import React from 'react';
import { StatblockSkeleton } from '../../../react/components/statblock/StatblockSkeleton';
import { EditorBar } from './EditorBar';
import type { EditorSession } from './sessionTypes';
import { TemplateEditor, type TemplateEditorProps } from './TemplateEditor';
import { t } from '../../../i18n';

/** Why the view has no session to edit. */
export type TemplateEditorProblem =
  /** The library has not read the file yet. */
  | { kind: 'loading' }
  /** The file is no template this Atlas can read. */
  | { kind: 'unreadable'; problems: readonly string[] }
  /** Another file holds the same template id. */
  | { kind: 'duplicate'; of: string }
  /** The `statblockEditor` experimental switch is off. */
  | { kind: 'off' }
  /** A template that was never saved, and is closed now (Obsidian restarted since). */
  | { kind: 'gone' };

export interface TemplateEditorSurfaceProps extends Omit<TemplateEditorProps, 'session'> {
  session: EditorSession | null;
  problem: TemplateEditorProblem | null;
  /**
   * Raised for each "select this block" request: the editor starts again with
   * that selection. The editor is kept by the view, never by the session.
   */
  selectRequest?: number | undefined;
}

function problemText(problem: Exclude<TemplateEditorProblem, { kind: 'loading' }>): string {
  if (problem.kind === 'off') return t('templateEditor.problem.off');
  if (problem.kind === 'gone') return t('templateEditor.problem.gone');
  if (problem.kind === 'duplicate') return t('templateEditor.problem.duplicate', { other: problem.of });
  return problem.problems[0] ? t('templateEditor.problem.unreadableWhy', { problem: problem.problems[0] }) : t('templateEditor.problem.unreadable');
}

/**
 * What the template editor's view shows (§4.6): the editor once its session
 * is open, a statblock-shaped skeleton while the library reads the file, or
 * why the file cannot be edited.
 */
export function TemplateEditorSurface({ session, problem, selectRequest = 0, ...props }: TemplateEditorSurfaceProps): React.JSX.Element {
  if (session) return <TemplateEditor key={selectRequest} session={session} {...props} />;
  if (!problem || problem.kind === 'loading') {
    return (
      <div className="atlas-te atlas-te--waiting">
        <StatblockSkeleton className="atlas-te-waiting-card" />
      </div>
    );
  }
  return (
    <div className="atlas-te atlas-te--waiting">
      <EditorBar tone="warning" text={problemText(problem)} />
    </div>
  );
}
