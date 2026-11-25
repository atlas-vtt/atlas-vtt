import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const FILES = ['README.md', 'CONTRIBUTING.md', 'PRIVACY.md', 'package.json', '.github/beta-testing.md', '.github/ISSUE_TEMPLATE/config.yml'];
const OTHER_OWNER = /github\.com\/(?!atlas-vtt\/)[\w.-]+\/atlas-vtt\b/g;

describe('links to this repository', () => {
  // Obsidian's directory review warns when the README links to a repository of this name under another owner.
  it.each(FILES)('%s names no atlas-vtt repository under another owner', (file) => {
    expect(readFileSync(file, 'utf8').match(OTHER_OWNER) ?? []).toEqual([]);
  });
});
