import type { StatblockLayout } from '../../src/app/react/components/statblock/statblockTypes';
import type { ResourceDefinition } from '../../src/app/resources/resourceTypes';
import type { TokenVitals } from '../../src/app/services/statblockVitalsSync';
import basic5eLayout from './fantasy-statblocks/basic-5e-layout.json';
import daggerheartLayout from './fantasy-statblocks/daggerheart-adversary.json';
import pf2eLayout from './fantasy-statblocks/pf2e-creature-layout.json';

/**
 * Five statblocks of different kinds as the DM screen draws them: one of Atlas's own templates, one with
 * the auto template, and creatures of Fantasy Statblocks' own layouts (5e, Pathfinder 2e, and Daggerheart,
 * whose layout runs a script). The layouts are Fantasy Statblocks' as it ships them (MIT, see
 * `fantasy-statblocks/LICENSE`); the creatures are made up.
 */
export type StatblockScenarioId = 'native' | 'auto' | 'fs-5e' | 'fs-pf2e' | 'fs-daggerheart';

export interface StatblockScenario {
  readonly id: StatblockScenarioId;
  readonly path: string;
  readonly note: string;
  /** Fantasy Statblocks loaded with these layouts and this bestiary creature; null where it is not installed. */
  readonly fantasy: { readonly layouts: readonly StatblockLayout[]; readonly creature: Record<string, unknown> } | null;
  readonly tokens: readonly TokenVitals[];
}

export const LAYOUTS = {
  basic5e: basic5eLayout as StatblockLayout,
  pf2e: pf2eLayout as StatblockLayout,
  daggerheart: daggerheartLayout as StatblockLayout,
} as const;

export const TOKEN_ART = 'Art/Marsh Hag.png';

export const HIT_POINTS: ResourceDefinition = { key: 'hp', name: 'HP', field: 'hp', direction: 'drains', color: '#c94f4f', defeatedWhenSpent: true, visibleToPlayers: false };
export const STRESS: ResourceDefinition = { key: 'stress', name: 'Stress', field: 'stress', direction: 'fills', color: '#7a5fc4', visibleToPlayers: false };

const LONG_DESCRIPTION = [
  'The lurker hides in **still water** and waits for prey to wade close. When it strikes, it *drags* its victim under.',
  '',
  'It keeps a hoard of [[Sunken Relics]] and will trade one for safe passage, as described in [the almanac](https://example.org/almanac).',
  '',
  '- It hates fire.',
  '- It cannot leave the marsh for long.',
  '',
  'A creature grappled by it takes 2d6 + 3 bludgeoning damage at the start of each of its turns.',
].join('\n');

const NATIVE_NOTE = `---
statblock: true
atlas-template: builtin:5e-2014-monster
name: Marsh Hag
image: "[[${TOKEN_ART}]]"
size: Medium
type: fey
alignment: neutral evil
ac: 17
hp: 82
hit_dice: 11d8+33
speed: 30 ft., swim 30 ft.
stats: [18, 12, 16, 13, 14, 16]
saves:
  - wisdom: 5
skillsaves:
  - deception: 6
  - stealth: 4
senses: darkvision 60 ft., passive Perception 14
languages: Common, Sylvan
cr: 3
traits:
  - name: Amphibious
    desc: The hag can breathe air and water.
  - name: Mimicry
    desc: The hag can mimic animal sounds and humanoid voices. A creature that hears the sounds can tell they are imitations with a successful DC 14 Wisdom (Insight) check.
actions:
  - name: Claws
    desc: "*Melee Weapon Attack:* +6 to hit, reach 5 ft., one target. *Hit:* 13 (2d8 + 4) slashing damage."
  - name: Drowning Curse
    desc: The hag targets one creature it can see within 30 feet. The target must succeed on a DC 13 Constitution saving throw or take 3d6 necrotic damage.
---
The marsh hag rules the reeds.
`;

const AUTO_NOTE = `---
statblock: true
name: Bog Lurker
level: 4
armour: 14
hp: 38
speed: 20 ft., swim 40 ft.
attack: "Bite +7 (2d6 + 3 piercing)"
description: |
${LONG_DESCRIPTION.split('\n').map((line) => `  ${line}`).join('\n')}
abilities:
  - name: Ambush
    desc: The lurker has advantage on attacks against creatures that have not acted yet.
---
`;

const FS_5E_CREATURE = {
  name: 'Reed Stalker',
  path: 'Bestiary/Reed Stalker.md',
  layout: 'Basic 5e Layout',
  size: 'Large',
  type: 'monstrosity',
  alignment: 'unaligned',
  ac: 13,
  hp: 59,
  hit_dice: '7d10+21',
  speed: '40 ft., swim 30 ft.',
  stats: [17, 14, 16, 3, 12, 6],
  skillsaves: [{ perception: 3 }, { stealth: 6 }],
  senses: 'darkvision 60 ft., passive Perception 13',
  languages: '—',
  cr: '3',
  traits: [
    { name: 'Hold Breath', desc: 'The stalker can hold its breath for 30 minutes.' },
    { name: 'Lurker', desc: LONG_DESCRIPTION },
  ],
  actions: [
    { name: 'Multiattack', desc: 'The stalker makes two attacks: one with its bite and one with its tail.' },
    { name: 'Bite', desc: '*Melee Weapon Attack:* +5 to hit, reach 5 ft., one target. *Hit:* 10 (2d6 + 3) piercing damage.' },
    { name: 'Tail', desc: '*Melee Weapon Attack:* +5 to hit, reach 10 ft., one target. *Hit:* 8 (1d10 + 3) bludgeoning damage.' },
  ],
};

const FS_PF2E_CREATURE = {
  name: 'Mire Wisp',
  path: 'Bestiary/Mire Wisp.md',
  layout: 'Pathfinder 2e Creature Layout',
  level: 3,
  rarity: 'Uncommon',
  size: 'Small',
  trait_01: 'Air',
  trait_02: 'Spirit',
  modifier: 9,
  senses: 'darkvision',
  languages: 'Aklo',
  skills: [{ Acrobatics: 10 }, { Stealth: 11 }],
  attributes: [{ Str: -1 }, { Dex: 4 }, { Con: 1 }, { Int: 0 }, { Wis: 2 }, { Cha: 3 }],
  ac: 19,
  saves: [{ Fort: 7 }, { Ref: 12 }, { Will: 9 }],
  hp: 40,
  immunities: 'disease, poison',
  speed: 'fly 40 feet',
  attacks: [
    { name: 'Melee', desc: '[one-action] shock +11 (agile, finesse), **Damage** 2d6 + 2 electricity' },
  ],
  abilities_bot: [
    { name: 'Glow', desc: 'The wisp sheds dim light in a 20-foot radius.' },
  ],
  sourcebook: 'Made up for a test',
};

const FS_DAGGERHEART_CREATURE = {
  name: 'Thornback Brute',
  path: 'Bestiary/Thornback Brute.md',
  layout: 'Daggerheart Adversary',
  tier: 2,
  type: 'Bruiser',
  description: 'A hulking beast covered in thorny bark.',
  motives_and_tactics: 'Charge, crush, guard its grove',
  difficulty: 14,
  thresholds: '10/20',
  hp: 6,
  stress: 3,
  atk: '+3',
  attack: 'Thorned Fists',
  range: 'Melee',
  damage: '2d10+3 phy',
  experience: 'Grove Guardian +2',
  feats: [
    { name: 'Thorn Hide - Passive', desc: 'When a creature makes a successful attack against the brute from within Melee range, it takes 1d6 physical damage.' },
    { name: 'Crushing Charge - Action', desc: 'Spend a Fear to move far and make an attack against every target in its path.' },
  ],
};

const fsNote = (creature: { name: string }): string => `---\nstatblock: true\nname: ${creature.name}\n---\n`;

export const STATBLOCK_SCENARIOS: readonly StatblockScenario[] = [
  {
    id: 'native',
    path: 'Bestiary/Marsh Hag.md',
    note: NATIVE_NOTE,
    fantasy: null,
    tokens: [
      { id: 'hag-1', name: 'Marsh Hag', imagePath: TOKEN_ART, showRing: true, ringColor: '#3a7d44', resources: { hp: { current: 61, max: 82 } } },
    ],
  },
  { id: 'auto', path: 'Bestiary/Bog Lurker.md', note: AUTO_NOTE, fantasy: null, tokens: [{ id: 'lurker-1', name: 'Bog Lurker', resources: { hp: { current: 38, max: 38 } } }] },
  {
    id: 'fs-5e',
    path: FS_5E_CREATURE.path,
    note: fsNote(FS_5E_CREATURE),
    fantasy: { layouts: [LAYOUTS.basic5e, LAYOUTS.pf2e, LAYOUTS.daggerheart], creature: FS_5E_CREATURE },
    tokens: [
      { id: 'stalker-1', name: 'Reed Stalker', instanceNumber: 1, resources: { hp: { current: 59, max: 59 } } },
      { id: 'stalker-2', name: 'Reed Stalker', instanceNumber: 2, resources: { hp: { current: 12, max: 59 } } },
    ],
  },
  {
    id: 'fs-pf2e',
    path: FS_PF2E_CREATURE.path,
    note: fsNote(FS_PF2E_CREATURE),
    fantasy: { layouts: [LAYOUTS.basic5e, LAYOUTS.pf2e, LAYOUTS.daggerheart], creature: FS_PF2E_CREATURE },
    tokens: [{ id: 'wisp-1', name: 'Mire Wisp', resources: { hp: { current: 40, max: 40 } } }],
  },
  {
    id: 'fs-daggerheart',
    path: FS_DAGGERHEART_CREATURE.path,
    note: fsNote(FS_DAGGERHEART_CREATURE),
    fantasy: { layouts: [LAYOUTS.basic5e, LAYOUTS.pf2e, LAYOUTS.daggerheart], creature: FS_DAGGERHEART_CREATURE },
    tokens: [{ id: 'brute-1', name: 'Thornback Brute', resources: { hp: { current: 4, max: 6 }, stress: { current: 1, max: 3 } } }],
  },
];
