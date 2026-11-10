// @vitest-environment jsdom
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarkdownRenderer, type App } from 'obsidian';
import { inlineMarkdown } from '../../../../src/app/statblocks/render/shared/inlineMarkdown';
import { StatblockMarkdown } from '../../../../src/app/statblocks/render/shared/StatblockMarkdown';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('inlineMarkdown', () => {
  it('escapes a line Markdown would read as a block, so a value shows as written', () => {
    expect(inlineMarkdown('-')).toBe('\\-');
    expect(inlineMarkdown('- fire')).toBe('\\- fire');
    expect(inlineMarkdown('* x')).toBe('\\* x');
    expect(inlineMarkdown('+ 5')).toBe('\\+ 5');
    expect(inlineMarkdown('1.')).toBe('1\\.');
    expect(inlineMarkdown('3. Bite')).toBe('3\\. Bite');
    expect(inlineMarkdown('12) x')).toBe('12\\) x');
    expect(inlineMarkdown('# 5')).toBe('\\# 5');
    expect(inlineMarkdown('##')).toBe('\\##');
    expect(inlineMarkdown('> quoted')).toBe('\\> quoted');
    expect(inlineMarkdown('---')).toBe('\\---');
    expect(inlineMarkdown('* * *')).toBe('\\* * *');
  });

  it('leaves inline Markdown, numbers and text of several lines alone', () => {
    for (const text of ['+5', '-5 ft', '*italic*', '**bold**', '1.5', '—', 'a - b', '#tag', '2d6 + 3', 'Fire; cold']) {
      expect(inlineMarkdown(text)).toBe(text);
    }
    expect(inlineMarkdown('First\n- a list')).toBe('First\n- a list');
  });

  it('is what every statblock renderer hands to Obsidian: "-" for "none" is no empty bullet', () => {
    const rendered = vi.spyOn(MarkdownRenderer, 'render');
    render(<StatblockMarkdown text="-" app={{} as App} sourcePath="Bog Lurker.md" />);
    expect(rendered.mock.calls[0]?.[1]).toBe('\\-');
  });
});
