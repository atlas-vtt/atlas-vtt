const COMBINING_MARKS = /[\u0300-\u036f]/g;
/** Letters that Unicode does not decompose into a base letter and a mark. */
const UNDECOMPOSED: Readonly<Record<string, string>> = {
  ß: 'ss', æ: 'ae', Æ: 'AE', œ: 'oe', Œ: 'OE', ø: 'o', Ø: 'O', đ: 'd', Đ: 'D', ð: 'd', Ð: 'D',
  ł: 'l', Ł: 'L', þ: 'th', Þ: 'TH', ı: 'i',
};
const UNDECOMPOSED_LETTERS = new RegExp(`[${Object.keys(UNDECOMPOSED).join('')}]`, 'g');

/** "Größe Créature" → "Grosse Creature": accents dropped, ligatures spelled out; other scripts stay as they are. */
export function foldToAscii(text: string): string {
  return text
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .replace(UNDECOMPOSED_LETTERS, (letter) => UNDECOMPOSED[letter] ?? letter);
}
