import { describe, expect, it } from 'vitest';
import { withoutFrontmatterKeys } from '../../src/app/services/collectionBundle/frontmatterKeys';

const SHARE = new Set(['ext-share']);

describe('withoutFrontmatterKeys', () => {
  it('removes registered note keys, keeps the rest and the byte order mark', () => {
    const text = '﻿---\next-share: everyone\ntags: [a]\n---\nBody\n';
    expect(withoutFrontmatterKeys(text, SHARE)).toBe('﻿---\ntags: [a]\n---\nBody\n');
  });

  it('drops the property with its continuation lines and keeps every other byte', () => {
    const note = [
      '---', 'tags: [a, b]', 'ext-share:', '  - public', '  - except Cara', 'aliases:', '  - Old', "'Ext-Share': Ana", '"ext-share": [x,', '  y]', 'status: open', '---', 'The body says ext-share: public.', '',
    ].join('\n');
    expect(withoutFrontmatterKeys(note, SHARE)).toBe(['---', 'tags: [a, b]', 'aliases:', '  - Old', 'status: open', '---', 'The body says ext-share: public.', ''].join('\n'));
  });

  it('removes a list value', () => {
    expect(withoutFrontmatterKeys('---\next-share:\n- Ana\n- Cara\ntitle: T\n---\n', SHARE)).toBe('---\ntitle: T\n---\n');
  });

  it('removes a property that is the only one', () => {
    expect(withoutFrontmatterKeys('---\next-share: public\n---\nBody', SHARE)).toBe('---\n---\nBody');
  });

  it('keeps Windows line endings, and a key that only starts like the removed one', () => {
    const note = '﻿---\r\next-share: public\r\next-share-extra: 1\r\ntitle: x\r\n---\r\nBody\r\n';
    expect(withoutFrontmatterKeys(note, SHARE)).toBe('﻿---\r\next-share-extra: 1\r\ntitle: x\r\n---\r\nBody\r\n');
  });

  it('returns the very same text with no such property, no frontmatter or an unclosed one', () => {
    for (const note of ['---\ntitle: x\n---\nBody', 'ext-share: public\nBody', '---\next-share: public\nBody', '']) {
      expect(withoutFrontmatterKeys(note, SHARE)).toBe(note);
    }
  });

  it('matches keys without case and removes several at once', () => {
    expect(withoutFrontmatterKeys('---\nExt-Share: a\nsecret: b\nkeep: c\n---\n', new Set(['EXT-SHARE', 'secret']))).toBe('---\nkeep: c\n---\n');
  });

  it('does nothing without keys', () => {
    const note = '---\next-share: a\n---\n';
    expect(withoutFrontmatterKeys(note, new Set())).toBe(note);
  });
});
