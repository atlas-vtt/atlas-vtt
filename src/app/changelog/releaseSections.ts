import type { ReleaseSection } from './types';

const HEADING = /^(#{1,2}) (.+)$/gm;

/** Splits release-note Markdown at its `#` group and `##` category headings so each renders with its own label. */
export function splitReleaseSections(markdown: string): ReleaseSection[] {
  const sections: ReleaseSection[] = [];
  let label: string | null = null;
  let level: ReleaseSection['level'] = null;
  let start = 0;
  const push = (end: number): void => {
    const body = markdown.slice(start, end).trim();
    if (body || label !== null) sections.push({ label, level, markdown: body });
  };
  for (const heading of markdown.matchAll(HEADING)) {
    push(heading.index);
    label = heading[2]!.trim();
    level = heading[1] === '#' ? 1 : 2;
    start = heading.index + heading[0].length;
  }
  push(markdown.length);
  return sections;
}
