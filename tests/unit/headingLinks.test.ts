import { describe, expect, it } from 'vitest';
import { resolveSubpath, type CachedMetadata, type HeadingCache } from 'obsidian';
import { headingLink, headingNamed, headingOutline } from '../../src/app/services/headingLinks';

type Outline = ReadonlyArray<readonly [heading: string, level: number]>;

function noteOf(outline: Outline, firstLine = 0): CachedMetadata {
  return {
    headings: outline.map(([heading, level], index) => {
      const line = firstLine + index * 3;
      return {
        heading, level,
        position: { start: { line, col: 0, offset: line * 10 }, end: { line, col: 0, offset: line * 10 + heading.length } },
      };
    }),
  };
}

const headingsOf = (cache: CachedMetadata): HeadingCache[] => cache.headings ?? [];
const links = (cache: CachedMetadata): string[] => headingsOf(cache).map((heading) => headingLink(cache, heading));

/** What an older Atlas reads a stored heading as: the cached heading of that text, else what Obsidian makes of the link. */
function olderAtlasReads(cache: CachedMetadata, link: string): HeadingCache | undefined {
  const exact = headingsOf(cache).find((heading) => heading.heading === link);
  const line = exact?.position.start.line ?? resolveSubpath(cache, `#${link}`)?.start.line;
  return headingsOf(cache).find((heading) => heading.position.start.line === line);
}

const CHAPTER: Outline = [
  ['Chapter', 1],
  ['Black Ivory Inn', 2], ['Overview', 3], ['Rooms', 3],
  ['Silver Stag', 2], ['Overview', 3],
];

describe('headingLink', () => {
  it('stores a heading no other heading repeats as it always was', () => {
    const cache = noteOf([['Keep', 1], ['Room #3', 2], ['[[Alula|The city]] market', 2]]);
    expect(links(cache)).toEqual(['Keep', 'Room #3', '[[Alula|The city]] market']);
  });

  it('names a repeated heading by the section it is in, the first one too', () => {
    const cache = noteOf(CHAPTER);
    const [, , first, , , second] = links(cache);
    expect(first).toBe('Black Ivory Inn#Overview');
    expect(second).toBe('Silver Stag#Overview');
  });

  it('goes up as far as it takes to tell two sections of one name apart', () => {
    const cache = noteOf([['Town', 1], ['Inn', 2], ['Overview', 3], ['Harbour', 1], ['Inn', 2], ['Overview', 3]]);
    expect(links(cache)).toEqual(['Town', 'Town#Inn', 'Inn#Overview', 'Harbour', 'Harbour#Inn', 'Harbour#Inn#Overview']);
  });

  it('counts past the first where a path cannot tell them apart', () => {
    expect(links(noteOf([['Overview', 2], ['Overview', 2], ['Overview', 2]]))).toEqual(['Overview', 'Overview#', 'Overview##']);
    expect(links(noteOf([['Inn', 1], ['Overview', 2], ['Details', 2], ['Overview', 2]]))).toEqual(['Inn', 'Inn#Overview', 'Details', 'Inn#Overview#']);
  });

  it('writes a section whose name holds a # as Obsidian links to it', () => {
    const cache = noteOf([['Room #3', 1], ['Overview', 2], ['Room #4', 1], ['Overview', 2]]);
    expect(links(cache)).toEqual(['Room #3', 'Room 3#Overview', 'Room #4', 'Room 4#Overview']);
  });

  it('takes headings Obsidian reads alike for repeats, whatever their case or marks', () => {
    const cache = noteOf([['Inn', 1], ['Over: view', 2], ['Stag', 1], ['over view', 2]]);
    expect(links(cache)).toEqual(['Inn', 'Inn#Over view', 'Stag', 'Stag#over view']);
  });

  it('leaves a heading without text as it is', () => {
    const cache = noteOf([['#', 1], ['#', 1], ['Overview', 2], ['Overview', 2]]);
    expect(headingLink(cache, headingsOf(cache)[0]!)).toBe('#');
  });

  it.each<[string, Outline]>([
    ['a chapter', CHAPTER],
    ['a flat note', [['Loot', 2], ['Loot', 2], ['Exit', 2], ['Loot', 2]]],
    ['a heading deeper than the path', [['Inn', 4], ['Town', 1], ['Inn', 2], ['Overview', 3], ['Inn', 2], ['Overview', 3]]],
    ['a path that walks past the heading', [['Overview', 3], ['Inn', 4], ['Inn', 2], ['Overview', 3], ['Overview', 5]]],
    ['a heading above its neighbours', [['Overview', 3], ['Overview', 2], ['Overview', 1], ['Overview', 2]]],
    ['nested repeats', [['A', 1], ['A', 2], ['A', 3], ['A', 2], ['A', 3], ['A', 1], ['A', 2]]],
    ['a heading written like a link', [['Inn', 1], ['Overview', 2], ['Inn#Overview', 1], ['Overview', 2]]],
    ['repeated names with marks', [['Room #3', 2], ['Room #3', 2], ['Room 3', 2]]],
  ])('reads every heading of %s back as itself', (_, outline) => {
    const cache = noteOf(outline);
    for (const heading of headingsOf(cache)) expect(headingNamed(cache, headingLink(cache, heading))).toBe(heading);
  });
});

describe('headingNamed', () => {
  it('keeps reading the links pins already hold as it did', () => {
    const cache = noteOf([['Cellar', 2], ['Keep', 1], ['Cellar', 2], ['Room #3', 2], ['Keep#Cellar', 3]]);
    const [first, , , room, literal] = headingsOf(cache);
    expect(headingNamed(cache, 'Cellar')).toBe(first);
    expect(headingNamed(cache, 'Room #3')).toBe(room);
    expect(headingNamed(cache, 'Keep#Cellar')).toBe(literal);
    expect(headingNamed(cache, 'Tower')).toBeUndefined();
  });

  it('resolves a link written by hand as Obsidian does', () => {
    const cache = noteOf([['Cellar', 2], ['Keep', 1], ['Cellar', 2]]);
    expect(headingNamed(cache, 'keep#cellar')).toBe(headingsOf(cache)[2]);
  });

  it('finds the same heading once text above it has moved its line', () => {
    const before = noteOf(CHAPTER);
    const link = headingLink(before, headingsOf(before)[5]!);
    const edited = noteOf(CHAPTER, 40);
    expect(headingNamed(edited, link)).toBe(headingsOf(edited)[5]);
  });

  it('finds the same heading once a section of another name was added above it', () => {
    const before = noteOf(CHAPTER);
    const link = headingLink(before, headingsOf(before)[5]!);
    const edited = noteOf([['Chapter', 1], ['Harbour', 2], ['Overview', 3], ...CHAPTER.slice(1)]);
    expect(headingNamed(edited, link)).toBe(headingsOf(edited)[7]);
  });

  it('opens the last of its name where the count runs past them', () => {
    const cache = noteOf([['Overview', 2], ['Overview', 2]]);
    expect(headingNamed(cache, 'Overview#####')).toBe(headingsOf(cache)[1]);
  });
});

describe('what an older Atlas makes of a link', () => {
  it('opens the very heading a path names', () => {
    const cache = noteOf(CHAPTER);
    for (const index of [2, 5]) expect(olderAtlasReads(cache, headingLink(cache, headingsOf(cache)[index]!))).toBe(headingsOf(cache)[index]);
  });

  it('opens the first of them where the link counts past it, as it always did', () => {
    const cache = noteOf([['Overview', 2], ['Overview', 2]]);
    expect(olderAtlasReads(cache, headingLink(cache, headingsOf(cache)[1]!))).toBe(headingsOf(cache)[0]);
  });
});

describe('headingOutline', () => {
  it('holds the sections around each heading, as the outline nests them', () => {
    const cache = noteOf([...CHAPTER, ['Skipped', 5], ['Appendix', 1]]);
    expect(headingOutline(headingsOf(cache)).map(({ trail }) => trail.map((heading) => heading.heading))).toEqual([
      [],
      ['Chapter'], ['Chapter', 'Black Ivory Inn'], ['Chapter', 'Black Ivory Inn'],
      ['Chapter'], ['Chapter', 'Silver Stag'],
      ['Chapter', 'Silver Stag', 'Overview'],
      [],
    ]);
  });
});
