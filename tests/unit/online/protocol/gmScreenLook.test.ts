import { describe, expect, it } from 'vitest';
import {
  isRecord, LOOK_COLOURS, parseGmScreenMessage, parseKeysMessage, parseLayoutMessage, parseLookMessage, parseStatblockRollAnswer, parseStatblocksMessage, parseYourCode, type LookMessage,
} from '../../../../src/app/online/protocol/index.ts';

const look: LookMessage = { t: 'look', dark: false, colours: { '--background-primary': '#f5eddc', '--text-normal': '#3a2c1a', '--interactive-accent': '#3fa34d', '--background-modifier-hover': '#2a1e0e14' } };
const sent = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

/** How a device's page read Atlas's messages before the look was one of them: the parser of that release, whole. */
function parseBeforeLook(value: unknown): unknown {
  if (!isRecord(value)) return null;
  if (value.t === 'your-code') return parseYourCode(value);
  return parseKeysMessage(value) ?? parseLayoutMessage(value) ?? parseStatblocksMessage(value) ?? parseStatblockRollAnswer(value);
}

describe('the look Atlas sends a device', () => {
  it('reads as it was sent, through the channel\'s parser', () => {
    expect(parseGmScreenMessage(sent(look))).toEqual(look);
    expect(parseGmScreenMessage(sent({ ...look, dark: true }))).toEqual({ ...look, dark: true });
  });

  it('reads as nothing on a device from before it, which drops a message it does not know', () => {
    expect(parseBeforeLook(sent(look))).toBeNull();
  });

  it('keeps only the colours of its list, each one plain colour in its one written form', () => {
    const colours = {
      '--background-primary': '#f5eddc',
      '--text-normal': 'red; background:url(https://x.example/a.png)',
      '--text-muted': 'var(--x)',
      '--text-faint': '#F5EDDC',
      '--text-accent': `#${'a'.repeat(4000)}`,
      '--text-error': '#abc',
      '--text-warning': 'rgb(1, 2, 3)',
      '--interactive-accent': '#3fa34d80',
      '--interactive-hover': 7,
      '--font-interface': '#ffffff',
      'background': '#ffffff',
      '--background-primary-alt': '#ffffff\n',
    };
    expect(parseLookMessage({ t: 'look', dark: true, colours })).toEqual({ t: 'look', dark: true, colours: { '--background-primary': '#f5eddc', '--interactive-accent': '#3fa34d80' } });
  });

  it('is nothing where no colour of it holds, or its shape is wrong', () => {
    expect(parseLookMessage({ t: 'look', dark: true, colours: { '--text-normal': 'red' } })).toBeNull();
    expect(parseLookMessage({ t: 'look', dark: true, colours: {} })).toBeNull();
    expect(parseLookMessage({ t: 'look', dark: 'yes', colours: look.colours })).toBeNull();
    expect(parseLookMessage({ t: 'look', colours: look.colours })).toBeNull();
    expect(parseLookMessage({ t: 'look', dark: false, colours: [look.colours] })).toBeNull();
    expect(parseLookMessage({ t: 'look', dark: false, colours: 'body{}' })).toBeNull();
  });

  it('takes no colour from the prototype of what it reads', () => {
    const colours = Object.create({ '--text-normal': '#000000' }) as Record<string, unknown>;
    colours['--background-primary'] = '#ffffff';
    expect(parseLookMessage({ t: 'look', dark: false, colours })?.colours).toEqual({ '--background-primary': '#ffffff' });
  });

  it('names each colour once, all of them colour variables of Obsidian or of Atlas', () => {
    expect(new Set(LOOK_COLOURS).size).toBe(LOOK_COLOURS.length);
    for (const name of LOOK_COLOURS) expect(name).toMatch(/^--[a-z0-9-]+$/);
  });

  it('fits a frame many times over, with every colour of its list at its longest', () => {
    const full = { t: 'look', dark: true, colours: Object.fromEntries(LOOK_COLOURS.map((name) => [name, '#ffffffff'])) };
    expect(parseLookMessage(sent(full) as Record<string, unknown>)?.colours).toEqual(full.colours);
    expect(new TextEncoder().encode(JSON.stringify(full)).length).toBeLessThan(4096);
  });
});
