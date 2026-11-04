/** Table notes as GMs write them, shortened from the test vault's Cairn background and 5e adventure. */

export const AURIFEX_NOTE = `---
source: "https://cairnrpg.com/second-edition/backgrounds/aurifex/"
license: "CC BY-SA 4.0"
---

> You are an artisan of the arcane.

## Starting Gear

- 3d6 Gold Pieces

## What went horribly wrong? Roll 1d6:

|       |                                                                       |
| ----- | --------------------------------------------------------------------- |
| **1** | There was an explosion. Take a **Tin of Snuff** (6 uses).             |
| **2** | You dematerialized a beloved pet.                                     |
| **3** | You were exposed to a long-acting truth serum.                        |
| **4** | You were adept at creating _fake_ gold. Take a heavy **Metal Ingot**. |
| **5** | A rival stole the blueprint. Take a prototype **Blunderbuss** (d12).  |
| **6** | Take a bottle of **Universal Solvent** (2 uses).                      |

## What alchemical marvel is the product of your latest ingenuity? Roll 1d6:

|       |                    |                                              |
| ----- | ------------------ | -------------------------------------------- |
| **1** | **Pyrophoric Gel** | A sticky green fluid (1 use).                |
| **2** | **Blast Sphere**   | A head-sized iron ball (d12, _blast_).       |
| **3** | **Aqua Vita**      | Purifies any liquid. Cures 1d6 STR (1 use).  |
| **4** | **Mimic Stone**    | Records a short phrase.                      |
| **5** | **Spark Dust**     | Ignites easily and quickly (3 uses).         |
| **6** | **Homunculus**     | A miniature clay replica of yourself.        |
`;

export const BREW_NOTE = `# A Most Potent Brew

## 🎲 Random Tunnel Encounters

Roll a d6 once when the party first enters the old tunnels.

![[Blue Mouth Caves.atlasmap#]]

| d6 | Encounter |
| --- | --- |
| 1 | 2 [[Bestiary/5e SRD/Creatures/Giant Rat\\|Giant Rats]] fighting over a dead centipede |
| 2 | A brewery cat, Mustard, who hisses at hidden things |
| 3 | The smell attracts 1 [[Bestiary/5e SRD/Creatures/Swarm of Rats|Swarm of Rats]] |
| 4 | A ghostly whisper repeats the first line of the riddle |
| 5 | A 10 ft. fall (1d6 bludgeoning) into a dry cistern with 5 gp |
| 6 | Nothing but warm air |

---

## 🗣️ Rumours in the Taproom

| d6 | Rumour | True? |
| --- | --- | --- |
| 1 | "The brewery was built on the stones of a wizard's tower." | ✅ |
| 2 | "Hilda waters her ale down with holy water." | ❌ |
| 3 | "The old wizard kept a pet that ate fire." | ✅ |
| 4 | "The rats are a curse from the rival brewery." | ❌ |
| 5 | "Workers hear crackling behind the cellar wall." | ✅ |
| 6 | "Whatever's down there spits flame." | ✅ (partly) |
`;

/** A d100 table as books print it: two-digit ranges and 00 for 100. */
export const D100_NOTE = `## Trinkets

| d100 | Trinket |
| --- | --- |
| 01–05 | A mummified goblin hand |
| 06–50 | A crystal that faintly glows |
| 51-99 | A tiny silver bell |
| 00 | A deck of cards with one missing |
`;

/** A 2d6 reaction table with open ends. */
export const REACTION_NOTE = `## Reaction

| 2d6 | Reaction |
| --- | --- |
| 2 or less | Attacks |
| 3–5 | Hostile |
| 6–8 | Uncertain |
| 9–11 | Indifferent |
| 12+ | Eager |
`;

/** 36 rows numbered 11 to 66, without a die in the header. */
export function d66Note(): string {
  const rows: string[] = [];
  for (let tens = 1; tens <= 6; tens++) {
    for (let ones = 1; ones <= 6; ones++) rows.push(`| ${tens}${ones} | Name ${tens}${ones} |`);
  }
  return ['## Names', '', '| Roll | Name |', '| --- | --- |', ...rows].join('\n');
}

/** Dice Roller's lookup table: a `dice: 1d20` header and a list row. */
export const DICE_ROLLER_NOTE = `| dice: 1d20 | Weather |
| --- | --- |
| 1-12 | Clear |
| 13,14 | Rain |
| 15-19 | Fog |
| 20 | Storm |
`;
