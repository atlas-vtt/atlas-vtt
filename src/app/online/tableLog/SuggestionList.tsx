import type { TablePerson } from '../protocol/index.ts';
import { useMemo, useState, type ReactElement } from 'react';
import { classes } from './classes.ts';
import { suggestionsFor, type Suggestion } from './commandSuggestions.ts';

export interface SuggestionList {
  readonly items: readonly Suggestion[];
  readonly open: boolean;
  /** The row the arrow keys are on. */
  readonly active: number;
  readonly move: (step: number) => void;
  readonly pick: (index: number) => void;
  /** Closes the list until the text changes. */
  readonly dismiss: () => void;
}

/** What the field offers for its text, and which of it the arrow keys are on: the first again whenever the offer changes. */
export function useSuggestions(draft: string, people: readonly TablePerson[], self: string | null): SuggestionList {
  const items = useMemo(() => suggestionsFor(draft, people, self), [draft, people, self]);
  const offer = items.map((item) => item.key).join('\n');
  const [pick, setPick] = useState({ offer: '', index: 0 });
  const [dismissed, setDismissed] = useState<string | null>(null);
  const active = pick.offer === offer ? Math.min(pick.index, items.length - 1) : 0;
  return {
    items,
    open: items.length > 0 && dismissed !== draft,
    active,
    move: (step) => setPick({ offer, index: (active + step + items.length) % items.length }),
    pick: (index) => setPick({ offer, index }),
    dismiss: () => setDismissed(draft),
  };
}

export interface SuggestionListProps {
  readonly id: string;
  readonly list: SuggestionList;
  readonly onComplete: (item: Suggestion) => void;
}

/** The commands or people the field offers, above it; the focus stays in the field, which names the row it is on. */
export function SuggestionList({ id, list, onComplete }: SuggestionListProps): ReactElement {
  return (
    <div id={id} role="listbox" aria-label="Suggestions" className="atlas-dropdown-content atlas-dropdown-content--top atlas-online-log__suggestions">
      {list.items.map((item, index) => (
        <div
          key={item.key} id={`${id}-${index}`} role="option" aria-selected={index === list.active}
          className={classes('atlas-online-log__suggestion', index === list.active && 'is-active')}
          // The field keeps the focus: a press here must not take it.
          onMouseDown={(event) => event.preventDefault()}
          onPointerEnter={() => list.pick(index)}
          onClick={() => onComplete(item)}
        >
          <span className="atlas-online-log__suggestion-label">{item.label}</span>
          {item.kind === 'command' && <span className="atlas-online-log__suggestion-hint">{item.description}</span>}
        </div>
      ))}
    </div>
  );
}
