import { describe, expect, it } from 'vitest';
import { CHECKER_CODES, RULE_CODES, type CheckFinding } from '../../../src/app/armarium/upload/uploadContract';
import { findingLine, findingMessage } from '../../../src/app/armarium/upload/text/findingMessages';
import {
  findingPlace,
  findingSections,
  groupedFindings,
  sectionLabel,
  showAllLabel,
  shownGroups,
  timesLabel,
  totalsLabel,
} from '../../../src/app/armarium/upload/text/findingGroups';

const error = (code: string, path?: string, detail?: string): CheckFinding => ({ code, level: 'error', path, detail });
const warning = (code: string, path?: string, detail?: string): CheckFinding => ({ code, level: 'warning', path, detail });

const UNKNOWN = findingMessage(error('a-code-from-a-newer-api'));

describe('finding sentences', () => {
  it.each([...RULE_CODES, ...CHECKER_CODES])('has a sentence of its own for %s', (code) => {
    const message = findingMessage(error(code));
    expect(message).not.toBe(UNKNOWN);
    expect(message).not.toMatch(/\{\w+\}/);
  });

  it('says so of a code it does not know', () => {
    expect(UNKNOWN).toBe('The checks found a problem here that Atlas cannot describe yet.');
  });

  it('names what a note finding\'s detail adds, after its line number', () => {
    expect(findingMessage(error('note-raw-html', 'a.md', '3: iframe'))).toBe('This note uses the HTML tag <iframe>. Write that part in Markdown.');
    expect(findingMessage(error('note-raw-html', 'a.md'))).toBe('This note uses HTML. Write that part in Markdown.');
    expect(findingMessage(error('note-raw-html', 'a.md', '3: '))).toBe('This note uses HTML. Write that part in Markdown.');
    expect(findingMessage(error('note-code-language', 'a.md', '7: dataviewjs'))).toContain('in dataviewjs that');
    expect(findingLine(error('note-raw-html', 'a.md', '3: iframe'))).toBe(3);
    expect(findingLine(error('note-raw-html', 'a.md', 'iframe'))).toBeNull();
    expect(findingLine(error('note-raw-html', 'a.md', '0: iframe'))).toBeNull();
  });

  it('names the formats of a converted picture', () => {
    expect(findingMessage(warning('image-type-converted', 'a.webp', 'png as webp'))).toBe(
      'The name of this picture says WebP, and its content is PNG. The Armarium keeps it as WebP.',
    );
    expect(findingMessage(warning('image-type-converted', 'a.webp', 'tiff as webp'))).toContain('another format than its content is in');
  });

  it('tells the limit a rebuild passed', () => {
    expect(findingMessage(error('rebuild-too-large', undefined, 'contents'))).toContain('very long paths');
    expect(findingMessage(error('rebuild-too-large', undefined, 'bytes'))).toContain('Make its largest pictures smaller');
  });

  it('reads where a loot base finding points', () => {
    expect(findingMessage(error('base-expression', 'loot.base', '/formulas/weight: expression'))).toContain('has a formula');
    expect(findingMessage(error('base-expression', 'loot.base', '/summaries/x: expression'))).toContain('summary of its own');
    expect(findingMessage(error('base-expression', 'loot.base', '/filters: expression'))).toContain('file.inFolder');
    expect(findingMessage(error('base-shape', 'loot.base', '/views/0/image: picture'))).toContain('picture for its cards');
    expect(findingMessage(error('base-shape', 'loot.base', '/views/0/name: label'))).toContain('A view of this loot base');
    expect(findingMessage(error('base-shape', 'loot.base', '/properties/x/displayName: label'))).toContain('A property of this loot base');
    expect(findingMessage(error('base-yaml-unsupported', 'loot.base', 'carriage return'))).toContain('line end');
  });

  it('keeps an unknown field as a note and refuses it as a problem', () => {
    expect(findingMessage(warning('json-unknown-property'))).toContain('It is kept as it is.');
    expect(findingMessage(error('json-unknown-property'))).toContain('the checks refuse');
  });

  it('fills the limits it names', () => {
    expect(findingMessage(error('zip-too-large'))).toContain('1 GB');
    expect(findingMessage(error('image-too-large'))).toContain('8,192 pixels');
    expect(findingMessage(error('file-type', 'a.exe', 'exe'))).toContain('.exe files');
  });
});

describe('finding groups', () => {
  it('places a finding in its data file or by the name it gives', () => {
    expect(findingPlace(error('json-shape', 'a.json', '/state/grid/size: expected a number'))).toBe('state › grid › size');
    expect(findingPlace(error('json-shape', 'a.json', '/a~1b/c~0d'))).toBe('a/b › c~d');
    expect(findingPlace(error('manifest-cover', undefined, 'cover.webp'))).toBe('cover.webp');
    expect(findingPlace(error('file-type', 'a.exe', 'exe'))).toBeNull();
  });

  it('shows identical findings once, with their number', () => {
    const groups = groupedFindings([
      warning('image-animated', 'a.gif'),
      warning('image-animated', 'a.gif'),
      warning('image-animated', 'b.gif'),
      error('image-animated', 'a.gif'),
    ]);
    expect(groups.map((group) => [group.finding.level, group.finding.path, group.count])).toEqual([
      ['warning', 'a.gif', 2],
      ['warning', 'b.gif', 1],
      ['error', 'a.gif', 1],
    ]);
    expect(timesLabel(2)).toBe('Found 2 times.');
    expect(timesLabel(1)).toBeNull();
  });

  it('splits problems from notes and counts what the report did not list', () => {
    const findings = [error('path-colon', 'a:b.md'), warning('image-type-converted', 'c.webp', 'png as webp')];
    const sections = findingSections(findings, { 'path-colon': 4, 'image-type-converted': 150 });
    expect(sections.problems).toMatchObject({ listed: 1, total: 4 });
    expect(sections.notes).toMatchObject({ listed: 1, total: 150 });
    expect(sectionLabel(sections.problems)).toBe('The first 1 of 4 problems');
    expect(sectionLabel(sections.notes)).toBe('The first 1 of 150 notes about this bundle');
    expect(totalsLabel(sections)).toBe('4 problems, 150 notes');
    expect(totalsLabel(findingSections([]))).toBeNull();
    expect(totalsLabel(findingSections([warning('image-animated', 'a.gif')]))).toBe('1 note');
    expect(sectionLabel(findingSections([error('path-colon', 'a:b')]).problems)).toBe('1 problem');
  });

  it('shows the first few of a long group behind Show all', () => {
    const findings = Array.from({ length: 1200 }, (_, n) => warning('image-animated', `${n}.gif`));
    const { notes } = findingSections(findings);
    expect(shownGroups(notes, false)).toHaveLength(3);
    expect(shownGroups(notes, true)).toHaveLength(1200);
    expect(showAllLabel(notes)).toBe('Show all 1,200');
    expect(showAllLabel(findingSections(findings.slice(0, 3)).notes)).toBeNull();
  });
});
