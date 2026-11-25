import { describe, expect, it } from 'vitest';
import { defaultTrackTitles, libraryTrackTitles } from '../../../src/app/armarium/upload/trackTitles';

describe('default track titles of an album', () => {
  it.each([
    ['Bandcamp names', ['Vindsvept - Night of the Wilds - 01 Dancing with the Wisps', 'Vindsvept - Night of the Wilds - 02 Tales of the Moonfolk'], ['Dancing with the Wisps', 'Tales of the Moonfolk'], 'Vindsvept'],
    ['numbers with a space', ['01 Dawn', '02 Dusk'], ['Dawn', 'Dusk'], null],
    ['numbers with a dot', ['1. Dawn', '2. Dusk'], ['Dawn', 'Dusk'], null],
    ['numbers with a dash', ['01 - Dawn', '02 - Dusk', '10 - Rain'], ['Dawn', 'Dusk', 'Rain'], null],
    ['numbers with an underscore or a bracket', ['07_Gate', '08) Wall'], ['Gate', 'Wall'], null],
    ['plain titles', ['Dawn', 'Dusk'], ['Dawn', 'Dusk'], null],
    ['titles that are numbers', ['1999', '2001'], ['1999', '2001'], null],
    ['a number and a title that is a number', ['01 1999', '02 2001'], ['1999', '2001'], null],
    ['a decimal is no track number', ['3.5 Hours', '4.5 Hours'], ['3.5 Hours', '4.5 Hours'], null],
    ['side and track like A1 are no number', ['A1 Dawn', 'A2 Dusk'], ['A1 Dawn', 'A2 Dusk'], null],
    ['a shared start without a separator stays', ['The Road North', 'The Road South'], ['The Road North', 'The Road South'], null],
    ['a shared start ends at its last separator', ['Old Roads - Dawn', 'Old Roads - Dusk'], ['Dawn', 'Dusk'], 'Old Roads'],
    ['en and em dashes separate', ['Mara – Lanterns — 1 Dawn', 'Mara – Lanterns — 2 Dusk'], ['Dawn', 'Dusk'], 'Mara'],
    ['underscores separate', ['Mara_Lanterns_01_Dawn', 'Mara_Lanterns_02_Dusk'], ['Dawn', 'Dusk'], 'Mara'],
    ['a hyphen inside a word does not', ['Half-Light', 'Half-Moon'], ['Half-Light', 'Half-Moon'], null],
    ['nothing shared where one name differs', ['Mara - Dawn', 'Mara - Dusk', 'Rain'], ['Mara - Dawn', 'Mara - Dusk', 'Rain'], null],
    ['a title left empty is its stem', ['Lanterns_', 'Lanterns_Dusk'], ['Lanterns_', 'Dusk'], 'Lanterns'],
    ['a dash at the end is no separator', ['Lanterns - ', 'Lanterns - Dusk'], ['Lanterns -', 'Lanterns - Dusk'], null],
    ['only a number left stays a number', ['Lanterns - 01', 'Lanterns - 02'], ['01', '02'], 'Lanterns'],
    ['a shared number is not offered as the artist', ['1 - Dawn', '1 - Dusk'], ['Dawn', 'Dusk'], null],
    ['Cyrillic', ['Квилл - Фонари - 01 Рассвет', 'Квилл - Фонари - 02 Закат'], ['Рассвет', 'Закат'], 'Квилл'],
    ['CJK and emoji', ['夜の森 - 01 月🌙', '夜の森 - 02 星'], ['月🌙', '星'], '夜の森'],
    ['composed and decomposed accents are one start', ['Café - 01 Aube', 'Café - 02 Soir'], ['Aube', 'Soir'], 'Café'],
  ] as const)('%s', (_, stems, titles, artist) => {
    expect(defaultTrackTitles(stems, '')).toEqual({ titles, artist });
  });

  it('offers no artist where one is typed, or where the shared part is the album\'s name', () => {
    const stems = ['Night of the Wilds - 01 Dawn', 'Night of the Wilds - 02 Dusk'];
    expect(defaultTrackTitles(stems, 'Vindsvept')).toEqual({ titles: ['Dawn', 'Dusk'], artist: null });
    expect(defaultTrackTitles(stems, '', 'night of the wilds')).toEqual({ titles: ['Dawn', 'Dusk'], artist: null });
    expect(defaultTrackTitles(stems, '', 'Lanterns').artist).toBe('Night of the Wilds');
  });
});

describe('the default title of a single track', () => {
  it.each([
    ['a number goes', '04 Tricksy Sprites', '', 'Tricksy Sprites'],
    ['an artist prefix equal to the typed artist goes, without case', 'Vindsvept - 04 Tricksy Sprites', 'vindsvept', 'Tricksy Sprites'],
    ['another artist stays', 'Vindsvept - Tricksy Sprites', 'Mara', 'Vindsvept - Tricksy Sprites'],
    ['no artist typed keeps the prefix', 'Vindsvept - Tricksy Sprites', '', 'Vindsvept - Tricksy Sprites'],
    ['the artist alone with no separator stays', 'Vindsvept Sprites', 'Vindsvept', 'Vindsvept Sprites'],
    ['a title that is a number stays', '1999', '', '1999'],
    ['never empty', 'Vindsvept_', 'Vindsvept', 'Vindsvept_'],
  ] as const)('%s', (_, stem, artist, title) => {
    expect(defaultTrackTitles([stem], artist)).toEqual({ titles: [title], artist: null });
  });

  it('has no titles for no stems', () => {
    expect(defaultTrackTitles([], '')).toEqual({ titles: [], artist: null });
  });
});

describe('in Atlas, a file\'s folder tags', () => {
  const wilds = ['Vindsvept', 'Night of the Wilds'];
  it.each([
    ['a single loses the folders it lies in, and its first is offered as the artist', ['Vindsvept - Night of the Wilds - 05 Tending the Flames'], [wilds], '', '', ['Tending the Flames'], 'Vindsvept'],
    ['compared without case and composed alike', ['vindsvept_NIGHT OF THE WILDS_05 Tending the Flames'], [['Vindsvept', 'Night of the Wilds']], '', '', ['Tending the Flames'], 'vindsvept'],
    ['only leading parts go, each where something is left', ['Night of the Wilds - Vindsvept'], [wilds], '', '', ['Vindsvept'], 'Night of the Wilds'],
    ['a part that is no folder tag stops it', ['Mara - Vindsvept - Dawn'], [wilds], '', '', ['Mara - Vindsvept - Dawn'], null],
    ['a stem that is only its folder\'s name stays', ['Night of the Wilds'], [wilds], '', '', ['Night of the Wilds'], null],
    ['no artist is offered where one is typed', ['Vindsvept - 05 Tending the Flames'], [wilds], 'Mara', '', ['Tending the Flames'], null],
    ['an album loses them before what its names share', ['Vindsvept - Night of the Wilds - 01 Dawn', 'Vindsvept - Night of the Wilds - 02 Dusk'], [wilds, wilds], '', 'Night of the Wilds', ['Dawn', 'Dusk'], 'Vindsvept'],
    ['the album\'s name is not offered as the artist', ['Night of the Wilds - 01 Dawn', 'Night of the Wilds - 02 Dusk'], [wilds, wilds], '', 'Night of the Wilds', ['Dawn', 'Dusk'], null],
    ['without folder tags the rule is the website\'s', ['Vindsvept - 05 Tending the Flames'], [[]], '', '', ['Vindsvept - 05 Tending the Flames'], null],
  ] as const)('%s', (_, stems, folders, artist, name, titles, offered) => {
    expect(defaultTrackTitles(stems, artist, name, folders)).toEqual({ titles, artist: offered });
  });

  it('are the folders a file of the Sound library lies in below its root', () => {
    const file = { name: 'Vindsvept - Night of the Wilds - 05 Tending the Flames.mp3', path: 'Vindsvept/Night of the Wilds/Vindsvept - Night of the Wilds - 05 Tending the Flames.mp3' };
    expect(libraryTrackTitles([file], '')).toEqual({ titles: ['Tending the Flames'], artist: 'Vindsvept' });
    expect(libraryTrackTitles([{ ...file, path: file.name }], '')).toEqual({ titles: ['Vindsvept - Night of the Wilds - 05 Tending the Flames'], artist: null });
  });
});
