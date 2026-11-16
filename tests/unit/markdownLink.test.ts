import { describe, expect, it } from 'vitest';
import { markdownLinkAt } from '../../src/app/services/markdownLink';

describe('a Markdown link read where it starts', () => {
  it('gives its words, its address and where it ends', () => {
    expect(markdownLinkAt('See [Poison](rules/Poison.md) now', 4)).toEqual({ words: 'Poison', address: 'rules/Poison.md', end: 29 });
    expect(markdownLinkAt('[](x)', 0)).toEqual({ words: '', address: 'x', end: 5 });
    expect(markdownLinkAt('[x]()', 0)).toEqual({ words: 'x', address: '', end: 5 });
    expect(markdownLinkAt('[x]( #a )', 0)).toEqual({ words: 'x', address: '#a', end: 9 });
  });

  it('ends its address at the bracket that closes the link, past brackets the address opens and closes', () => {
    expect(markdownLinkAt('[Rage (3/day)](#Rage%20(3/day))!', 0)).toEqual({ words: 'Rage (3/day)', address: '#Rage%20(3/day)', end: 31 });
    expect(markdownLinkAt('[a](b(c(d)e)f)', 0)?.address).toBe('b(c(d)e)f');
    expect(markdownLinkAt('[a](#b) (c)', 0)).toEqual({ words: 'a', address: '#b', end: 7 });
    expect(markdownLinkAt('[a](#b (c)', 0)).toBeNull();
    expect(markdownLinkAt('[a](#b (c', 0)).toBeNull();
  });

  it('reads an address in angle brackets whole, spaces and brackets included', () => {
    expect(markdownLinkAt('[Rest](<#Short Rest (1 hour)>)', 0)).toEqual({ words: 'Rest', address: '#Short Rest (1 hour)', end: 30 });
    expect(markdownLinkAt('[a](<b)', 0)).toBeNull();
    expect(markdownLinkAt('[a](<b> c)', 0)).toBeNull();
    expect(markdownLinkAt('[a](b>c)', 0)).toBeNull();
  });

  it('leaves a title in quotes out of the address', () => {
    expect(markdownLinkAt('[a](#b "The (b)")', 0)).toEqual({ words: 'a', address: '#b', end: 17 });
    expect(markdownLinkAt("[a](<my b> 'b :)' )", 0)).toEqual({ words: 'a', address: 'my b', end: 19 });
    // Quotes that open no title are part of the address, as a space is.
    expect(markdownLinkAt('[a](my "b" note.md)', 0)?.address).toBe('my "b" note.md');
  });

  it('is none where no link starts, or where it runs over the line', () => {
    expect(markdownLinkAt('a [b](c)', 0)).toBeNull();
    expect(markdownLinkAt('[b] (c)', 0)).toBeNull();
    expect(markdownLinkAt('[b]', 0)).toBeNull();
    expect(markdownLinkAt('[b](c', 0)).toBeNull();
    expect(markdownLinkAt('[b](c\nd)', 0)).toBeNull();
  });
});
