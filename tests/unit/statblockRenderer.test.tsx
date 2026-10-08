import React from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { STATBLOCK_LIMITS } from '../../src/app/creatures/statblockValues';
import { HOSTILE_VALUES, counts, resetCounts } from '../mocks/hostileValues';
import { StatblockRenderer } from '../../src/app/react/components/statblock/StatblockRenderer';
import type {
  StatblockItem,
  StatblockLayout,
} from '../../src/app/react/components/statblock/statblockTypes';

function layoutOf(...blocks: StatblockItem[]): StatblockLayout {
  return { name: 'Test', id: 'test', blocks };
}

/** Renders without an `app`, so markdown falls back to plain text. */
function renderStatblock(layout: StatblockLayout, monster: Record<string, unknown>) {
  return render(<StatblockRenderer layout={layout} monster={monster} />);
}

describe('StatblockRenderer', () => {
  it('renders a heading at the requested level', () => {
    const { container } = renderStatblock(
      layoutOf({ type: 'heading', id: 'h', properties: ['name'], size: 2 }),
      { name: 'Giant Toad' },
    );

    expect(container.querySelector('h2')?.textContent).toBe('Giant Toad');
  });

  it('renders a property line with its label and value', () => {
    const { container } = renderStatblock(
      layoutOf({ type: 'property', id: 'p', properties: ['ac'], display: 'AC' }),
      { ac: 12 },
    );

    expect(container.querySelector('.atlas-sb-property-name')?.textContent).toBe('AC');
    expect(container.querySelector('.atlas-sb-property')?.textContent).toContain('12');
  });

  it('falls back to a dash for empty unconditioned properties', () => {
    const { container } = renderStatblock(
      layoutOf({ type: 'property', id: 'p', properties: ['ac'], display: 'AC' }),
      {},
    );

    expect(container.querySelector('.atlas-sb-property')?.textContent).toContain('-');
  });

  it('hides conditioned blocks whose properties are absent', () => {
    const { container } = renderStatblock(
      layoutOf({ type: 'property', id: 'p', properties: ['ac'], conditioned: true }),
      {},
    );

    expect(container.querySelector('.atlas-sb-property')).toBeNull();
  });

  it('joins subheading properties with the configured separator', () => {
    const { container } = renderStatblock(
      layoutOf({
        type: 'subheading',
        id: 's',
        properties: ['size', 'type'],
        separator: ' — ',
      }),
      { size: 'Medium', type: 'Animal' },
    );

    expect(container.querySelector('.atlas-sb-subheading')?.textContent).toBe('Medium — Animal');
  });

  it('renders each trait with its name and description', () => {
    const { container } = renderStatblock(
      layoutOf({ type: 'traits', id: 't', properties: ['actions'], heading: 'Actions' }),
      { actions: [{ name: 'Bite', desc: 'Deals 1d4 damage.' }] },
    );

    expect(container.querySelector('.atlas-sb-section-heading')?.textContent).toContain('Actions');
    expect(container.querySelector('.atlas-sb-trait-name')?.textContent).toBe('Bite');
    expect(container.querySelector('.atlas-sb-trait')?.textContent).toContain('1d4');
  });

  it('computes ability modifiers in table blocks', () => {
    const { container } = renderStatblock(
      layoutOf({
        type: 'table',
        id: 'tb',
        properties: ['stats'],
        headers: ['STR', 'DEX'],
        calculate: true,
      }),
      { stats: [16, 8] },
    );

    const cells = container.querySelectorAll('td');
    expect(cells[0]?.textContent).toContain('+3');
    expect(cells[1]?.textContent).toContain('-1');
  });

  it('renders only the matching branch of an ifelse block', () => {
    const { container } = renderStatblock(
      layoutOf({
        type: 'ifelse',
        id: 'ie',
        conditions: [
          {
            condition: 'return monster.legendary === true',
            nested: [{ type: 'text', id: 'a', properties: [], text: 'Legendary' }],
          },
          {
            condition: '',
            nested: [{ type: 'text', id: 'b', properties: [], text: 'Ordinary' }],
          },
        ],
      }),
      { legendary: false },
    );

    expect(container.textContent).toContain('Ordinary');
    expect(container.textContent).not.toContain('Legendary');
  });

  it('lays inline groups out as separate items', () => {
    const { container } = renderStatblock(
      layoutOf({
        type: 'inline',
        id: 'i',
        properties: [],
        nested: [
          { type: 'property', id: 'i1', properties: ['hp'], display: 'HP' },
          { type: 'property', id: 'i2', properties: ['ac'], display: 'AC' },
        ],
      }),
      { hp: 9, ac: 12 },
    );

    expect(container.querySelectorAll('.atlas-sb-inline-item')).toHaveLength(2);
  });

  it('resolves nested layout blocks through the provided resolver', () => {
    const nested = layoutOf({ type: 'text', id: 'n', properties: [], text: 'From nested layout' });
    const { container } = render(
      <StatblockRenderer
        layout={layoutOf({ type: 'layout', id: 'l', layout: 'nested' })}
        monster={{}}
        resolveLayout={(id) => (id === 'nested' ? nested : null)}
      />,
    );

    expect(container.textContent).toContain('From nested layout');
  });

  it('renders DOM returned by a javascript block', () => {
    const { container } = renderStatblock(
      layoutOf({
        type: 'javascript',
        id: 'js',
        code: "const el = document.createElement('div'); el.className = 'stat-line'; el.textContent = monster.name; return el;",
      }),
      { name: 'Acid Burrower' },
    );

    expect(container.querySelector('.stat-line')?.textContent).toBe('Acid Burrower');
  });

  it('groups spells under their header lines', () => {
    const { container } = renderStatblock(
      layoutOf({ type: 'spells', id: 'sp', properties: ['spells'] }),
      { spells: ['The toad knows:', { '1st level': 'magic missile' }] },
    );

    expect(container.textContent).toContain('The toad knows:');
    expect(container.querySelector('.atlas-sb-spell-level')?.textContent).toContain('1st level');
  });

  it('skips spell entries that are no text and no level list', () => {
    // An empty list item in a note's frontmatter is read as null
    const { container } = renderStatblock(
      layoutOf({ type: 'spells', id: 'sp', properties: ['spells'] }),
      { name: 'Toad', spells: ['The toad knows:', null, {}, 3, { '1st level': 'magic missile' }] },
    );
    const spells = [...container.querySelectorAll('.atlas-sb-spells li')].map((spell) => spell.textContent);
    expect(spells).toEqual(['1st level: magic missile']);
  });

  it('skips trait entries that are no trait', () => {
    // An empty list item in a note's frontmatter is read as null
    const { container } = renderStatblock(
      layoutOf({ type: 'traits', id: 't', properties: ['actions'], heading: 'Actions' }),
      { name: 'Toad', actions: [{ name: 'Bite', desc: 'One target.' }, null, 'leap', 3, { name: 'Tongue', desc: 'Pulls.' }] },
    );
    const names = [...container.querySelectorAll('.atlas-sb-trait-name')].map((name) => name.textContent);
    expect(names).toEqual(['Bite', 'Tongue']);
  });

  it('drops the trailing colon from property labels', () => {
    const { container } = renderStatblock(
      layoutOf({ type: 'property', id: 'p', properties: ['difficulty'], display: 'Difficulty:' }),
      { difficulty: 14 },
    );

    expect(container.querySelector('.atlas-sb-property-name')?.textContent).toBe('Difficulty');
  });

  it('omits values a layout callback could not resolve instead of printing undefined', () => {
    const { container } = renderStatblock(
      layoutOf({
        type: 'property',
        id: 'p',
        properties: ['attack'],
        display: 'Attack',
        callback: 'return monster.attack + " - " + monster.range + " - " + monster.damage;',
      }),
      { attack: 'Claws' },
    );

    expect(container.querySelector('.atlas-sb-property')?.textContent).toBe('AttackClaws');
  });

  it('renders a rule after groups and inline blocks that ask for one', () => {
    const { container } = renderStatblock(
      layoutOf(
        {
          type: 'group',
          id: 'g',
          properties: [],
          hasRule: true,
          nested: [{ type: 'property', id: 'p', properties: ['ac'], display: 'AC' }],
        },
        {
          type: 'inline',
          id: 'i',
          properties: [],
          hasRule: true,
          nested: [{ type: 'property', id: 'q', properties: ['hp'], display: 'HP' }],
        },
      ),
      { ac: 12, hp: 9 },
    );

    expect(container.querySelectorAll('.atlas-sb-item > .atlas-sb-rule')).toHaveLength(2);
  });

  it('exposes layout hooks as data attributes rather than Fantasy Statblocks class names', () => {
    const { container } = render(
      <StatblockRenderer
        layout={{
          name: 'Daggerheart Adversary',
          id: 'dh',
          blocks: [
            {
              type: 'group',
              id: 'g',
              properties: [],
              cls: 'daggerheart-adversary-tier',
              nested: [{ type: 'property', id: 'p', properties: ['tier'], display: 'Tier' }],
            },
          ],
        }}
        monster={{ tier: 1 }}
      />,
    );

    const root = container.querySelector('.atlas-statblock');
    expect(root?.getAttribute('data-layout')).toBe('daggerheart-adversary');
    expect(root?.classList.contains('daggerheart-adversary')).toBe(false);

    const group = container.querySelector('[data-cls="daggerheart-adversary-tier"]');
    expect(group?.getAttribute('data-type')).toBe('group');
    expect(container.querySelector('.property-container')).toBeNull();
    expect(container.querySelector('.atlas-sb-property')?.getAttribute('data-prop')).toBe('tier');
  });

  it('pins the token portrait ahead of the layout blocks', () => {
    const layout = layoutOf({ type: 'heading', id: 'h', properties: ['name'] });
    const { container, rerender } = render(
      <StatblockRenderer
        layout={layout}
        monster={{ name: 'Goblin' }}
        portrait={{ src: 'app://token.png', ringColor: '#ff0000' }}
      />,
    );

    const body = container.querySelector('.atlas-statblock-body');
    const portrait = body?.firstElementChild;
    expect(portrait?.matches('.atlas-token-portrait.atlas-sb-portrait')).toBe(true);
    expect(portrait?.querySelector('img')?.getAttribute('src')).toBe('app://token.png');
    expect(
      portrait?.querySelector<HTMLElement>('.atlas-token-ring')?.style.getPropertyValue('--atlas-token-ring-color'),
    ).toBe('#ff0000');

    rerender(<StatblockRenderer layout={layout} monster={{ name: 'Goblin' }} />);
    expect(container.querySelector('.atlas-sb-portrait')).toBeNull();
  });

  it('renders dice notation as clickable spans without touching React-owned nodes', () => {
    const layout = layoutOf({ type: 'property', id: 'p', properties: ['hp'], display: 'HP' });
    const { container, rerender } = renderStatblock(layout, { hp: '2d8+2' });

    expect(container.querySelector('.atlas-dice-link')?.textContent).toBe('2d8+2');

    // Re-rendering used to throw: dice spans were previously grafted in by
    // replacing text nodes React still held references to.
    rerender(<StatblockRenderer layout={layout} monster={{ hp: '3d8+4' }} />);

    expect(container.querySelector('.atlas-dice-link')?.textContent).toBe('3d8+4');
  });
});


describe('DM screen resource footer', () => {
  it('replaces the imported adversary tracks while preserving unrelated JavaScript content', () => {
    const layout = layoutOf({ type: 'javascript', id: 'vitals', code: `
      const el = document.createElement('div');
      el.innerHTML = '<div class="stat-block"><div class="adversary-block"><div class="stat-line"><span class="adversary-name">CREATURE #1</span><input class="stat-value" type="checkbox" /></div></div></div><p>Other layout content</p>';
      return el;
    ` });
    const { container } = render(<StatblockRenderer monster={{ name: 'Creature' }} layout={layout}
      replaceVitals footer={<div>Editable token resources</div>} />);
    expect(container.querySelector('.adversary-name')).toBeNull();
    expect(container.textContent).toContain('Other layout content');
    expect(container.textContent).toContain('Editable token resources');
  });
});

it('preserves custom JavaScript gauges when replacing Daggerheart trackers', () => {
  const layout = layoutOf({ type: 'javascript', id: 'custom', code: `
    const el = document.createElement('div');
    el.className = 'stat-block';
    el.innerHTML = '<progress max="10" value="4"></progress>';
    return el;
  ` });
  const { container } = render(<StatblockRenderer monster={{}} layout={layout} replaceVitals />);
  expect(container.querySelector('progress')?.value).toBe(4);
});

describe('hit points marker', () => {
  it('marks the hit points property and a statline named HP, and nothing else', () => {
    const { container } = render(<StatblockRenderer
      layout={layoutOf(
        { type: 'property', id: 'hp', properties: ['hp'], display: 'Hit Points' },
        { type: 'property', id: 'ac', properties: ['ac'], display: 'Armor Class' },
        { type: 'traits', id: 't', properties: ['statlines'] },
      )}
      monster={{ hp: '7 (2d6)', ac: 15, statlines: [{ name: 'HP', desc: '4d8 (18)' }, { name: 'Attacks', desc: 'Claw (+3, 1d6)' }] }}
    />);

    const marked = [...container.querySelectorAll('[data-hit-points]')].map((el) => el.textContent);
    expect(marked).toEqual([expect.stringContaining('2d6'), expect.stringContaining('4d8')]);
  });
});

describe('a statblock whose values are not what its blocks expect', () => {
  beforeEach(resetCounts);

  /** Every block that reads a value, each reading `value`, under a creature named by `name`. */
  const everyBlock = layoutOf(
    { type: 'heading', id: 'h', properties: ['name'] },
    { type: 'subheading', id: 'sub', properties: ['value', 'name'] },
    { type: 'property', id: 'p', properties: ['value'], display: 'Value' },
    { type: 'text', id: 'text', properties: ['value'], heading: 'value', headingProp: true },
    { type: 'saves', id: 'saves', properties: ['value'] },
    { type: 'table', id: 'table', properties: ['value'], headers: ['A', 'B'], calculate: true },
    { type: 'image', id: 'image', properties: ['value'] },
    { type: 'traits', id: 'traits', properties: ['value'], heading: 'Traits' },
    { type: 'spells', id: 'spells', properties: ['value'] },
    { type: 'collapse', id: 'c', heading: 'More', nested: [{ type: 'property', id: 'cp', properties: ['value'] }] },
  );

  /** What a note can hold where a block expects a text, a list of traits or a list of spells. */
  const MALFORMED: Record<string, () => unknown> = {
    'a word': () => 'leap',
    'a text that is no address': () => '100% wrong %zz',
    'a number': () => 3,
    'a switch': () => true,
    'nothing': () => null,
    'a list of a name and a text': () => ['Bite', 'One target.'],
    'an empty map': () => ({}),
    'a trait of maps': () => ({ name: { first: 'Bite' }, desc: { text: 'One target.' } }),
    'a trait of lists': () => ({ name: ['Bite'], desc: ['One', 'target.'] }),
    'a trait of nothing': () => ({ name: null, desc: null }),
    'a trait of numbers': () => ({ name: 5, desc: 7 }),
    'a map that hides what every object can do': () =>
      JSON.parse('{"name":{"toString":1},"desc":{"toString":2,"valueOf":3},"toString":4,"__proto__":{"x":1}}') as unknown,
    'a very long text': () => ({ name: 'x'.repeat(300_000), desc: 'y'.repeat(300_000) }),
    ...HOSTILE_VALUES,
  };

  it.each(Object.keys(MALFORMED))('draws every block for %s without failing', (shape) => {
    const value = MALFORMED[shape]!;
    // As the value itself, as the creature's name, and as an entry among good ones
    expect(() => renderStatblock(everyBlock, { name: 'Toad', value: value() })).not.toThrow();
    expect(() => renderStatblock(everyBlock, { name: value(), value: 'plain' })).not.toThrow();
    expect(() => renderStatblock(everyBlock, { name: 'Toad', value: [value(), { name: 'Bite', desc: 'One target.' }, value()] })).not.toThrow();
    // Each block reads the statblock's bounded copy; the value itself is read once, for that copy.
    expect(counts.reads).toBeLessThanOrEqual(3 * 2 * STATBLOCK_LIMITS.values);
  });

  it('shows the trait among entries that are none', () => {
    const { container } = renderStatblock(
      layoutOf({ type: 'traits', id: 't', properties: ['actions'], heading: 'Actions' }),
      { name: 'Toad', actions: ['leap', 3, true, null, ['Bite', 'Tuple.'], {}, { name: 5, desc: ['Seven', 'days.'] }, { name: 'Bite', desc: 'One target.' }] },
    );
    const traits = [...container.querySelectorAll('.atlas-sb-trait')].map((trait) => trait.textContent);
    expect(traits).toEqual(['5Seven days.', 'BiteOne target.']);
  });

  it('hands every entry but an empty one to the callback of a traits block', () => {
    const { container } = renderStatblock(
      layoutOf({
        type: 'traits', id: 't', properties: ['languages'],
        callback: 'return typeof property === "string" ? property : Array.isArray(property) ? property.join(": ") : property.desc;',
      }),
      { name: 'Toad', languages: ['Common', null, ['Deep Speech', 'understands'], { name: 'Sign', desc: 'with its tongue' }] },
    );
    const lines = [...container.querySelectorAll('.atlas-sb-trait')].map((line) => line.textContent);
    expect(lines).toEqual(['Common', 'Deep Speech: understands', 'Signwith its tongue']);
  });

  it('names a creature whose name is a list as a property of those parts reads', () => {
    const { container } = renderStatblock(
      layoutOf({ type: 'heading', id: 'h', properties: ['name'] }, { type: 'property', id: 'p', properties: ['name'], display: 'Name' }),
      { name: ['Grik', 'the Bold'] },
    );
    expect(container.querySelector('.atlas-sb-heading')?.textContent).toBe('Grik, the Bold');
    expect(container.querySelector('.atlas-sb-property')?.textContent).toBe('NameGrik, the Bold');
  });

  it('shows no text longer than one text, however many entries it is joined of', () => {
    const saves = Array.from({ length: 150 }, (_, index) => ({ [`save ${index} ${'x'.repeat(150)}`]: 'y'.repeat(150) }));
    const joined = renderStatblock(layoutOf({ type: 'saves', id: 's', properties: ['saves'], display: 'Saves' }), { saves }).container;
    expect(joined.querySelector('.atlas-sb-property')?.textContent).toHaveLength('Saves'.length + STATBLOCK_LIMITS.text);

    const parts = renderStatblock(
      layoutOf({ type: 'subheading', id: 'sub', properties: ['a', 'b', 'c'] }),
      { a: 'a'.repeat(9000), b: 'b'.repeat(9000), c: 'c'.repeat(9000) },
    ).container;
    expect(parts.querySelector('.atlas-sb-subheading')?.textContent).toHaveLength(STATBLOCK_LIMITS.text);
  });

  it('draws no more entries of a list than the limit', () => {
    const many = Array.from({ length: 10_000 }, (_, index) => ({ name: `Trait ${index}`, desc: 'x' }));
    const { container } = renderStatblock(
      layoutOf(
        { type: 'traits', id: 't', properties: ['traits'] },
        { type: 'spells', id: 's', properties: ['spells'] },
        { type: 'table', id: 'tb', properties: ['stats'] },
      ),
      { name: 'Legion', traits: many, spells: many.map((trait) => ({ [trait.name]: 'spell' })), stats: many.map((_, index) => index) },
    );
    expect(container.querySelectorAll('.atlas-sb-trait-name')).toHaveLength(STATBLOCK_LIMITS.entries);
    expect(container.querySelectorAll('.atlas-sb-spells li')).toHaveLength(STATBLOCK_LIMITS.entries);
    expect(container.querySelectorAll('.atlas-sb-table td')).toHaveLength(STATBLOCK_LIMITS.entries);
  });
});
