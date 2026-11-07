// @vitest-environment jsdom
import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';

import { EntryLine } from '../../../../src/app/statblocks/render/shared/EntryLine';
import { hitPointsAttribute, namesHitPoints } from '../../../../src/app/statblocks/render/shared/hitPoints';
import { spellGroups } from '../../../../src/app/statblocks/render/shared/spellGroups';
import { statblockImageSrc } from '../../../../src/app/statblocks/render/shared/statblockImage';
import { useTokenPortrait, type StatblockPortrait } from '../../../../src/app/statblocks/render/shared/tokenPortrait';
import { fakeApp } from './sheetTestKit';

describe('spellGroups', () => {
  it('groups spell lines under their headers, with a header for lines before the first', () => {
    const groups = spellGroups(['Cantrips (at will): light', 'Innate', { '1/day each': 'fog cloud' }], 'Wisp knows the following spells:', String);
    expect(groups).toEqual([
      { header: 'Wisp knows the following spells:', spells: [{ spells: 'Cantrips (at will): light' }] },
      { header: 'Innate:', spells: [{ level: '1/day each', spells: 'fog cloud' }] },
    ]);
  });
});

describe('statblockImageSrc', () => {
  it('reads wiki links and vault paths through the vault, and web addresses as they are', () => {
    expect(statblockImageSrc(fakeApp(), '[[art/toad.png|Toad]]', 'Bestiary/Toad.md')).toBe('app://local/art/toad.png');
    expect(statblockImageSrc(fakeApp(), 'https://example.org/toad.png', undefined)).toBe('https://example.org/toad.png');
    expect(statblockImageSrc(undefined, 'art/toad%20one.png', undefined)).toBe('art/toad one.png');
    expect(statblockImageSrc(undefined, 'art/100%.png', undefined)).toBe('art/100%.png');
    expect(statblockImageSrc(fakeApp(), '', undefined)).toBe('');
  });
});

describe('hit point attributes', () => {
  it('marks keys and labels that name hit points', () => {
    expect(namesHitPoints('hp')).toBe(true);
    expect(namesHitPoints(undefined, 'Hit Points:')).toBe(true);
    expect(namesHitPoints('ac', 'Armor')).toBe(false);
    expect(hitPointsAttribute(true)).toEqual({ 'data-hit-points': '' });
    expect(hitPointsAttribute(false)).toEqual({});
  });
});

describe('EntryLine', () => {
  it('runs a name in as written, adding no full stop', () => {
    const { container, rerender } = render(<EntryLine name="Claws" text="Hit: 1d6." nameStyle="run-in" />);
    expect(container.querySelector('.atlas-sb-trait-name')?.textContent).toBe('Claws');
    rerender(<EntryLine name="Ready?" text="Yes." nameStyle="run-in" />);
    expect(container.querySelector('.atlas-sb-trait-name')?.textContent).toBe('Ready?');
  });

  it('keeps the name as written for the Fantasy Statblocks renderer and marks hit point entries', () => {
    const { container } = render(<EntryLine name="Hit Points" text="27 (5d8 + 5)" />);
    expect(container.querySelector('.atlas-sb-trait-name')?.textContent).toBe('Hit Points');
    expect(container.querySelector('.atlas-sb-trait')?.hasAttribute('data-hit-points')).toBe(true);
    expect(container.querySelector('.atlas-dice-link')?.getAttribute('data-formula')).toBe('5d8+5');
  });

  it('renders nothing without a name or text', () => {
    const { container } = render(<EntryLine name={undefined} text="" />);
    expect(container.innerHTML).toBe('');
  });
});

describe('useTokenPortrait', () => {
  function Probe({ app, tokens, seen }: { app: never; tokens: Array<{ imagePath?: string; ringColor?: string }>; seen: Array<StatblockPortrait | undefined> }): null {
    seen.push(useTokenPortrait(app, tokens));
    return null;
  }

  it("resolves the first token's art that the vault holds", () => {
    const file = new TFile('tokens/hob.png');
    const app = {
      vault: {
        getAbstractFileByPath: (path: string) => (path === 'tokens/hob.png' ? file : null),
        getResourcePath: (held: TFile) => `app://local/${held.path}`,
      },
    } as never;
    const seen: Array<StatblockPortrait | undefined> = [];
    render(<Probe app={app} tokens={[{}, { imagePath: 'tokens/hob.png', ringColor: '#ff0000' }]} seen={seen} />);
    expect(seen.at(-1)).toEqual({ src: 'app://local/tokens/hob.png', ringColor: '#ff0000', showRing: undefined });

    render(<Probe app={app} tokens={[{ imagePath: 'tokens/missing.png' }]} seen={seen} />);
    expect(seen.at(-1)).toBeUndefined();
  });
});
