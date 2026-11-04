import { BUILT_IN_DICE_SETS } from '../../gameSystems/builtInDiceSets';
import { cleanDiceName, parseStoredDiceSet } from '../../gameSystems/diceSetValidation';
import type { ExplodeRule } from '../../types/diceRulesTypes';
import type { AdvantageRule, AdvantageSide, DiceSet, DiceSetDie, RollingDice } from '../../types/diceSetTypes';
import type { RecordStorage, StoredRecord } from '../vaultRecords/recordFolder';
import { t } from '../../i18n';

/** What an edit may change of a set; an `explode`, `advantage` or `disadvantage` given as undefined switches it off. */
export type DiceSetChanges = Partial<Pick<DiceSet, 'name' | 'dice' | 'crit'>> & {
  explode?: ExplodeRule | undefined;
  advantage?: AdvantageRule | undefined;
  disadvantage?: AdvantageRule | undefined;
};

const SIDES: readonly AdvantageSide[] = ['advantage', 'disadvantage'];
/** The fields this Atlas writes of an advantage rule; any other the file holds is a newer Atlas' and stays. */
const RULE_FIELDS = new Set(['kind', 'tensOnly', 'sides', 'name', 'colour', 'value']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A group as stored: what this Atlas sets, over what the file held at its place (fields of a newer Atlas). */
function storedDie(group: DiceSetDie, before: unknown): Record<string, unknown> {
  const { name: _name, colour: _colour, ...kept } = isRecord(before) ? before : {};
  return { ...kept, count: group.count, sides: group.sides, ...(group.name && { name: group.name }), ...(group.colour && { colour: group.colour }) };
}

/** A rule as stored: what this Atlas sets, over the fields of a newer Atlas the stored one held. */
function storedRule(rule: AdvantageRule, before: unknown): Record<string, unknown> {
  const kept = isRecord(before) ? Object.fromEntries(Object.entries(before).filter(([key]) => !RULE_FIELDS.has(key))) : {};
  return { ...kept, ...rule };
}

/** The rules of both sides a new set is made with. */
function advantageOf(rules: RollingDice): Pick<RollingDice, 'advantage' | 'disadvantage'> {
  return {
    ...(rules.advantage && { advantage: { ...rules.advantage } }),
    ...(rules.disadvantage && { disadvantage: { ...rules.disadvantage } }),
  };
}

/**
 * The vault's dice sets: the built-in ones plus those saved in the library's
 * files, which every collection and template may pick. Edits change only the
 * fields they own, so data a newer Atlas added to a set survives an older one
 * editing it; a set a newer Atlas wrote is never changed.
 */
export class DiceSetService {
  constructor(private readonly storage: RecordStorage) {}

  /** Built-in sets first, then the vault's in alphabetical order. */
  list(): DiceSet[] {
    const own = this.storage.entries().map(parseStoredDiceSet).filter((set): set is DiceSet => set !== null);
    const seen = new Set<string>();
    const unique = own.filter((set) => !seen.has(set.id) && Boolean(seen.add(set.id)));
    return [...BUILT_IN_DICE_SETS, ...unique.sort((a, b) => a.name.localeCompare(b.name))];
  }

  /** Why `name` cannot name a set, or null when it can. `exceptId` is the set being renamed. */
  nameError(name: string, exceptId?: string): string | null {
    const clean = cleanDiceName(name);
    if (!clean) return name.trim() ? t('diceLab.nameTooLong') : t('names.enter');
    const key = clean.toLowerCase();
    const taken = this.list().some((set) => set.id !== exceptId && set.name.toLowerCase() === key);
    return taken ? t('diceLab.nameTaken') : null;
  }

  /** A name no set has: `base`, else `base 2`, `base 3`, … */
  freeName(base: string): string {
    let name = base;
    for (let n = 2; this.nameError(name) !== null; n++) name = `${base} ${n}`;
    return name;
  }

  create(name: string, rules: RollingDice): DiceSet {
    const error = this.nameError(name);
    if (error) throw new Error(error);
    const set: DiceSet = {
      id: crypto.randomUUID(),
      name: name.trim(),
      builtIn: false,
      dice: structuredClone([...rules.dice]),
      crit: rules.crit,
      ...(rules.explode && { explode: { ...rules.explode } }),
      ...advantageOf(rules),
    };
    const { builtIn: _builtIn, ...stored } = set;
    this.storage.create({ ...stored, dice: set.dice.map((group) => storedDie(group, undefined)) });
    return set;
  }

  /** A copy of any set, built-in ones too, under a free name: the way to change a built-in. */
  duplicate(id: string, copyName: (name: string) => string): DiceSet | null {
    const source = this.list().find((set) => set.id === id);
    return source ? this.create(this.freeName(copyName(source.name)), source) : null;
  }

  update(id: string, changes: DiceSetChanges): void {
    const set = this.list().find((entry) => entry.id === id);
    if (!set || set.builtIn || set.readOnly) throw new Error(`No editable dice set with id ${id}`);
    if (changes.name !== undefined) {
      const error = this.nameError(changes.name, id);
      if (error) throw new Error(error);
    }
    this.storage.update(id, (stored) => {
      const next: StoredRecord = { ...stored };
      if (changes.name !== undefined) next.name = changes.name.trim();
      if (changes.crit !== undefined) next.crit = changes.crit;
      if (changes.dice !== undefined) {
        const before = Array.isArray(stored.dice) ? stored.dice : [];
        next.dice = changes.dice.map((group, i) => storedDie(group, before[i]));
      }
      if ('explode' in changes) {
        if (changes.explode) next.explode = { ...changes.explode };
        else delete next.explode;
      }
      for (const side of SIDES) {
        if (!(side in changes)) continue;
        const rule = changes[side];
        if (rule) next[side] = storedRule(rule, stored[side]);
        else delete next[side];
      }
      return next;
    });
  }

  /** Collections that picked the set roll their game system's dice again, templates their collection's. */
  delete(id: string): void {
    const set = this.list().find((entry) => entry.id === id);
    if (set && !set.builtIn) this.storage.remove(id);
  }

  /** Calls `listener` whenever a set is saved, renamed or deleted, here or on another device. */
  onChange(listener: () => void): () => void {
    return this.storage.onChange(listener);
  }
}
