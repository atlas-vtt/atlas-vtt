/** What the search field of a place flyout says. */
export interface PinPlaceSearchTexts {
  /** The field's name and its placeholder. */
  label: string;
  /** Shown where no icon has the name typed. */
  empty: string;
}

export interface PinPlaceSearchOptions {
  texts: PinPlaceSearchTexts;
  /** Every icon's button with its name, in the flyout's order. */
  buttons: readonly { button: HTMLButtonElement; name: string }[];
  /** The groups' sections: one without an icon left is hidden with its heading. */
  sections: readonly HTMLElement[];
  /** The first icon the search leaves is picked (Enter). */
  onPick: (button: HTMLButtonElement) => void;
  /** Escape in the empty field. */
  onClose: () => void;
  /** Arrow down leaves the field for the icons. */
  onDown: () => void;
}

export interface PinPlaceSearch {
  focus: () => void;
  /** Empties the field and shows every icon again. */
  clear: () => void;
  /** Whether the event's target is the field: its keys are text, not the flyout's. */
  owns: (target: EventTarget | null) => boolean;
}

/**
 * A search field for a flyout of icons, by name, in `field`: what is typed leaves the icons whose
 * name holds it, and where none does `list` says so. Enter picks the first of them, Escape
 * empties the field and then closes the flyout.
 */
export function createPinPlaceSearch(field: HTMLElement, list: HTMLElement, options: PinPlaceSearchOptions): PinPlaceSearch {
  const { texts, buttons, sections } = options;
  const input = field.createEl('input', {
    cls: 'pin-place-search',
    attr: { type: 'text', placeholder: texts.label, 'aria-label': texts.label, autocomplete: 'off', spellcheck: 'false' },
  });
  const empty = list.createDiv({ cls: 'pin-place-empty', text: texts.empty });
  empty.hidden = true;

  const filter = (): void => {
    const query = input.value.trim().toLowerCase();
    let left = 0;
    for (const { button, name } of buttons) {
      button.hidden = query !== '' && !name.toLowerCase().includes(query);
      if (!button.hidden) left++;
    }
    for (const section of sections) section.hidden = section.querySelector('button:not([hidden])') === null;
    empty.hidden = left > 0;
  };

  input.addEventListener('input', filter);
  input.addEventListener('keydown', (e) => {
    // Typing is no shortcut of whatever lies under the flyout.
    e.stopPropagation();
    if (e.key === 'Enter') {
      const first = buttons.find(({ button }) => !button.hidden);
      if (first) options.onPick(first.button);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      options.onDown();
    } else if (e.key === 'Escape') {
      if (input.value === '') {
        options.onClose();
        return;
      }
      input.value = '';
      filter();
    }
  });

  return {
    focus: () => input.focus(),
    clear: () => {
      if (input.value === '') return;
      input.value = '';
      filter();
    },
    owns: (target) => target === input,
  };
}
