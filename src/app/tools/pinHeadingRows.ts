import type { HeadingCache } from 'obsidian';
import { headingOutline, type HeadingOutlineEntry } from '../services/headingLinks';

const SEPARATOR = ' › ';

/** The headings a typed query finds: by their own text, the sections around them, or their path written as a link (`inn#over`). */
export function matchingHeadings(headings: readonly HeadingCache[], needle: string): HeadingOutlineEntry[] {
  return headingOutline(headings).filter(({ heading, trail }) => {
    const names = [...trail, heading].map((part) => part.heading.toLowerCase());
    return names.join(SEPARATOR).includes(needle) || names.join('#').includes(needle);
  });
}

/** A heading's row in the pin's search: its level, its name with the sections around it under that, and its note. */
export function fillHeadingRow(item: HTMLElement, { heading, trail }: HeadingOutlineEntry, noteLabel: string): void {
  item.addClass('pin-header-item');
  item.createSpan({ cls: 'pin-header-level', text: `H${heading.level}` });
  const text = item.createDiv({ cls: 'pin-result-text' });
  text.createSpan({ cls: 'pin-result-name', text: heading.heading });
  if (trail.length > 0) {
    const path = text.createDiv({ cls: 'pin-header-trail' });
    trail.forEach((section, index) => {
      if (index > 0) path.createSpan({ cls: 'pin-header-separator', text: SEPARATOR });
      path.createSpan({ cls: 'pin-header-section', text: section.heading });
    });
  }
  item.createSpan({ cls: 'pin-header-file', text: noteLabel });
}
