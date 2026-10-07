import { cleanup, fireEvent, render } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { DiceToast } from '../../src/app/react/components/dice/DiceToast';
import { useDiceAvatar } from '../../src/app/react/components/dice/useDiceAvatar';
import { DiceRollEntry } from '../../src/app/react/components/dice-log/DiceRollEntry';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { migrateMapFile } from '../../src/app/services/MapPersistence';
import { persistableDiceLog, type DiceRollResult } from '../../src/app/tools/diceRolling';
import { shownTag, tagColour, tagName, withCleanTags } from '../../src/app/tools/diceTags';
import { createInMemoryApp } from '../mocks/inMemoryVault';

afterEach(() => cleanup());

const plain: DiceRollResult = {
  id: 'r1', timestamp: 1, formula: '2d6+1d8', modifiers: 0, total: 13,
  rolls: [{ die: 'd6', value: 6, max: 6 }, { die: 'd6', value: 1, max: 6 }, { die: 'd8', value: 6, max: 8 }],
};

/** A tagged roll: `color` and `colorName` on each die. */
const tagged: DiceRollResult = {
  ...plain, id: 'r2',
  rolls: [
    { die: 'd6', value: 6, max: 6, color: '#dd3333', colorName: 'Fire' },
    { die: 'd8', value: 6, max: 8 },
    { die: 'd6', value: 1, max: 6, color: '#dd3333', colorName: 'Fire' },
    { die: 'd6', value: 2, max: 6, color: '#3366ff' },
  ],
};

function inAtlas(element: React.ReactElement): HTMLElement {
  const { app } = createInMemoryApp();
  return render(<AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>{element}</AtlasUIContext.Provider>).container;
}

/** The details a log entry or a toast lists once opened. */
function details(container: HTMLElement, toggle: string, list: string): HTMLElement {
  fireEvent.click(container.querySelector(toggle)!);
  return container.querySelector(list)!;
}

describe("a die's tag", () => {
  it('keeps a #rrggbb colour and a plain name of at most 32 characters, trimmed', () => {
    expect(tagColour('#D33a00')).toBe('#D33a00');
    for (const bad of ['#d33', 'red', '#dd3333 ', 'url(https://x)', 'var(--x)', 3, null]) expect(tagColour(bad)).toBeUndefined();
    expect(tagName('  Fire dragon ')).toBe('Fire dragon');
    // Names a colour set can use: plain words, any script and emoji, and the colour code when a colour has none.
    for (const name of ['Light Green', 'Sky Blue', '#FF0000', 'Glühwürmchen #2', 'Огонь', 'Fire 🔥', 'Dragon’s “breath” — red', '*bold*']) expect(tagName(name)).toBe(name);
    expect(tagName('x'.repeat(32))).toBe('x'.repeat(32));
    expect(tagName('🔥'.repeat(32))).toBe('🔥'.repeat(32));
    for (const bad of ['x'.repeat(33), '', '   ', '<b>Fire</b>', '[[Note]]', '[x](https://y)', '`code`', 'a\u0000b', 'Fire\nIce', 'Fire‮', 'a​b', 4]) {
      expect(tagName(bad)).toBeUndefined();
    }
  });

  it('drops a bad tag, never the roll, and keeps a roll with good tags as the same object', () => {
    expect(withCleanTags(tagged)).toBe(tagged);
    expect(withCleanTags(plain)).toBe(plain);
    const messy = { ...plain, rolls: [{ die: 'd6', value: 6, max: 6, color: 'red', colorName: ' Ice ' }, { die: 'd6', value: 1, max: 6, color: '#112233', colorName: '<i>x</i>' }] };
    expect(withCleanTags(messy).rolls).toEqual([{ die: 'd6', value: 6, max: 6, colorName: 'Ice' }, { die: 'd6', value: 1, max: 6, color: '#112233' }]);
    expect(shownTag({ color: '#112233' })).toEqual({ key: '#112233|', color: '#112233', label: '#112233' });
    expect(shownTag({ colorName: 'Ice' })).toEqual({ key: '|Ice', color: null, label: 'Ice' });
    expect(shownTag({})).toBeNull();
  });

  it('is saved with the dice log and read back unchanged; an old log reads as before', () => {
    const file = JSON.parse(JSON.stringify({ schema: 'atlas-vtt', version: 4, state: { mapPath: 'm.atlasmap', diceLog: persistableDiceLog([tagged, plain]) } })) as unknown;
    const read = migrateMapFile(file) as unknown as { state?: { diceLog?: unknown }; diceLog?: unknown };
    const log = read.state?.diceLog ?? read.diceLog;
    expect(log).toEqual([tagged, plain]);
  });
});

describe('tagged dice in the dice log and the toasts', () => {
  it('lists a roll without tags exactly as before', () => {
    const list = details(inAtlas(<DiceRollEntry result={plain} onRepeat={() => {}} />), '.dice-log-entry', '.dice-log-entry__details');
    expect(list.innerHTML).toBe(
      '<span class="dice-log-entry__badge dice-log-entry__badge--max">d6: 6</span>'
      + '<span class="dice-log-entry__badge dice-log-entry__badge--min">d6: 1</span>'
      + '<span class="dice-log-entry__badge">d8: 6</span>',
    );
    const toast = details(inAtlas(<DiceToast result={plain} phase="visible" onDismiss={() => {}} useAvatar={useDiceAvatar} />), '.atlas-dice-toast__details-toggle', '.atlas-dice-toast__details');
    expect(toast.innerHTML).toBe(
      '<span class="atlas-dice-toast__die-badge atlas-dice-toast__die-badge--max">d6: 6</span>'
      + '<span class="atlas-dice-toast__die-badge atlas-dice-toast__die-badge--min">d6: 1</span>'
      + '<span class="atlas-dice-toast__die-badge">d8: 6</span>',
    );
  });

  it.each([
    ['the log', <DiceRollEntry key="log" result={tagged} onRepeat={() => {}} />, '.dice-log-entry', '.dice-log-entry__details', 'dice-log-entry'],
    ['a toast', <DiceToast key="toast" result={tagged} phase="visible" onDismiss={() => {}} useAvatar={useDiceAvatar} />, '.atlas-dice-toast__details-toggle', '.atlas-dice-toast__details', 'atlas-dice-toast'],
  ])('groups tagged dice under their tag in %s: a colour dot and the name in text', (_place, element, toggle, list, block) => {
    const shown = details(inAtlas(element), toggle, list);
    const groups = [...shown.querySelectorAll(`.${block}__tag-group`)];
    expect(groups.map((group) => group.textContent)).toEqual(['Fired6: 6d6: 1', 'd8: 6', '#3366ffd6: 2']);
    const dots = [...shown.querySelectorAll<HTMLElement>(`.${block}__tag-dot`)];
    expect(dots.map((dot) => dot.style.getPropertyValue('--atlas-die-tag-colour'))).toEqual(['#dd3333', '#3366ff']);
    // The dot is decoration; the name (or the colour's code) is the text a screen reader reads.
    expect(dots.every((dot) => dot.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(shown.querySelector('[title]')).toBeNull();
  });

  it('shows no tag a hand-edited map file broke, and never sets a colour that is not #rrggbb', () => {
    const edited = { ...plain, rolls: [{ die: 'd6', value: 6, max: 6, color: 'red;background:url(https://x)', colorName: '<img src=x>' }] } as DiceRollResult;
    const shown = details(inAtlas(<DiceRollEntry result={edited} onRepeat={() => {}} />), '.dice-log-entry', '.dice-log-entry__details');
    expect(shown.innerHTML).toBe('<span class="dice-log-entry__badge dice-log-entry__badge--max">d6: 6</span>');
  });
});
