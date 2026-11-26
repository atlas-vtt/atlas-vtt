/**
 * The ids of the built-in game systems that files in users' vaults name. Each list below is
 * written out, so a renamed id fails here instead of orphaning what a vault stored under it.
 * Sense ids are held by `src/app/gameSystems/__tests__/builtInSenses.test.ts`, the ids of every
 * light table by `src/app/gameSystems/__tests__/lightPresets.test.ts`, dice set ids by
 * `tests/unit/diceSets/diceSetModel.test.ts`, role ids by `tests/unit/statblocks/roles/` and the
 * built-in statblock templates with their field keys by
 * `tests/unit/statblocks/presets/builtInSnapshot.test.ts`.
 */
import { describe, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../../src/app/gameSystems/builtInPresets';
import type { SystemPreset } from '../../../src/app/types/systemPresetTypes';
import { expectStoredIdGroups, expectStoredIds } from './storedIdList';

const perPreset = (ids: (preset: SystemPreset) => readonly string[]): Record<string, readonly string[]> =>
  Object.fromEntries(BUILT_IN_SYSTEM_PRESETS.map((preset) => [preset.id, ids(preset)]));

const PRESET_IDS = [
  'builtin:cairn',
  'builtin:coc7e',
  'builtin:cyberpunkred',
  'builtin:daggerheart',
  'builtin:dnd5e',
  'builtin:drawsteel',
  'builtin:ose',
  'builtin:pathfinder2e',
  'builtin:shadowdark',
];

/** A condition's id is made from its preset's key and its name, so renaming a condition renames its id. */
const CONDITION_IDS: Record<string, string[]> = {
  'builtin:cairn': [
    'cairn-critical-damage',
    'cairn-delirious',
    'cairn-deprived',
    'cairn-fatigue',
    'cairn-fleeing',
    'cairn-paralyzed',
  ],
  'builtin:coc7e': [
    'coc7e-bout-of-madness',
    'coc7e-dead',
    'coc7e-dying',
    'coc7e-indefinite-insanity',
    'coc7e-major-wound',
    'coc7e-prone',
    'coc7e-stunned',
    'coc7e-temporary-insanity',
    'coc7e-unconscious',
  ],
  'builtin:cyberpunkred': [
    'cyberpunkred-critical-injury',
    'cyberpunkred-damaged-ear',
    'cyberpunkred-damaged-eye',
    'cyberpunkred-grappled',
    'cyberpunkred-mortally-wounded',
    'cyberpunkred-on-fire',
    'cyberpunkred-prone',
    'cyberpunkred-seriously-wounded',
    'cyberpunkred-unconscious',
  ],
  'builtin:daggerheart': [
    'daggerheart-hidden',
    'daggerheart-restrained',
    'daggerheart-vulnerable',
  ],
  'builtin:dnd5e': [
    'dnd5e-blinded',
    'dnd5e-charmed',
    'dnd5e-deafened',
    'dnd5e-exhaustion',
    'dnd5e-frightened',
    'dnd5e-grappled',
    'dnd5e-incapacitated',
    'dnd5e-invisible',
    'dnd5e-paralyzed',
    'dnd5e-petrified',
    'dnd5e-poisoned',
    'dnd5e-prone',
    'dnd5e-restrained',
    'dnd5e-stunned',
    'dnd5e-unconscious',
  ],
  'builtin:drawsteel': [
    'drawsteel-bleeding',
    'drawsteel-dazed',
    'drawsteel-frightened',
    'drawsteel-grabbed',
    'drawsteel-prone',
    'drawsteel-restrained',
    'drawsteel-slowed',
    'drawsteel-taunted',
    'drawsteel-weakened',
  ],
  'builtin:ose': [
    'ose-asleep',
    'ose-blinded',
    'ose-charmed',
    'ose-entangled',
    'ose-fleeing',
    'ose-invisible',
    'ose-paralysed',
    'ose-petrified',
    'ose-surprised',
  ],
  'builtin:pathfinder2e': [
    'pathfinder2e-blinded',
    'pathfinder2e-clumsy',
    'pathfinder2e-concealed',
    'pathfinder2e-confused',
    'pathfinder2e-controlled',
    'pathfinder2e-dazzled',
    'pathfinder2e-deafened',
    'pathfinder2e-doomed',
    'pathfinder2e-drained',
    'pathfinder2e-dying',
    'pathfinder2e-encumbered',
    'pathfinder2e-enfeebled',
    'pathfinder2e-fascinated',
    'pathfinder2e-fatigued',
    'pathfinder2e-fleeing',
    'pathfinder2e-frightened',
    'pathfinder2e-grabbed',
    'pathfinder2e-hidden',
    'pathfinder2e-immobilized',
    'pathfinder2e-invisible',
    'pathfinder2e-off-guard',
    'pathfinder2e-paralyzed',
    'pathfinder2e-persistent-damage',
    'pathfinder2e-petrified',
    'pathfinder2e-prone',
    'pathfinder2e-quickened',
    'pathfinder2e-restrained',
    'pathfinder2e-sickened',
    'pathfinder2e-slowed',
    'pathfinder2e-stunned',
    'pathfinder2e-stupefied',
    'pathfinder2e-unconscious',
    'pathfinder2e-undetected',
    'pathfinder2e-unnoticed',
    'pathfinder2e-wounded',
  ],
  'builtin:shadowdark': [
    'shadowdark-blinded',
    'shadowdark-deafened',
    'shadowdark-dying',
    'shadowdark-focus',
    'shadowdark-hidden',
    'shadowdark-immobilized',
    'shadowdark-invisible',
    'shadowdark-paralyzed',
    'shadowdark-surprised',
    'shadowdark-unconscious',
  ],
};

const RESOURCE_KEYS: Record<string, string[]> = {
  'builtin:cairn': ['hp', 'str'],
  'builtin:coc7e': ['hp'],
  'builtin:cyberpunkred': ['hp'],
  'builtin:daggerheart': ['hp', 'stress'],
  'builtin:dnd5e': ['hp'],
  'builtin:drawsteel': ['hp'],
  'builtin:ose': ['hp'],
  'builtin:pathfinder2e': ['hp'],
  'builtin:shadowdark': ['hp'],
};

const WIDGET_IDS: Record<string, string[]> = {
  'builtin:shadowdark': ['shadowdark-torch'],
};

/** The systems whose light table `lightPresets.test.ts` writes out, id by id. */
const PRESETS_WITH_PINNED_LIGHTS = [
  'builtin:cairn',
  'builtin:dnd5e',
  'builtin:ose',
  'builtin:pathfinder2e',
  'builtin:shadowdark',
];

describe('ids of the built-in game systems that vault files name: a list only grows, and no id on it is renamed or removed', () => {
  it('keeps every built-in preset id, which collections and campaigns record as their game system', () => {
    expectStoredIds(
      { what: 'Built-in game system preset ids', namedBy: 'Collections (`systemPresetId` in `collection.json`) and campaigns (`campaign.json`)' },
      BUILT_IN_SYSTEM_PRESETS.map((preset) => preset.id),
      PRESET_IDS,
    );
  });

  it('keeps every built-in condition id, which tokens on maps record: renaming a condition renames its id', () => {
    expectStoredIdGroups(
      { what: 'Built-in condition ids', namedBy: 'Tokens in scenes, snapshots and encounters (`conditions`, `conditionValues`) and collections that took the preset' },
      perPreset((preset) => preset.rules.conditions.map((condition) => condition.id)),
      CONDITION_IDS,
    );
  });

  it('keeps the key of every built-in resource, under which tokens hold its value', () => {
    expectStoredIdGroups(
      { what: 'Built-in resource keys', namedBy: "Tokens in scenes (`resources`) and a campaign's `characters.json`" },
      perPreset((preset) => (preset.rules.resources ?? []).map((resource) => resource.key)),
      RESOURCE_KEYS,
    );
  });

  it("keeps the id of every widget a built-in preset brings, by which a collection's copy is known as the preset's", () => {
    expectStoredIdGroups(
      { what: 'Built-in preset widget ids', namedBy: 'Collections (`widgets` in `collection.json`) and scenes' },
      perPreset((preset) => (preset.rules.widgets ?? []).map((widget) => widget.id)),
      WIDGET_IDS,
    );
  });

  it('has the light ids of every system with a light table written out in lightPresets.test.ts', () => {
    expectStoredIds(
      {
        what: 'Game systems whose light preset ids src/app/gameSystems/__tests__/lightPresets.test.ts writes out (write a new table out there first)',
        namedBy: 'Lights on maps and tokens (`emission.preset`)',
      },
      BUILT_IN_SYSTEM_PRESETS.filter((preset) => preset.rules.lightPresets).map((preset) => preset.id),
      PRESETS_WITH_PINNED_LIGHTS,
    );
  });
});
