import { describe, expect, it } from 'vitest';
import type { TablePerson } from '../../../../src/app/online/protocol/index.ts';
import { chosenSpeaker, parseComposerInput, type CommandContext } from '../../../../src/app/online/tableLog/chatCommands.ts';
import { suggestionsFor } from '../../../../src/app/online/tableLog/commandSuggestions.ts';
import type { SpeakerOption } from '../../../../src/app/online/tableLog/panelTypes.ts';

const ME = 'abcdefghijklmnopqrst';
const KARA = 'kkkkkkkkkkkkkkkkkkkk';
const MIRA = 'mmmmmmmmmmmmmmmmmmmm';
const THORN = 'tttttttttttttttttttt';
const PEOPLE: readonly TablePerson[] = [{ id: ME, name: 'Ash' }, { id: KARA, name: 'Kara' }, { id: MIRA, name: 'Mira' }, { id: THORN, name: 'Kara Thorn' }];
const SELF: SpeakerOption = { key: 'self', name: 'Ash', kind: 'self', portrait: null };
const BRAKKA: SpeakerOption = { key: 'tok-1', name: 'Brakka', kind: 'token', portrait: null };

const context = (change: Partial<CommandContext> = {}): CommandContext => ({
  self: ME, people: PEOPLE, rollMode: 'public', speaker: SELF, lastWhisper: null, whisperTo: null, ...change,
});
const parse = (text: string, change?: Partial<CommandContext>): ReturnType<typeof parseComposerInput> => parseComposerInput(text, context(change));

describe('plain text', () => {
  it('is said as oneself, or in character where a token speaks', () => {
    expect(parse('  Hello there ')).toEqual({ kind: 'say', draft: { text: 'Hello there' } });
    expect(parse('Hello', { speaker: BRAKKA })).toEqual({ kind: 'say', draft: { text: 'Hello', style: 'ic', speaker: 'tok-1' } });
  });

  it('goes to the audience kept, and is nothing where only space was typed', () => {
    expect(parse('psst', { whisperTo: [KARA] })).toEqual({ kind: 'say', draft: { text: 'psst', to: [KARA] } });
    expect(parse('   \n ')).toEqual({ kind: 'nothing' });
  });

  it('is text where a slash starts no word', () => {
    expect(parse('/ shrug')).toEqual({ kind: 'say', draft: { text: '/ shrug' } });
    expect(parse('// note')).toEqual({ kind: 'say', draft: { text: '// note' } });
  });

  it('may not hold more rolls than a message carries, nor a button of another command', () => {
    expect(parse('[[1d4]] [[1d4]] [[1d4]] [[1d4]] [[1d4]] [[1d4]]').kind).toBe('error');
    expect(parse('[[/w 1d20]]').kind).toBe('error');
    expect(parse('Hit for [[2d6+3]], then [[/r 1d20]]{Save}').kind).toBe('say');
  });
});

describe('roll commands', () => {
  it('roll in their mode, `/r` in the mode chosen', () => {
    expect(parse('/r 1d20+5')).toEqual({ kind: 'roll', draft: { formula: '1d20+5', mode: 'public' } });
    expect(parse('/roll 1d20', { rollMode: 'blind' })).toEqual({ kind: 'roll', draft: { formula: '1d20', mode: 'blind' } });
    expect(parse('/pr 1d20', { rollMode: 'self' })).toEqual({ kind: 'roll', draft: { formula: '1d20', mode: 'public' } });
    for (const [command, mode] of [['gmr', 'gm'], ['gmroll', 'gm'], ['br', 'blind'], ['broll', 'blind'], ['blindr', 'blind'], ['blindroll', 'blind'], ['sr', 'self'], ['selfroll', 'self'], ['publicroll', 'public']] as const) {
      expect(parse(`/${command} 2d6`)).toEqual({ kind: 'roll', draft: { formula: '2d6', mode } });
    }
  });

  it('read a flavor after #, and roll as the token chosen', () => {
    expect(parse('/r 1d20 + 5   # Attack on the ogre ', { speaker: BRAKKA })).toEqual({ kind: 'roll', draft: { formula: '1d20 + 5', mode: 'public', flavor: 'Attack on the ogre', speaker: 'tok-1' } });
    expect(parse('/r 1d20 #')).toEqual({ kind: 'roll', draft: { formula: '1d20', mode: 'public' } });
  });

  it('refuse to roll nothing, too long a formula or too long a flavor', () => {
    expect(parse('/r')).toEqual({ kind: 'error', message: 'Write the dice after /r, like /r 1d20+5.' });
    expect(parse('/gmr # just flavor').kind).toBe('error');
    expect(parse(`/r ${'1d4+'.repeat(30)}1`).kind).toBe('error');
    expect(parse(`/r 1d20 # ${'x'.repeat(130)}`).kind).toBe('error');
  });

  it('take any case, and need a space after them', () => {
    expect(parse('/R 1d6')).toMatchObject({ kind: 'roll', draft: { formula: '1d6' } });
    expect(parse('/GMR 1d6')).toMatchObject({ kind: 'roll', draft: { mode: 'gm' } });
    expect(parse('/r1d20')).toEqual({ kind: 'error', message: 'There is no command /r1d20. Type /help to see them all.' });
  });
});

describe('whispers', () => {
  it('go to one name word, any case, and never to the viewer', () => {
    expect(parse('/w kara meet me outside')).toEqual({ kind: 'say', draft: { text: 'meet me outside', to: [KARA] } });
    expect(parse('/whisper Mira hi', { speaker: BRAKKA })).toEqual({ kind: 'say', draft: { text: 'hi', style: 'ic', speaker: 'tok-1', to: [MIRA] } });
    expect(parse('/w Ash hello')).toEqual({ kind: 'error', message: 'You cannot whisper to yourself.' });
  });

  it('go to a bracketed list of names, the GM by gm or dm', () => {
    expect(parse('/w [Kara Thorn, GM] watch out')).toEqual({ kind: 'say', draft: { text: 'watch out', to: [THORN, 'gm'] } });
    expect(parse('/w [kara, dm, Kara] hi')).toEqual({ kind: 'say', draft: { text: 'hi', to: [KARA, 'gm'] } });
    expect(parse('/w [Kara, GM hi').kind).toBe('error');
  });

  it('name an unknown name, and where it was not bracketed say how names with spaces are written', () => {
    expect(parse('/w Bob hi')).toEqual({ kind: 'error', message: 'Nobody at the table is called Bob. Names with spaces go in brackets: /w [Kara Thorn] Hello.' });
    expect(parse('/w [Bob] hi')).toEqual({ kind: 'error', message: 'Nobody at the table is called Bob.' });
    expect(parse('/w').kind).toBe('error');
  });

  it('without a message keep their audience for what follows', () => {
    expect(parse('/w Kara')).toEqual({ kind: 'audience', to: [KARA] });
    expect(parse('/gm')).toEqual({ kind: 'audience', to: ['gm'] });
    expect(parse('/players')).toEqual({ kind: 'audience', to: [KARA, MIRA, THORN] });
  });

  it('go to the GM, or every player but the viewer', () => {
    expect(parse('/gm is this a trap?')).toEqual({ kind: 'say', draft: { text: 'is this a trap?', to: ['gm'] } });
    expect(parse('/gm hi', { self: 'gm' })).toEqual({ kind: 'error', message: 'You are the GM.' });
    expect(parse('/players ready?', { self: 'gm' })).toEqual({ kind: 'say', draft: { text: 'ready?', to: [ME, KARA, MIRA, THORN] } });
    expect(parse('/players hi', { people: [{ id: ME, name: 'Ash' }] })).toEqual({ kind: 'error', message: 'No players are at the table.' });
    expect(parse('/players hi', { people: [{ id: KARA, name: 'Kara', away: true }, { id: MIRA, name: 'Mira' }] })).toEqual({ kind: 'say', draft: { text: 'hi', to: [MIRA] } });
    expect(parse('/reply hi', { people: [{ id: KARA, name: 'Kara', away: true }], lastWhisper: [KARA] })).toEqual({ kind: 'error', message: 'Everyone in that whisper has left the table.' });
  });

  it('answer the last whisper the viewer was sent with /reply', () => {
    expect(parse('/reply on my way', { lastWhisper: [KARA, 'gm'] })).toEqual({ kind: 'say', draft: { text: 'on my way', to: [KARA, 'gm'] } });
    expect(parse('/reply hi')).toEqual({ kind: 'error', message: 'Nobody has whispered to you yet.' });
  });
});

describe('ways of saying', () => {
  it('/ic needs a token chosen and something to say', () => {
    expect(parse('/ic Well met')).toEqual({ kind: 'error', message: 'Choose a token to speak as first.' });
    expect(parse('/ic Well met', { speaker: BRAKKA })).toEqual({ kind: 'say', draft: { text: 'Well met', style: 'ic', speaker: 'tok-1' } });
    expect(parse('/IC', { speaker: BRAKKA }).kind).toBe('error');
  });

  it('/ooc says it as oneself whoever speaks, to the audience kept', () => {
    expect(parse('/ooc brb', { speaker: BRAKKA, whisperTo: ['gm'] })).toEqual({ kind: 'say', draft: { text: 'brb', to: ['gm'] } });
  });

  it('/em, /emote and /me describe what the speaker does', () => {
    expect(parse('/em draws her sword')).toEqual({ kind: 'say', draft: { text: 'draws her sword', style: 'emote' } });
    expect(parse('/me grins', { speaker: BRAKKA })).toEqual({ kind: 'say', draft: { text: 'grins', style: 'emote', speaker: 'tok-1' } });
    expect(parse('/emote')).toEqual({ kind: 'error', message: 'Write what you do after /emote.' });
  });

  it('/help asks for the help, and an unknown command is an error', () => {
    expect(parse('/help')).toEqual({ kind: 'help' });
    expect(parse('/HELP me')).toEqual({ kind: 'help' });
    expect(parse('/shrug')).toEqual({ kind: 'error', message: 'There is no command /shrug. Type /help to see them all.' });
  });
});

describe('the speaker chosen', () => {
  it('is the option of the key kept, else the first', () => {
    expect(chosenSpeaker([SELF, BRAKKA], 'tok-1')).toBe(BRAKKA);
    expect(chosenSpeaker([SELF, BRAKKA], 'gone')).toBe(SELF);
    expect(chosenSpeaker([SELF], null)).toBe(SELF);
    expect(chosenSpeaker([], null)).toBeNull();
  });
});

describe('suggestions', () => {
  it('offer every command for a slash, and those a typed start fits', () => {
    expect(suggestionsFor('/', PEOPLE, ME).map((item) => item.label)).toEqual(['/r', '/pr', '/gmr', '/br', '/sr', '/w', '/gm', '/players', '/reply', '/ic', '/ooc', '/em', '/help']);
    expect(suggestionsFor('/G', PEOPLE, ME).map((item) => item.label)).toEqual(['/gmr', '/gm']);
    expect(suggestionsFor('/bli', PEOPLE, ME).map((item) => item.label)).toEqual(['/blindr']);
    expect(suggestionsFor('/x', PEOPLE, ME)).toEqual([]);
  });

  it('leave /gm out for the GM, and complete with a space', () => {
    expect(suggestionsFor('/g', PEOPLE, 'gm').map((item) => item.label)).toEqual(['/gmr']);
    expect(suggestionsFor('/w', PEOPLE, ME)[0]).toMatchObject({ kind: 'command', insert: '/w ', sendsAsTyped: false });
  });

  it('send a command that stands alone as typed', () => {
    expect(suggestionsFor('/help', PEOPLE, ME)).toEqual([expect.objectContaining({ label: '/help', sendsAsTyped: true })]);
    expect(suggestionsFor('/he', PEOPLE, ME)).toEqual([expect.objectContaining({ label: '/help', sendsAsTyped: false })]);
  });

  it('offer the people (the GM first, never the viewer) while a name is typed after /w', () => {
    expect(suggestionsFor('/w ', PEOPLE, ME).map((item) => item.label)).toEqual(['GM', 'Kara', 'Mira', 'Kara Thorn']);
    expect(suggestionsFor('/whisper ka', PEOPLE, ME).map((item) => item.label)).toEqual(['Kara', 'Kara Thorn']);
    expect(suggestionsFor('/w ', PEOPLE, 'gm').map((item) => item.label)).toEqual(['Ash', 'Kara', 'Mira', 'Kara Thorn']);
    expect(suggestionsFor('/w Kara ', PEOPLE, ME)).toEqual([]);
    expect(suggestionsFor('/w [Ka', PEOPLE, ME)).toEqual([]);
    expect(suggestionsFor('hello', PEOPLE, ME)).toEqual([]);
  });
});
