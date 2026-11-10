import { describe, expect, it } from 'vitest';
import { splitReleaseSections } from '../../src/app/changelog/releaseSections';

describe('release note sections', () => {
  it('splits headings into labelled categories and keeps their bodies', () => {
    const sections = splitReleaseSections('## New\n\n- Feature.\n\n## Fixed\n\n- Bug.\n\n## Important changes\n\n- Removed.');
    expect(sections).toEqual([
      { label: 'New', level: 2, markdown: '- Feature.' },
      { label: 'Fixed', level: 2, markdown: '- Bug.' },
      { label: 'Important changes', level: 2, markdown: '- Removed.' },
    ]);
  });
  it('keeps unlabelled leading notes and ignores empty input', () => {
    expect(splitReleaseSections('- Plain note.\n\n## Notes\n\n- Other.')).toEqual([
      { label: null, level: null, markdown: '- Plain note.' },
      { label: 'Notes', level: 2, markdown: '- Other.' },
    ]);
    expect(splitReleaseSections('   ')).toEqual([]);
  });
  it('keeps group headings apart from the categories under them, also a group without notes of its own', () => {
    expect(splitReleaseSections("# What's New\n## New Feature: Online Play\n- Tables.\n# What's Fixed / Improved\n\n- Fog.")).toEqual([
      { label: "What's New", level: 1, markdown: '' },
      { label: 'New Feature: Online Play', level: 2, markdown: '- Tables.' },
      { label: "What's Fixed / Improved", level: 1, markdown: '- Fog.' },
    ]);
  });
});
