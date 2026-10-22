/**
 * Editing a collection's senses: a new sense, which ones Atlas ships, what is wrong with one,
 * and what it does in plain words.
 */

import { t, type MessageKey } from '../i18n';
import type { SenseDefinition, SenseLook } from '../types/senseTypes';
import { BUILT_IN_SYSTEM_PRESETS } from './builtInPresets';
import { sameSenses } from './senseRules';
import { GENERIC_SENSES } from './senses/generic';
import { granting } from './senses/senseHelpers';

/** A sense of its own, or an entry that only lets the token's sight see invisible tokens. */
export type SenseKind = 'sense' | 'see-invisible';

export function senseKind(sense: SenseDefinition): SenseKind {
  return sense.grants ?? 'sense';
}

/**
 * `sense` as the other kind, keeping its id, name and description: a modifier has the fixed
 * fields every modifier has (`granting`), and a sense made from one starts as a new sense does.
 */
export function withSenseKind(sense: SenseDefinition, kind: SenseKind): SenseDefinition {
  if (kind === senseKind(sense)) return sense;
  const named = { id: sense.id, name: sense.name, description: sense.description };
  return kind === 'see-invisible' ? { ...named, ...granting('see-invisible') } : { ...newSense(sense.id), ...named };
}

/** Whether a token gives the sense a distance. */
export function takesRange(sense: SenseDefinition): boolean {
  return senseKind(sense) === 'sense' && sense.range !== 'unlimited';
}

/** A sense a GM starts from: a way of seeing in the dark, in grey, that needs a range. */
export function newSense(id: string): SenseDefinition {
  return {
    id,
    name: '',
    description: '',
    lineOfSight: true,
    sees: { bright: 'normal', dim: 'normal', dark: 'as-dim', magicalDark: 'none' },
    look: 'monochrome',
    reveals: 'all',
    precise: true,
    seesInvisible: false,
    worksWhileBlinded: false,
    range: 'required',
  };
}

const SHIPPED_SENSES: readonly SenseDefinition[] = [
  ...GENERIC_SENSES,
  ...BUILT_IN_SYSTEM_PRESETS.flatMap((preset) => preset.rules.senses ?? []),
];

/** Whether `sense` is one Atlas ships, unchanged. Those are shown, never edited. */
export function isBuiltInSense(sense: SenseDefinition): boolean {
  return SHIPPED_SENSES.some((shipped) => shipped.id === sense.id && sameSenses([shipped], [sense]));
}

/** What is wrong with the name of `sense` among `all` the collection's senses, or null. */
export function senseNameProblem(sense: SenseDefinition, all: readonly SenseDefinition[]): string | null {
  const name = sense.name.trim().toLowerCase();
  if (!name) return t('senses.problem.nameMissing');
  return all.some((other) => other.id !== sense.id && other.name.trim().toLowerCase() === name) ? t('senses.problem.nameTaken') : null;
}

/** Why `sense` cannot be saved among `all` the collection's senses, or null when it can. */
export function senseProblem(sense: SenseDefinition, all: readonly SenseDefinition[]): string | null {
  const nameProblem = senseNameProblem(sense, all);
  if (nameProblem) return nameProblem;
  const { bright, dim, dark, magicalDark } = sense.sees;
  const perceivesNothing = senseKind(sense) === 'sense' && [bright, dim, dark, magicalDark].every((seeing) => seeing === 'none');
  return perceivesNothing ? t('senses.problem.noLight') : null;
}

/** Whether every sense of the collection's own can be saved; the ones Atlas ships always can. */
export function sensesAreValid(senses: readonly SenseDefinition[]): boolean {
  return senses.every((sense) => isBuiltInSense(sense) || senseProblem(sense, senses) === null);
}

/** How a sense that sees in the dark draws it, where that is not in colour. */
const LOOK_WORDS: Record<SenseLook, MessageKey | null> = {
  colour: null,
  monochrome: 'senses.describe.grey',
  'black-and-white': 'senses.describe.blackWhite',
  heat: 'senses.describe.heat',
};

/** What a sense that shows the map sees, as the start of its line. */
function seeingWords({ dim, dark }: SenseDefinition['sees']): MessageKey {
  if (dim === 'as-bright') {
    if (dark === 'as-dim') return 'senses.describe.dimBrightDarkDim';
    return dark === 'as-bright' ? 'senses.describe.dimBrightDarkBright' : 'senses.describe.dimBright';
  }
  if (dark === 'as-dim') return 'senses.describe.darkDim';
  return dark === 'as-bright' ? 'senses.describe.darkBright' : 'senses.describe.lit';
}

/**
 * What the sense does, in one line of plain words, from its fields: what it perceives, then
 * how as a list of remarks, then what else holds, each a text of its own.
 */
export function describeSense(sense: SenseDefinition): string {
  if (senseKind(sense) === 'see-invisible') return t('senses.describe.modifier');
  const creaturesOnly = sense.reveals === 'creatures';
  const ranged = sense.range !== 'unlimited';
  const look = !creaturesOnly && sense.sees.dark !== 'none' ? LOOK_WORDS[sense.look] : null;
  const remarks: (MessageKey | null)[] = [
    creaturesOnly ? (ranged ? 'senses.describe.creaturesInRange' : 'senses.describe.creatures') : seeingWords(sense.sees),
    look,
    !creaturesOnly && ranged ? 'senses.describe.inRange' : null,
    sense.lineOfSight ? null : 'senses.describe.throughWalls',
    sense.seesInvisible ? (creaturesOnly ? 'senses.describe.invisibleOnes' : 'senses.describe.invisibleCreatures') : null,
  ];
  const sentences = [
    `${remarks.filter((key) => key !== null).map((key) => t(key)).join(', ')}.`,
    ...(sense.worksWhileBlinded ? [t('senses.describe.whileBlinded')] : []),
    ...(sense.precise ? [] : [t('senses.describe.outlines')]),
  ];
  return sentences.join(' ');
}

/** The line a list shows under the sense's name: its own description, else what its fields say. */
export function senseSummary(sense: SenseDefinition): string {
  return sense.description.trim() || describeSense(sense);
}

/**
 * What the collection stores after an edit of its senses: `next`, or nothing while it equals
 * the senses of its game system (`system`; none is the generic set), so an untouched collection
 * keeps following its preset.
 */
export function editedSenses(
  next: readonly SenseDefinition[],
  system: readonly SenseDefinition[] | undefined,
): readonly SenseDefinition[] | undefined {
  return sameSenses(next, system) ? undefined : next;
}
