import React from 'react';
import type { TemplateReview } from '../../../../services/collectionBundle/importTemplates';
import { plural } from '../../../../utils/plural';

interface TemplateCopiesProps {
  templates: TemplateReview;
  switchNotes: boolean;
  onSwitchNotesChange: (switchNotes: boolean) => void;
}

/** How many names a list shows before it says how many more there are. */
const SHOWN = 5;

function namesOf(names: readonly string[]): string {
  const shown = names.slice(0, SHOWN).join(', ');
  return names.length > SHOWN ? `${shown} and ${names.length - SHOWN} more` : shown;
}

/**
 * The collection's templates that come in as copies, since the vault's own versions differ,
 * and the choice for the statblocks the vault already had that use them: keep their template
 * (the default) or switch them to the copy.
 */
export function TemplateCopies({ templates, switchNotes, onSwitchNotesChange }: TemplateCopiesProps): React.JSX.Element | null {
  const { copies, reusedNotes } = templates;
  if (copies.length === 0) return null;
  return (
    <div className="atlas-transfer-callout" role="note">
      <strong>
        {copies.length === 1
          ? 'Your version of this template differs, so the collection’s comes in as a copy. Yours stays as it is.'
          : 'Your versions of these templates differ, so the collection’s come in as copies. Yours stay as they are.'}
      </strong>
      <ul>
        {copies.slice(0, SHOWN).map((copy) => <li key={copy.copyName}>{copy.name} → {copy.copyName}</li>)}
        {copies.length > SHOWN && <li>and {copies.length - SHOWN} more</li>}
      </ul>
      {reusedNotes.length > 0 && (
        <label className="atlas-transfer-checkbox">
          <input type="checkbox" checked={switchNotes} onChange={(event) => onSwitchNotesChange(event.target.checked)} />
          <span>
            Switch {plural(reusedNotes.length, 'statblock')} you already had to the copies: {namesOf(reusedNotes.map((note) => note.name))}
          </span>
        </label>
      )}
    </div>
  );
}
