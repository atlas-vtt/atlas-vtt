import React from 'react';
import { cn } from '../../../../utils/cn';
import { StatblockMarkdown } from '../shared/StatblockMarkdown';
import type { BlockDisplay, StandInDisplay } from '../blockDisplay';
import { useSheet } from '../sheetContext';
import { NO_TEXT, hasText, type ShownText } from './shownText';
import { ProblemMarker } from './ProblemMarker';

interface ValueTextProps {
  shown: ShownText;
  /** Plain text keeps Markdown characters as written; dice still link. */
  markdown?: boolean | undefined;
  className?: string | undefined;
}

/** A value's text: Markdown and dice links, then a muted mark where its pattern went wrong. */
export function ValueText({ shown, markdown = true, className }: ValueTextProps): React.JSX.Element {
  const { app, sourcePath } = useSheet();
  return (
    <>
      <span className={cn('atlas-sb-value', className)}>
        {hasText(shown) && <StatblockMarkdown text={shown.text} app={app} sourcePath={sourcePath} markdown={markdown} />}
      </span>
      {shown.problems.length > 0 && <ProblemMarker problems={shown.problems} />}
    </>
  );
}

/** Where a value is empty while the statblock is being edited: its prompt, in the faint text of a blank. */
export function FieldPrompt({ prompt }: { prompt: string }): React.JSX.Element {
  return <span className="atlas-sb-value atlas-sb-prompt">{prompt}</span>;
}

/** What stands in for a block's empty values: its fallback, or the prompt. */
export function StandIn({ display }: { display: StandInDisplay }): React.JSX.Element {
  return display.state === 'prompt' ? <FieldPrompt prompt={display.prompt} /> : <ValueText shown={display.text} />;
}

/** The text of a Title, Line or Stat, or what stands in for it. */
export function DisplayText({ display }: { display: BlockDisplay }): React.JSX.Element {
  return display.state === 'value' ? <ValueText shown={display.text ?? NO_TEXT} /> : <StandIn display={display} />;
}
