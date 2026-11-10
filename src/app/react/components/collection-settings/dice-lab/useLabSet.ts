import { useCallback, useEffect, useRef, useState } from 'react';
import { parseExplodeRule } from '../../../../gameSystems/diceRules';
import { parseAdvantageRule } from '../../../../gameSystems/diceSetValidation';
import type { DiceSetChanges, DiceSetService } from '../../../../services/diceSets/DiceSetService';
import type { CritRule, ExplodeRule } from '../../../../types/diceRulesTypes';
import type { AdvantageRule, AdvantageSide, DiceSet, RollingDice } from '../../../../types/diceSetTypes';
import { diceLimit, diceOfGroups, groupsOfDice, type LabDie } from './labDice';

/** The set open in the lab, as it is being changed. */
export interface LabDraft {
  name: string;
  dice: LabDie[];
  crit: CritRule;
  explode?: ExplodeRule | undefined;
  /** As edited: a number or a die's name may be half typed. */
  advantage?: AdvantageRule | undefined;
  disadvantage?: AdvantageRule | undefined;
}

const SIDES: readonly AdvantageSide[] = ['advantage', 'disadvantage'];

/** The rule of a side as it is saved (a die's name trimmed); null where it cannot be yet, undefined for none. */
function savedRule(rule: AdvantageRule | undefined): AdvantageRule | null | undefined {
  return rule === undefined ? undefined : parseAdvantageRule(rule);
}

/** The rules of both sides as a set is made with them. */
function advantageRules(draft: LabDraft): Pick<RollingDice, 'advantage' | 'disadvantage'> {
  const advantage = savedRule(draft.advantage);
  const disadvantage = savedRule(draft.disadvantage);
  return { ...(advantage && { advantage }), ...(disadvantage && { disadvantage }) };
}

/** A set not saved yet: the lab's New set, written once it has a die. */
export interface NewSetStart {
  name: string;
  crit: CritRule;
}

/** How an edit is written: at once (a click), or once typing rests (a name). */
export type EditPace = 'now' | 'typing';

/** How long typing rests before the set is written: every write is a file write that syncs. */
const SAVE_AFTER_MS = 400;

function draftOf(set: DiceSet | null, start: NewSetStart): LabDraft {
  if (!set) return { name: start.name, dice: [], crit: start.crit };
  return {
    name: set.name,
    dice: diceOfGroups(set.dice),
    crit: set.crit,
    ...(set.explode && { explode: set.explode }),
    ...(set.advantage && { advantage: set.advantage }),
    ...(set.disadvantage && { disadvantage: set.disadvantage }),
  };
}

/** Which parts of a draft can be written: a part that cannot waits, and the others go ahead. */
interface Writable {
  name: boolean;
  dice: boolean;
  explode: boolean;
  advantage: boolean;
  disadvantage: boolean;
}

function writable(draft: LabDraft, nameError: string | null): Writable {
  return {
    name: nameError === null,
    dice: draft.dice.length > 0 && diceLimit(draft.dice) === null,
    explode: draft.explode === undefined || parseExplodeRule(draft.explode) !== null,
    advantage: savedRule(draft.advantage) !== null,
    disadvantage: savedRule(draft.disadvantage) !== null,
  };
}

/** What `draft` changes of `set` that can be written, or null for nothing. */
function changesOf(draft: LabDraft, set: DiceSet, can: Writable): DiceSetChanges | null {
  const dice = groupsOfDice(draft.dice);
  const changes: DiceSetChanges = {};
  if (can.name && draft.name.trim() !== set.name) changes.name = draft.name;
  if (can.dice && JSON.stringify(dice) !== JSON.stringify(set.dice)) changes.dice = dice;
  if (draft.crit !== set.crit) changes.crit = draft.crit;
  if (can.explode && JSON.stringify(draft.explode) !== JSON.stringify(set.explode)) changes.explode = draft.explode;
  for (const side of SIDES) {
    const rule = savedRule(draft[side]) ?? undefined;
    if (can[side] && JSON.stringify(rule) !== JSON.stringify(set[side])) changes[side] = rule;
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

export interface LabSet {
  draft: LabDraft;
  edit: (change: Partial<LabDraft>, pace: EditPace) => void;
  /** Why the name cannot be saved, or null. */
  nameError: string | null;
  /** Whether the set can be changed: not built in, not from a newer Atlas, a library to write to. */
  editable: boolean;
}

/**
 * The set open in the dice lab, as it is changed. A click is written to the
 * library at once, typing once it rests; what cannot be written (a name another
 * set has, a face count half typed, dice past a limit) waits. A new set is
 * created with its first die. A built-in set or one from a newer Atlas is never
 * written. Whatever waits is written when the lab moves to another set or closes.
 */
export function useLabSet(service: DiceSetService | null, set: DiceSet | null, start: NewSetStart, onCreated: (set: DiceSet) => void): LabSet {
  const [draft, setDraft] = useState(() => draftOf(set, start));
  const current = useRef(draft);
  /** The set the draft is written to: `set`, or the one created from a new set. */
  const target = useRef<string | null>(set?.id ?? null);
  const timer = useRef<number | null>(null);
  const editable = service !== null && !set?.builtIn && !set?.readOnly;

  const nameErrorOf = useCallback((name: string): string | null => (service ? service.nameError(name, target.current ?? undefined) : null), [service]);

  const write = useCallback((): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    const next = current.current;
    if (!service || !editable) return;
    const can = writable(next, nameErrorOf(next.name));
    if (target.current === null) {
      // A new set is made whole: with its name, its first dice and its rules.
      if (!can.name || !can.dice || !can.explode || !can.advantage || !can.disadvantage) return;
      const created = service.create(next.name, {
        dice: groupsOfDice(next.dice),
        crit: next.crit,
        ...(next.explode && { explode: next.explode }),
        ...advantageRules(next),
      });
      target.current = created.id;
      onCreated(created);
      return;
    }
    // A set deleted meanwhile (here, or on another device) takes nothing.
    const stored = service.list().find((entry) => entry.id === target.current);
    const changes = stored ? changesOf(next, stored, can) : null;
    if (stored && changes) service.update(stored.id, changes);
  }, [service, editable, nameErrorOf, onCreated]);

  const edit = useCallback((change: Partial<LabDraft>, pace: EditPace): void => {
    if (!editable) return;
    current.current = { ...current.current, ...change };
    setDraft(current.current);
    if (pace === 'now') {
      write();
      return;
    }
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(write, SAVE_AFTER_MS);
  }, [editable, write]);

  // Whatever waits is written as the lab moves to another set or closes.
  const pending = useRef(write);
  pending.current = write;
  useEffect(() => () => { if (timer.current !== null) pending.current(); }, []);

  return { draft, edit, nameError: editable ? nameErrorOf(draft.name) : null, editable };
}
