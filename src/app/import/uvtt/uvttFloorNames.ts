import { t } from '../../i18n';
import { uvttSceneName } from './uvttFileNames';

/**
 * How the floors of one building, exported as one file each, are told apart by their names. What
 * every name starts and ends with is the building's (`Penhew-Foundation-32x40-…-nogrid-lights`);
 * the words between are the floor's: a number (`Inn by the Lake-_00`, `tower_floor_1`,
 * `sorcerers-tower.2`, `L01`), a basement's (`B1`), a name (`Ground`, `Roof`), or both
 * (`01-Ground`). Exporters number from the lowest floor, which is often a cellar.
 */

const WORD = /[^\s_\-.,]+/g;
/** A word that numbers a floor: `0`, `01`, `L2`, `F3`, `lvl4`, `level 5` written as one word, or a basement's `B1`. */
const FLOOR_NUMBER = /^(?:(b)|l|f|lvl|level|floor)?(\d{1,4})$/i;
const BASEMENT = /^(?:basement|cellar)$/i;
const ROOF = /^roofs?$/i;
/** A word that only says what follows is a floor (`tower_floor_0`): no part of the scene's name. */
const FLOOR_WORD = /^(?:floors?|levels?|lvl|storey|story)$/i;

interface Word {
  text: string;
  start: number;
  end: number;
}

function wordsOf(name: string): Word[] {
  return [...name.matchAll(WORD)].map((match) => ({ text: match[0], start: match.index, end: match.index + match[0].length }));
}

const same = (a: Word | undefined, b: Word | undefined): boolean => a !== undefined && b !== undefined && a.text.toLocaleLowerCase() === b.text.toLocaleLowerCase();

/** How many words every name starts with alike, and how many it ends with alike after those. */
function sharedWords(names: readonly Word[][]): { lead: number; tail: number } {
  const shortest = Math.min(...names.map((words) => words.length));
  const [first = []] = names;
  let lead = 0;
  while (lead < shortest && names.every((words) => same(words[lead], first[lead]))) lead++;
  let tail = 0;
  const at = (words: Word[], back: number): Word | undefined => words[words.length - 1 - back];
  while (lead + tail < shortest && names.every((words) => same(at(words, tail), at(first, tail)))) tail++;
  return { lead, tail };
}

/** What a file's name says of its floor: the words that are its own. */
interface FloorLabel {
  /** Where it stands among floors that say theirs: a basement below zero; null where it says none. */
  rank: number | null;
  roof: boolean;
  /** Its words that are no number, as its name writes them; empty where it has none. */
  name: string;
}

function labelOf(words: readonly Word[]): FloorLabel {
  let rank: number | null = null;
  const named: string[] = [];
  for (const { text } of words) {
    const number = FLOOR_NUMBER.exec(text);
    if (number && rank === null) rank = number[1] ? -Number(number[2]) : Number(number[2]);
    else if (!number) named.push(text);
  }
  if (rank === null && named.some((word) => BASEMENT.test(word))) rank = -1;
  return { rank, roof: named.some((word) => ROOF.test(word)), name: named.join(' ') };
}

export interface FloorNaming<T> {
  /** The scene's name: the words every file's name starts with, else the first file's name. */
  sceneName: string;
  /** The files bottom first, each with the name its level gets. */
  floors: { file: T; name: string }[];
}

const capitalised = (text: string): string => text.charAt(0).toLocaleUpperCase() + text.slice(1);

/**
 * The files of one building's floors in the order they stand, bottom first, and names for the
 * scene and each level. Floors stand by the numbers their names give where each gives one of its
 * own (a basement's below the rest), else by name, numbers within names compared as numbers; a
 * roof goes on top. A level is named by what its file's name says beyond the number (`Ground`,
 * `Basement`), else by its place (`Level 1` at the bottom): nothing in a file tells which floor
 * is the ground floor.
 */
export function floorNaming<T extends { fileName: string }>(files: readonly T[]): FloorNaming<T> {
  const names = files.map((file) => uvttSceneName(file.fileName));
  const words = names.map(wordsOf);
  const { lead, tail } = sharedWords(words);
  const labels = words.map((own) => labelOf(own.slice(lead, own.length - tail)));
  const ranks = labels.map((label) => label.rank);
  const ranked = ranks.every((rank) => rank !== null) && new Set(ranks).size === ranks.length;

  const order = files.map((_, index) => index).sort((a, b) => ranked
    ? ranks[a]! - ranks[b]!
    : names[a]!.localeCompare(names[b]!, undefined, { numeric: true, sensitivity: 'base' }));
  const bottomFirst = [...order.filter((index) => !labels[index]!.roof), ...order.filter((index) => labels[index]!.roof)];

  // Without the words that only say a floor follows, unless they are all the names share
  let named = lead;
  while (named > 0 && FLOOR_WORD.test(words[0]![named - 1]!.text)) named--;
  const kept = named > 0 ? named : lead;
  const sceneEnd = kept > 0 ? words[0]![kept - 1]!.end : 0;
  const sceneName = sceneEnd > 0 ? names[0]!.slice(0, sceneEnd) : names[bottomFirst[0]!] ?? '';
  return {
    sceneName,
    floors: bottomFirst.map((index, place) => ({
      file: files[index]!,
      name: labels[index]!.name ? capitalised(labels[index]!.name) : t('levels.newName', { n: place + 1 }),
    })),
  };
}
