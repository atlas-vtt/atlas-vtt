import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '../../../../packages/components/primitives/button';
import { serializeTemplate } from '../../../format/templateFormat';
import { useTemplateEditor } from '../editorContext';
import { readOnlyMessage } from '../sessionEdit';
import { readTemplateJson, saysTheSame, type JsonReading } from './templateJson';
import { t } from '../../../../i18n';
import './json.scss';

/** How long typing pauses before a valid text is taken. */
export const APPLY_DELAY_MS = 400;

const UNREAD: JsonReading = { template: null, problems: [] };

/**
 * The whole template as JSON, in the note's column beside the card, for what
 * the tiles do not offer (patterns, conditions, lookup tables, columns). A
 * valid text is taken as one undo step once typing pauses, on leaving the
 * field and on Done; the card shows the last one taken. What changes the
 * template elsewhere (undo, a tile moved on the card) rewrites the text.
 */
export function TemplateJsonEditor({ onDone }: { onDone: () => void }): React.JSX.Element {
  const { session, snapshot } = useTemplateEditor();
  const { template, readOnly } = snapshot;
  const labelId = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const fileText = useMemo(() => serializeTemplate(template), [template]);
  const [text, setText] = useState(fileText);
  const reading = useMemo(() => (readOnly ? UNREAD : readTemplateJson(text, template.id)), [readOnly, text, template.id]);

  useEffect(() => {
    setText((typed) => (saysTheSame(readTemplateJson(typed, template.id), fileText) ? typed : fileText));
  }, [fileText, template.id]);

  const latest = useRef({ reading, fileText });
  latest.current = { reading, fileText };
  const take = useCallback((): void => {
    const { reading: read, fileText: held } = latest.current;
    const next = read.template;
    if (next && !saysTheSame(read, held)) session.apply(() => next);
  }, [session]);

  useEffect(() => {
    const timer = window.setTimeout(take, APPLY_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [text, take]);
  // Leaving the view takes what was typed within the pause.
  useEffect(() => take, [take]);
  useEffect(() => field.current?.focus({ preventScroll: true }), []);

  const locked = readOnlyMessage(snapshot);
  const refused = !readOnly && reading.template === null;
  return (
    <div className="atlas-te-json" data-te-region="json">
      <div className="atlas-te-json__head">
        <span id={labelId} className="atlas-te-json__title">{t('templateEditor.json.title')}</span>
        <Button type="button" variant="default" size="sm" onClick={onDone}>{t('templateEditor.done')}</Button>
      </div>
      {locked && <p className="atlas-te-json__note">{locked}</p>}
      <textarea
        ref={field}
        className="atlas-te-json__text"
        aria-labelledby={labelId}
        value={text}
        readOnly={readOnly}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onChange={(event) => setText(event.target.value)}
        onBlur={take}
      />
      {reading.problems.length > 0 && (
        <div className="atlas-te-json__problems" role="status" data-refused={refused || undefined}>
          <span className="atlas-te-json__state">{refused ? t('templateEditor.json.refused') : t('templateEditor.json.taken')}</span>
          <ul>
            {reading.problems.map((problem, index) => <li key={`${index}:${problem}`}>{problem}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
