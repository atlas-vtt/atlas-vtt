import { describe, expect, it } from 'vitest';
import type { ChatEntry, LogEntry, RollEntry, SecretEntry, SharedRoll } from '../../../../src/app/online/protocol/index.ts';
import { audienceNames, audienceOf, lastWhisperAudience, nameList, personName } from '../../../../src/app/online/tableLog/audience.ts';
import { textSegments } from '../../../../src/app/online/tableLog/inlineSegments.ts';
import { continuesPrevious } from '../../../../src/app/online/tableLog/index.ts';
import { dieView } from '../../../../src/app/online/tableLog/rollDice.tsx';
import { secretText } from '../../../../src/app/online/tableLog/SecretRow.tsx';

const ME = 'abcdefghijklmnopqrst';
const KARA = 'kkkkkkkkkkkkkkkkkkkk';
const MIRA = 'mmmmmmmmmmmmmmmmmmmm';
const PEOPLE = [{ id: KARA, name: 'Kara' }, { id: MIRA, name: 'Mira' }];
const id = (n: number): string => n.toString(16).padStart(24, '0');

const shared = (total: number): SharedRoll => ({ id: `r${total}`, timestamp: 0, formula: '1d20', rolls: [{ die: 'd20', value: total, max: 20 }], modifiers: 0, total });
const chat = (n: number, who: string, extra: Partial<ChatEntry> = {}): ChatEntry => ({ id: id(n), at: n * 1000, who, name: 'Mira', kind: 'chat', text: 'hi', ...extra });
const BRAKKA = { name: 'Brakka', token: 'tok-1', art: null, ring: null };

describe('the pieces of a text', () => {
  it('are the text alone where it holds no rolls', () => {
    expect(textSegments('Hello', undefined)).toEqual([{ kind: 'text', text: 'Hello' }]);
  });

  it('give each rolled mark the next roll and each button its index among all marks', () => {
    const text = 'Hit [[1d20+5]] then [[/br 1d20]]{Spot} and [[2d6]]';
    const [first, second] = [shared(17), shared(9)];
    const segments = textSegments(text, [first, second]);
    expect(segments.map((segment) => segment.kind)).toEqual(['text', 'rolled', 'text', 'button', 'text', 'rolled']);
    expect(segments[1]).toMatchObject({ roll: first, mark: { formula: '1d20+5' } });
    expect(segments[3]).toMatchObject({ index: 1, mark: { formula: '1d20', mode: 'blind', label: 'Spot' } });
    expect(segments[5]).toMatchObject({ roll: second });
    expect(segments.filter((segment) => segment.kind === 'text').map((segment) => segment.kind === 'text' && segment.text)).toEqual(['Hit ', ' then ', ' and ']);
  });

  it('leave a mark without its roll as it was written, and a text with marks it cannot read whole', () => {
    expect(textSegments('[[1d6]] and [[1d8]]', [shared(3)])).toMatchObject([
      { kind: 'rolled', mark: { formula: '1d6' }, roll: shared(3) },
      { kind: 'text', text: ' and ' },
      { kind: 'text', text: '[[1d8]]' },
    ]);
    expect(textSegments('[[/x 1d6]]', undefined)).toEqual([{ kind: 'text', text: '[[/x 1d6]]' }]);
  });
});

describe('audiences', () => {
  it('name people as the viewer reads them', () => {
    expect(personName(ME, PEOPLE, ME)).toBe('you');
    expect(personName('gm', PEOPLE, ME)).toBe('GM');
    expect(personName(KARA, PEOPLE, ME)).toBe('Kara');
    expect(personName('zzzzzzzzzzzzzzzzzzzz', PEOPLE, ME)).toBe('someone');
    expect(nameList(['Kara'])).toBe('Kara');
    expect(nameList(['Kara', 'GM'])).toBe('Kara and GM');
    expect(nameList(['Kara', 'Mira', 'GM'])).toBe('Kara, Mira and GM');
  });

  it('put the viewer first', () => {
    expect(audienceNames([KARA, 'gm'], PEOPLE, ME)).toBe('Kara and GM');
    expect(audienceNames([KARA, ME], PEOPLE, ME)).toBe('you and Kara');
  });

  it('of an entry are its author and its people besides the viewer', () => {
    expect(audienceOf(chat(1, KARA, { to: [ME, 'gm'] }), ME)).toEqual([KARA, 'gm']);
    expect(audienceOf(chat(1, KARA), ME)).toBeNull();
  });

  it('of /reply are those of the newest whisper the viewer was sent', () => {
    const entries: LogEntry[] = [chat(1, KARA, { to: [ME, 'gm'] }), chat(2, MIRA, { to: ['gm'] }), chat(3, ME, { to: [MIRA] }), chat(4, MIRA)];
    expect(lastWhisperAudience(entries, ME)).toEqual([KARA, 'gm']);
    expect(lastWhisperAudience(entries, 'gm')).toEqual([MIRA]);
    expect(lastWhisperAudience(entries, null)).toBeNull();
    expect(lastWhisperAudience([chat(1, KARA)], ME)).toBeNull();
  });
});

describe('rows that continue the one above', () => {
  it('are said the same way, by the same speaker, to the same people', () => {
    expect(continuesPrevious(chat(1, MIRA, { to: [KARA, 'gm'] }), chat(2, MIRA, { to: ['gm', KARA] }))).toBe(true);
    expect(continuesPrevious(chat(1, MIRA, { to: [KARA] }), chat(2, MIRA))).toBe(false);
    expect(continuesPrevious(chat(1, MIRA, { to: [KARA] }), chat(2, MIRA, { to: [KARA, 'gm'] }))).toBe(false);
    expect(continuesPrevious(chat(1, MIRA, { style: 'ic', speaker: BRAKKA }), chat(2, MIRA, { style: 'ic', speaker: BRAKKA }))).toBe(true);
    expect(continuesPrevious(chat(1, MIRA, { style: 'ic', speaker: BRAKKA }), chat(2, MIRA))).toBe(false);
    expect(continuesPrevious(chat(1, MIRA, { style: 'ic', speaker: BRAKKA }), chat(2, MIRA, { style: 'ic', speaker: { ...BRAKKA, name: 'Olm' } }))).toBe(false);
    expect(continuesPrevious(chat(1, MIRA), chat(2, MIRA, { style: 'emote' }))).toBe(false);
  });
});

describe('private rolls the viewer is not shown', () => {
  const secret = (who: string, mode: SecretEntry['mode'], extra: Partial<SecretEntry> = {}): SecretEntry => ({ id: id(1), at: 0, who, name: 'Kara', kind: 'secret', mode, ...extra });

  it('say who rolled, by token where one rolled', () => {
    expect(secretText(secret(KARA, 'gm'), ME)).toBe('Kara rolled privately');
    expect(secretText(secret(KARA, 'self', { speaker: BRAKKA }), ME)).toBe('Brakka (Kara) rolled privately');
    expect(secretText(secret('gm', 'blind'), ME)).toBe('GM rolled privately');
  });

  it('tell the roller of a blind roll who sees it', () => {
    expect(secretText(secret(ME, 'blind'), ME)).toBe('You rolled blind. Only the GM sees the result.');
  });
});

describe('dice', () => {
  it('mark the highest and lowest faces', () => {
    const roll: RollEntry['roll'] = { ...shared(20), rolls: [{ die: 'd20', value: 20, max: 20 }, { die: 'd6', value: 1, max: 6 }, { die: 'd6', value: 4, max: 6 }] };
    expect(roll.rolls.map((_, index) => dieView(roll.rolls, index))).toEqual([
      { text: 'd20: 20', modifiers: ['max'] },
      { text: 'd6: 1', modifiers: ['min'] },
      { text: 'd6: 4', modifiers: [] },
    ]);
  });
});
